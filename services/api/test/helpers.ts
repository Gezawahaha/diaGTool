import type { TokenResponse } from '@axs/shared';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';
import { hashPassword } from '../src/lib/password';

export const app = createApp();

/** Low iteration count keeps tests fast; verification accepts any count up to the max. */
export async function createUser(email: string, password: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .bind(id, email, await hashPassword(password, 1000))
    .run();
  return id;
}

export function post(path: string, body: unknown, token?: string) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await post('/api/v1/auth/login', { email, password, device_label: 'test phone' });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${await res.text()}`);
  }
  return res.json<TokenResponse>();
}
