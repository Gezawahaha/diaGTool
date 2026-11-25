import type { TokenResponse } from '@axs/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { toStorageError } from '../lib/d1Errors';
import { bytesToBase64Url, randomBytes, sha256Hex } from '../lib/encoding';
import { ApiError } from '../lib/errors';
import { signAccessToken } from '../lib/jwt';
import { getDummyHash, verifyPassword } from '../lib/password';
import type { AppBindings, Env } from '../types/env';
import { parseJsonBody } from '../validators/json';

export const REFRESH_TOKEN_TTL_DAYS = 30;
/** Lockout: this many failed logins within the window blocks the account. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_WINDOW_SECONDS = 15 * 60;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
  device_label: z.string().trim().max(100).optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20).max(200),
});

function isoIn(seconds: number, now = Date.now()): string {
  return new Date(now + seconds * 1000).toISOString();
}

async function issueTokens(
  env: Env,
  userId: string,
  familyId: string,
  deviceLabel: string | null,
  rotateTokenId?: string,
): Promise<TokenResponse> {
  const refreshToken = bytesToBase64Url(randomBytes(32));
  const expiresAt = isoIn(REFRESH_TOKEN_TTL_DAYS * 24 * 3600);
  const insert = env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, device_label, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, familyId, await sha256Hex(refreshToken), deviceLabel, expiresAt);

  if (rotateTokenId) {
    // Rotate atomically; the WHERE guard makes a concurrent second use of
    // the same token change nothing, which the caller detects.
    const [rotated] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE refresh_tokens SET rotated_at = ? WHERE id = ? AND rotated_at IS NULL AND revoked_at IS NULL`,
      ).bind(new Date().toISOString(), rotateTokenId),
      insert,
    ]);
    if (rotated?.meta.changes !== 1) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Refresh token is no longer valid.');
    }
  } else {
    await insert.run();
  }

  const access = await signAccessToken(userId, env.TOKEN_SIGNING_SECRET);
  return {
    token_type: 'Bearer',
    access_token: access.token,
    expires_in: access.expiresIn,
    refresh_token: refreshToken,
    refresh_expires_at: expiresAt,
  };
}

export const auth = new Hono<AppBindings>();

auth.post('/login', async (c) => {
  const body = await parseJsonBody(c, loginSchema);
  const db = c.env.DB;
  const windowStart = isoIn(-LOCKOUT_WINDOW_SECONDS);

  let user: { id: string; password_hash: string | null } | null;
  let failures: number;
  try {
    const [failureRows, userRows] = await db.batch<{ n?: number; id?: string; password_hash?: string | null }>([
      db
        .prepare('SELECT COUNT(*) AS n FROM auth_failures WHERE email = ? AND attempted_at > ?')
        .bind(body.email, windowStart),
      db.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(body.email),
    ]);
    failures = Number(failureRows?.results[0]?.n ?? 0);
    const row = userRows?.results[0];
    user = row?.id ? { id: row.id, password_hash: row.password_hash ?? null } : null;
  } catch (err) {
    throw toStorageError(err);
  }

  if (failures >= MAX_FAILED_LOGINS) {
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Too many failed sign-in attempts. Try again later.',
      undefined,
      LOCKOUT_WINDOW_SECONDS,
    );
  }

  // Always run the KDF so timing does not reveal whether the email exists.
  const ok = await verifyPassword(body.password, user?.password_hash ?? (await getDummyHash()));
  if (!user || !user.password_hash || !ok) {
    await db
      .prepare('INSERT INTO auth_failures (id, email, attempted_at) VALUES (?, ?, ?)')
      .bind(crypto.randomUUID(), body.email, new Date().toISOString())
      .run()
      .catch(() => undefined);
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password.');
  }

  await db
    .prepare('DELETE FROM auth_failures WHERE email = ?')
    .bind(body.email)
    .run()
    .catch(() => undefined);
  const tokens = await issueTokens(c.env, user.id, crypto.randomUUID(), body.device_label ?? null).catch(
    (err) => {
      throw err instanceof ApiError ? err : toStorageError(err);
    },
  );
  return c.json(tokens);
});

interface RefreshRow {
  id: string;
  user_id: string;
  family_id: string;
  device_label: string | null;
  expires_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
}

async function findRefreshToken(env: Env, token: string): Promise<RefreshRow | null> {
  try {
    return await env.DB.prepare(
      `SELECT id, user_id, family_id, device_label, expires_at, rotated_at, revoked_at
       FROM refresh_tokens WHERE token_hash = ?`,
    )
      .bind(await sha256Hex(token))
      .first<RefreshRow>();
  } catch (err) {
    throw toStorageError(err);
  }
}

async function revokeFamily(env: Env, familyId: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
  )
    .bind(new Date().toISOString(), familyId)
    .run();
}

auth.post('/refresh', async (c) => {
  const { refresh_token } = await parseJsonBody(c, refreshSchema);
  const row = await findRefreshToken(c.env, refresh_token);
  const invalid = new ApiError(401, 'UNAUTHORIZED', 'Refresh token is no longer valid.');

  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
    throw invalid;
  }
  if (row.rotated_at) {
    // A rotated token was presented again: assume it leaked and end the
    // whole sign-in, forcing a fresh login on every holder.
    await revokeFamily(c.env, row.family_id).catch(() => undefined);
    throw invalid;
  }
  try {
    return c.json(await issueTokens(c.env, row.user_id, row.family_id, row.device_label, row.id));
  } catch (err) {
    throw err instanceof ApiError ? err : toStorageError(err);
  }
});

auth.post('/logout', async (c) => {
  const { refresh_token } = await parseJsonBody(c, refreshSchema);
  const row = await findRefreshToken(c.env, refresh_token);
  if (row) {
    await revokeFamily(c.env, row.family_id).catch((err) => {
      throw toStorageError(err);
    });
  }
  // Same response whether or not the token existed.
  return c.body(null, 204);
});
