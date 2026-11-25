import type { ApiErrorBody, TokenResponse } from '@axs/shared';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MAX_FAILED_LOGINS } from '../src/routes/auth';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, verifyAccessToken } from '../src/lib/jwt';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { app, createUser, login, post } from './helpers';

const SECRET = 'test-signing-secret-0123456789abcdef';

describe('password hashing', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('correct horse battery', 1000);
    expect(stored).toMatch(/^pbkdf2_sha256\$1000\$/);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('rejects malformed hashes and excessive work factors', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2_sha256$999999999$AA==$AA==')).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const { token, expiresIn } = await signAccessToken('user-1', SECRET, 1_000);
    expect(expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    const claims = await verifyAccessToken(token, SECRET, 1_010);
    expect(claims).toMatchObject({ sub: 'user-1', aud: 'axs-diagnostic-lab-mobile' });
  });

  it('rejects expired, tampered, wrong-key and alg=none tokens', async () => {
    const { token } = await signAccessToken('user-1', SECRET, 1_000);
    expect(await verifyAccessToken(token, SECRET, 1_000 + ACCESS_TOKEN_TTL_SECONDS + 60)).toBeNull();
    expect(await verifyAccessToken(token, 'another-secret-0123456789abcdefghij', 1_010)).toBeNull();

    const [h, p, s] = token.split('.');
    const forgedPayload = btoa(JSON.stringify({ ...JSON.parse(atob(p!.replace(/-/g, '+').replace(/_/g, '/'))), sub: 'admin' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyAccessToken(`${h}.${forgedPayload}.${s}`, SECRET, 1_010)).toBeNull();

    const noneHeader = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/, '');
    expect(await verifyAccessToken(`${noneHeader}.${p}.`, SECRET, 1_010)).toBeNull();
    expect(await verifyAccessToken('garbage', SECRET)).toBeNull();
  });
});

describe('POST /api/v1/auth/login', () => {
  it('issues an access and refresh token for valid credentials', async () => {
    await createUser('owner@example.test', 'a long test password');
    const tokens = await login('Owner@Example.test', 'a long test password');
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(tokens.refresh_token.length).toBeGreaterThan(30);

    const stored = await env.DB.prepare('SELECT token_hash, device_label FROM refresh_tokens').first<{
      token_hash: string;
      device_label: string;
    }>();
    // Only a hash of the refresh token is stored.
    expect(stored?.token_hash).not.toBe(tokens.refresh_token);
    expect(stored?.device_label).toBe('test phone');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await createUser('known@example.test', 'a long test password');
    const wrong = await post('/api/v1/auth/login', { email: 'known@example.test', password: 'nope' });
    const unknown = await post('/api/v1/auth/login', { email: 'ghost@example.test', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json<ApiErrorBody>()).error.message).toBe(
      (await unknown.json<ApiErrorBody>()).error.message,
    );
  });

  it('locks the account after repeated failures', async () => {
    await createUser('locked@example.test', 'a long test password');
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await post('/api/v1/auth/login', { email: 'locked@example.test', password: 'wrong' });
    }
    const res = await post('/api/v1/auth/login', {
      email: 'locked@example.test',
      password: 'a long test password',
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect((await res.json<ApiErrorBody>()).error.code).toBe('RATE_LIMITED');
  });

  it('validates the body', async () => {
    const res = await post('/api/v1/auth/login', { email: 'not-an-email', password: '' });
    expect(res.status).toBe(422);
  });
});

describe('refresh tokens', () => {
  it('rotate on use', async () => {
    await createUser('rotate@example.test', 'a long test password');
    const first = await login('rotate@example.test', 'a long test password');
    const res = await post('/api/v1/auth/refresh', { refresh_token: first.refresh_token });
    expect(res.status).toBe(200);
    const second = await res.json<TokenResponse>();
    expect(second.refresh_token).not.toBe(first.refresh_token);

    const again = await post('/api/v1/auth/refresh', { refresh_token: second.refresh_token });
    expect(again.status).toBe(200);
  });

  it('reusing a rotated token revokes the whole sign-in', async () => {
    await createUser('reuse@example.test', 'a long test password');
    const first = await login('reuse@example.test', 'a long test password');
    const second = await (await post('/api/v1/auth/refresh', { refresh_token: first.refresh_token })).json<TokenResponse>();

    const replay = await post('/api/v1/auth/refresh', { refresh_token: first.refresh_token });
    expect(replay.status).toBe(401);
    // The legitimate newer token is now revoked too.
    const after = await post('/api/v1/auth/refresh', { refresh_token: second.refresh_token });
    expect(after.status).toBe(401);
  });

  it('logout revokes the sign-in and always returns 204', async () => {
    await createUser('logout@example.test', 'a long test password');
    const tokens = await login('logout@example.test', 'a long test password');
    expect((await post('/api/v1/auth/logout', { refresh_token: tokens.refresh_token })).status).toBe(204);
    expect((await post('/api/v1/auth/refresh', { refresh_token: tokens.refresh_token })).status).toBe(401);
    expect((await post('/api/v1/auth/logout', { refresh_token: 'x'.repeat(43) })).status).toBe(204);
  });
});

describe('protected routes', () => {
  it('require a bearer token', async () => {
    const res = await app.request('/api/v1/sync/status', {}, env);
    expect(res.status).toBe(401);
    const bad = await app.request(
      '/api/v1/sync/status',
      { headers: { authorization: 'Bearer nonsense' } },
      env,
    );
    expect(bad.status).toBe(401);
  });

  it('accept a valid token', async () => {
    await createUser('status@example.test', 'a long test password');
    const tokens = await login('status@example.test', 'a long test password');
    const res = await app.request(
      '/api/v1/sync/status',
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });
});
