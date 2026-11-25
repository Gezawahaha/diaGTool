import { APIClient, ApiRequestError, type Fetch } from '../../src/sync/APIClient';
import { AuthManager } from '../../src/sync/AuthManager';
import type { TokenStore } from '../../src/sync/TokenStore';
import { normaliseApiBaseUrl } from '../../src/storage/SettingsRepository';

function setup(refreshStatus = 200) {
  let stored: string | null = null;
  const store: TokenStore = {
    getRefreshToken: async () => stored,
    setRefreshToken: async (t) => {
      stored = t;
    },
    clear: async () => {
      stored = null;
    },
  };
  let n = 0;
  const calls: string[] = [];
  const fetchImpl: Fetch = async (url) => {
    const path = url.replace('https://api.test/api/v1', '');
    calls.push(path);
    if (path === '/auth/refresh' && refreshStatus !== 200) {
      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no', request_id: 'r' } }), { status: refreshStatus });
    }
    if (path === '/auth/logout') {
      return new Response(null, { status: 204 });
    }
    n += 1;
    // Simulate latency so concurrent callers overlap.
    await new Promise<void>((r) => setTimeout(r, 5));
    return new Response(
      JSON.stringify({
        token_type: 'Bearer',
        access_token: `access-${n}`,
        expires_in: 900,
        refresh_token: `refresh-${n}`,
        refresh_expires_at: '2030-01-01T00:00:00Z',
      }),
      { status: 200 },
    );
  };
  let clock = 0;
  const auth = new AuthManager(new APIClient(() => 'https://api.test', fetchImpl), store, () => clock);
  return {
    auth,
    calls,
    stored: () => stored,
    advance: (ms: number) => {
      clock += ms;
    },
  } as const;
}

test('login stores the refresh token and caches the access token', async () => {
  const { auth, stored, calls } = setup();
  await auth.login('a@b.test', 'pw', 'phone');
  expect(auth.isSignedIn()).toBe(true);
  expect(stored()).toBe('refresh-1');
  expect(await auth.getAccessToken()).toBe('access-1');
  expect(calls).toEqual(['/auth/login']);
});

test('concurrent refreshes share one request', async () => {
  const { auth, calls, advance } = setup();
  await auth.login('a@b.test', 'pw', 'phone');
  advance(15 * 60_000);
  const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
  expect(new Set(tokens)).toEqual(new Set(['access-2']));
  expect(calls.filter((c) => c === '/auth/refresh')).toHaveLength(1);
});

test('a rejected refresh signs out and clears the stored token', async () => {
  const { auth, stored, advance } = setup(401);
  await auth.login('a@b.test', 'pw', 'phone');
  advance(15 * 60_000);
  await expect(auth.getAccessToken()).rejects.toMatchObject({ code: 'SIGNED_OUT' });
  expect(auth.isSignedIn()).toBe(false);
  expect(stored()).toBeNull();
});

test('logout clears locally even if the server call fails', async () => {
  const { auth, stored, calls } = setup();
  await auth.login('a@b.test', 'pw', 'phone');
  await auth.logout();
  expect(auth.isSignedIn()).toBe(false);
  expect(stored()).toBeNull();
  expect(calls).toContain('/auth/logout');
});

test('API errors carry code, status and retryability', async () => {
  const api = new APIClient(() => 'https://api.test', async () =>
    new Response(JSON.stringify({ error: { code: 'QUOTA_EXCEEDED', message: 'quota', request_id: 'r' } }), {
      status: 429,
      headers: { 'retry-after': '120' },
    }),
  );
  const err = await api.request('GET', '/sync/status').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiRequestError);
  expect(err).toMatchObject({ status: 429, code: 'QUOTA_EXCEEDED', temporary: true, retryAfterSeconds: 120 });

  const unconfigured = new APIClient(() => null);
  await expect(unconfigured.request('GET', '/x')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
});

test('server URLs must be https except for local development', () => {
  expect(normaliseApiBaseUrl(' https://Api.Example.dev/ ')).toBe('https://api.example.dev');
  expect(normaliseApiBaseUrl('http://10.0.2.2:8787')).toBe('http://10.0.2.2:8787');
  expect(normaliseApiBaseUrl('http://localhost:8787')).toBe('http://localhost:8787');
  expect(() => normaliseApiBaseUrl('http://api.example.dev')).toThrow(/https/);
  expect(() => normaliseApiBaseUrl('https://api.example.dev/api/v1')).toThrow(/origin/);
  expect(() => normaliseApiBaseUrl('ftp://x')).toThrow();
});
