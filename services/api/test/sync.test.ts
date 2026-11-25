import type { ApiErrorBody, SyncBatchResponse } from '@axs/shared';
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { secondsUntilUtcMidnight, toStorageError } from '../src/lib/d1Errors';
import { MAX_EVENTS_PER_BATCH } from '../src/validators/sync';
import { createUser, login, post } from './helpers';

let token: string;
let otherToken: string;

beforeAll(async () => {
  await createUser('sync-owner@example.test', 'a long test password');
  await createUser('someone-else@example.test', 'a long test password');
  token = (await login('sync-owner@example.test', 'a long test password')).access_token;
  otherToken = (await login('someone-else@example.test', 'a long test password')).access_token;
});

const T = '2026-11-25T12:00:00.000Z';

function device(id = crypto.randomUUID(), overrides: Record<string, unknown> = {}) {
  return {
    id,
    ble_identifier: 'AA:BB:CC:DD:EE:01',
    display_name: null,
    advertised_name: 'Some name',
    device_role: 'FAULTY',
    identification_confidence: 'UNKNOWN',
    identification_notes: null,
    created_at: T,
    updated_at: T,
    ...overrides,
  };
}

function session(deviceId: string, id = crypto.randomUUID(), overrides: Record<string, unknown> = {}) {
  return {
    id,
    device_id: deviceId,
    session_type: 'IDLE_MONITOR',
    started_at: T,
    ended_at: null,
    status: 'ACTIVE',
    app_version: '0.1.0',
    notes: null,
    ...overrides,
  };
}

function event(sessionId: string, deviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    session_id: sessionId,
    device_id: deviceId,
    event_type: 'RSSI_SAMPLE',
    observed_at: T,
    recorded_at: T,
    source: 'AUTOMATIC_OBSERVATION',
    description: 'rssi',
    rssi: -70,
    connection_state: 'connected',
    service_uuid: null,
    characteristic_uuid: null,
    raw_payload_hex: '0aff',
    metadata_json: '{"k":1}',
    ...overrides,
  };
}

async function syncBatch(body: Record<string, unknown>, as = token) {
  const res = await post('/api/v1/sync/batch', { batch_id: crypto.randomUUID(), ...body }, as);
  return { res, body: res.status === 200 ? await res.json<SyncBatchResponse>() : null };
}

describe('POST /api/v1/sync/batch', () => {
  it('stores a self-contained batch of device, session and events', async () => {
    const d = device();
    const s = session(d.id);
    const events = [event(s.id, d.id), event(s.id, d.id, { event_type: 'MANUAL_WAKE_MARKER', source: 'USER_MARKER', rssi: null })];
    const { res, body } = await syncBatch({ devices: [d], sessions: [s], events });

    expect(res.status).toBe(200);
    expect(body?.devices.accepted).toEqual([d.id]);
    expect(body?.sessions.accepted).toEqual([s.id]);
    expect(body?.events.accepted.sort()).toEqual(events.map((e) => e.id).sort());

    const row = await env.DB.prepare('SELECT * FROM diagnostic_events WHERE id = ?').bind(events[0]!.id).first();
    expect(row).toMatchObject({ rssi: -70, raw_payload_hex: '0aff', metadata_json: '{"k":1}', connection_state: 'connected' });
  });

  it('is idempotent: a retried batch reports duplicates and writes nothing new', async () => {
    const d = device();
    const s = session(d.id);
    const events = [event(s.id, d.id), event(s.id, d.id)];
    const batch_id = crypto.randomUUID();

    const first = await post('/api/v1/sync/batch', { batch_id, devices: [d], sessions: [s], events }, token);
    expect((await first.json<SyncBatchResponse>()).events.accepted).toHaveLength(2);

    const retry = await (await post('/api/v1/sync/batch', { batch_id, devices: [d], sessions: [s], events }, token)).json<SyncBatchResponse>();
    expect(retry.replayed).toBe(true);
    expect(retry.events.accepted).toEqual([]);
    expect(retry.events.duplicate.sort()).toEqual(events.map((e) => e.id).sort());

    const { n } = (await env.DB.prepare('SELECT COUNT(*) AS n FROM diagnostic_events WHERE session_id = ?').bind(s.id).first<{ n: number }>())!;
    expect(n).toBe(2);
  });

  it('rejects malformed records individually and keeps the rest', async () => {
    const d = device();
    const s = session(d.id);
    const good = event(s.id, d.id);
    const { body } = await syncBatch({
      devices: [d],
      sessions: [s],
      events: [
        good,
        event(s.id, d.id, { event_type: 'SLEEP_DETECTED' }),
        event(s.id, d.id, { raw_payload_hex: 'XYZ' }),
        { nonsense: true },
      ],
    });
    expect(body?.events.accepted).toEqual([good.id]);
    expect(body?.events.rejected.map((r) => [r.index, r.reason])).toEqual([
      [1, 'INVALID'],
      [2, 'INVALID'],
      [3, 'INVALID'],
    ]);
  });

  it('rejects events whose session is missing', async () => {
    const d = device();
    const orphan = event(crypto.randomUUID(), d.id);
    const { body } = await syncBatch({ devices: [d], events: [orphan] });
    expect(body?.events.rejected).toEqual([{ index: -1, id: orphan.id, reason: 'PARENT_NOT_FOUND' }]);
  });

  it('never lets another user overwrite or attach to records', async () => {
    const d = device();
    const s = session(d.id);
    await syncBatch({ devices: [d], sessions: [s], events: [] });

    // Another account reuses the same IDs.
    const hijack = await syncBatch(
      {
        devices: [device(d.id, { display_name: 'stolen', updated_at: '2030-01-01T00:00:00.000Z' })],
        sessions: [session(d.id, s.id, { status: 'COMPLETED' })],
        events: [event(s.id, d.id)],
      },
      otherToken,
    );
    expect(hijack.body?.devices.rejected[0]?.reason).toBe('ID_CONFLICT');
    expect(hijack.body?.sessions.rejected[0]?.reason).toBe('PARENT_NOT_FOUND');
    expect(hijack.body?.events.rejected[0]?.reason).toBe('PARENT_NOT_FOUND');

    const stored = await env.DB.prepare('SELECT display_name FROM user_devices WHERE id = ?').bind(d.id).first();
    expect(stored?.display_name).toBeNull();
    const storedSession = await env.DB.prepare('SELECT status FROM diagnostic_sessions WHERE id = ?').bind(s.id).first();
    expect(storedSession?.status).toBe('ACTIVE');
  });

  it('updates session status and device fields on later syncs (last write wins)', async () => {
    const d = device();
    const s = session(d.id);
    await syncBatch({ devices: [d], sessions: [s] });
    await syncBatch({
      devices: [device(d.id, { device_role: 'REFERENCE', updated_at: '2026-11-25T13:00:00.000Z' })],
      sessions: [session(d.id, s.id, { status: 'COMPLETED', ended_at: '2026-11-25T13:00:00.000Z' })],
    });
    // An older device update arriving late does not win.
    await syncBatch({ devices: [device(d.id, { device_role: 'UNASSIGNED', updated_at: '2026-11-25T12:30:00.000Z' })] });

    const row = await env.DB.prepare('SELECT device_role FROM user_devices WHERE id = ?').bind(d.id).first();
    expect(row?.device_role).toBe('REFERENCE');
    const srow = await env.DB.prepare('SELECT status, ended_at FROM diagnostic_sessions WHERE id = ?').bind(s.id).first();
    expect(srow).toMatchObject({ status: 'COMPLETED', ended_at: '2026-11-25T13:00:00.000Z' });
  });

  it('accepts a full batch in a single request', async () => {
    const d = device();
    const s = session(d.id);
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH }, () => event(s.id, d.id));
    const { res, body } = await syncBatch({ devices: [d], sessions: [s], events });
    expect(res.status).toBe(200);
    expect(body?.events.accepted).toHaveLength(MAX_EVENTS_PER_BATCH);
  });

  it('enforces the maximum batch size', async () => {
    const d = device();
    const s = session(d.id);
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => event(s.id, d.id, { metadata_json: null, description: null, raw_payload_hex: null }));
    const res = await post('/api/v1/sync/batch', { batch_id: crypto.randomUUID(), devices: [d], sessions: [s], events }, token);
    expect(res.status).toBe(422);
  });

  it('requires authentication', async () => {
    const res = await post('/api/v1/sync/batch', { batch_id: crypto.randomUUID() });
    expect(res.status).toBe(401);
    expect((await res.json<ApiErrorBody>()).error.code).toBe('UNAUTHORIZED');
  });

  it('records a receipt per batch', async () => {
    const { body } = await syncBatch({ devices: [device()] });
    const receipt = await env.DB.prepare('SELECT * FROM sync_receipts WHERE batch_id = ?').bind(body!.batch_id).first();
    expect(receipt).toBeTruthy();
  });
});

describe('storage error mapping', () => {
  it('reports quota exhaustion as retryable until the daily reset', () => {
    const err = toStorageError(new Error('D1_ERROR: Exceeded daily rows written limit'));
    expect(err.status).toBe(429);
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reports other failures as temporarily unavailable', () => {
    const err = toStorageError(new Error('network connection lost'));
    expect(err.status).toBe(503);
    expect(err.code).toBe('STORAGE_UNAVAILABLE');
  });

  it('computes time to the UTC daily reset', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-11-25T23:59:00.000Z'))).toBe(60);
  });
});

describe('wire contract', () => {
  it('schemas accept exactly the shared field lists', async () => {
    const { SYNC_DEVICE_FIELDS, SYNC_EVENT_FIELDS, SYNC_SESSION_FIELDS } = await import('@axs/shared');
    const { deviceSchema, eventSchema, sessionSchema } = await import('../src/validators/sync');
    expect(Object.keys(deviceSchema.shape).sort()).toEqual([...SYNC_DEVICE_FIELDS].sort());
    expect(Object.keys(sessionSchema.shape).sort()).toEqual([...SYNC_SESSION_FIELDS].sort());
    expect(Object.keys(eventSchema.shape).sort()).toEqual([...SYNC_EVENT_FIELDS].sort());
  });
});
