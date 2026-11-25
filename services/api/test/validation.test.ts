import type { ApiErrorBody } from '@axs/shared';
import { EVENT_TYPES } from '@axs/shared';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, errorResponse } from '../src/lib/errors';
import type { AppBindings } from '../src/types/env';
import { parseJsonBody } from '../src/validators/json';

// A throwaway route exercising parseJsonBody with the app's error handling.
const schema = z.object({
  event_type: z.enum(EVENT_TYPES),
  rssi: z.number().int().optional(),
});

const app = new Hono<AppBindings>();
app.use('*', async (c, next) => {
  c.set('requestId', 'test-request');
  await next();
});
app.post('/echo', async (c) => c.json(await parseJsonBody(c, schema)));
app.onError((err, c) =>
  err instanceof ApiError
    ? errorResponse(c, err.status, err.code, err.message, err.issues)
    : errorResponse(c, 500, 'INTERNAL_ERROR', 'Internal server error.'),
);

function post(body: string, contentType = 'application/json') {
  return app.request(
    '/echo',
    { method: 'POST', headers: { 'content-type': contentType }, body },
    env,
  );
}

describe('parseJsonBody', () => {
  it('returns parsed data for a valid body', async () => {
    const res = await post(JSON.stringify({ event_type: 'RSSI_SAMPLE', rssi: -70 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ event_type: 'RSSI_SAMPLE', rssi: -70 });
  });

  it('rejects non-JSON content types with 415', async () => {
    const res = await post('{}', 'text/plain');
    expect(res.status).toBe(415);
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('reports schema issues with paths and 422', async () => {
    const res = await post(JSON.stringify({ event_type: 'SLEEP_DETECTED', rssi: 1.5 }));
    expect(res.status).toBe(422);

    const body = await res.json<ApiErrorBody>();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.request_id).toBe('test-request');
    expect(body.error.issues?.map((i) => i.path).sort()).toEqual(['event_type', 'rssi']);
  });
});
