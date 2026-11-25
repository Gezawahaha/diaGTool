import type { ApiErrorBody, HealthResponse } from '@axs/shared';
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp, MAX_BODY_BYTES } from '../src/app';

const app = createApp();

describe('GET /api/v1/health', () => {
  it('reports ok with a working database', async () => {
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json<HealthResponse>();
    expect(body).toMatchObject({
      status: 'ok',
      api_version: 'v1',
      environment: 'development',
      checks: { database: 'ok' },
    });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('reports degraded with 503 when the database fails', async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error('D1 unavailable');
      },
    } as unknown as D1Database;

    const res = await app.request(
      '/api/v1/health',
      {},
      { ...env, DB: brokenDb },
    );
    expect(res.status).toBe(503);
    const body = await res.json<HealthResponse>();
    expect(body.status).toBe('degraded');
    expect(body.checks.database).toBe('error');
  });

  it('exposes no configuration beyond the documented fields', async () => {
    const res = await app.request('/api/v1/health', {}, env);
    const body = await res.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(
      ['api_version', 'checks', 'environment', 'status', 'time'].sort(),
    );
  });
});

describe('error format', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.request('/api/v1/does-not-exist', {}, env);
    expect(res.status).toBe(404);

    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toBe(res.headers.get('X-Request-Id'));
  });

  it('rejects bodies over the size limit with 413', async () => {
    const res = await app.request(
      '/api/v1/health',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'x'.repeat(MAX_BODY_BYTES + 1),
      },
      env,
    );
    expect(res.status).toBe(413);
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
