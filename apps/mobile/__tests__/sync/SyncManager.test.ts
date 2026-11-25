import {
  SYNC_DEVICE_FIELDS,
  SYNC_EVENT_FIELDS,
  SYNC_SESSION_FIELDS,
  type SyncBatchResponse,
} from '@axs/shared';
import { BLELogger } from '../../src/bluetooth/BLELogger';
import { SessionRecorder } from '../../src/diagnostics/SessionRecorder';
import { migrate } from '../../src/storage/migrations';
import {
  DeviceRepository,
  EventRepository,
  GattProfileRepository,
  SessionRepository,
} from '../../src/storage/repositories';
import { SettingsRepository } from '../../src/storage/SettingsRepository';
import { SyncOutbox } from '../../src/storage/SyncOutbox';
import { APIClient, type Fetch } from '../../src/sync/APIClient';
import { AuthManager } from '../../src/sync/AuthManager';
import { MAX_EVENTS_PER_REQUEST, SyncManager } from '../../src/sync/SyncManager';
import type { TokenStore } from '../../src/sync/TokenStore';
import { openMemoryDatabase } from '../../src/test-utils/nodeSqlite';

const FD = 'AA:BB:CC:00:00:01';

/** In-memory stand-in for the Worker: idempotent by record ID. */
class FakeServer {
  devices = new Map<string, Record<string, unknown>>();
  sessions = new Map<string, Record<string, unknown>>();
  events = new Map<string, Record<string, unknown>>();
  batches: Record<string, unknown>[] = [];
  /** Queue of overrides for upcoming /sync/batch calls. */
  next: ('network' | 'lose-response' | '401' | '429' | '503' | 'reject-first-event')[] = [];
  refreshCalls = 0;
  tokenVersion = 1;

  fetch: Fetch = async (url, init) => {
    const path = url.replace('https://api.test/api/v1', '');
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
      new Response(status === 204 ? null : JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      });
    const tokens = () => ({
      token_type: 'Bearer',
      access_token: `access-${this.tokenVersion}`,
      expires_in: 900,
      refresh_token: `refresh-${this.tokenVersion}-${'x'.repeat(30)}`,
      refresh_expires_at: '2030-01-01T00:00:00.000Z',
    });

    if (path === '/auth/login') {
      return body.password === 'right password'
        ? json(200, tokens())
        : json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.', request_id: 'r' } });
    }
    if (path === '/auth/refresh') {
      this.refreshCalls += 1;
      this.tokenVersion += 1;
      return json(200, tokens());
    }
    if (path === '/sync/batch') {
      const mode = this.next.shift();
      if (mode === 'network') {
        throw new TypeError('Network request failed');
      }
      if (mode === '401' || (init?.headers as Record<string, string>).authorization !== `Bearer access-${this.tokenVersion}`) {
        return json(401, { error: { code: 'UNAUTHORIZED', message: 'expired', request_id: 'r' } });
      }
      if (mode === '429') {
        return json(429, { error: { code: 'QUOTA_EXCEEDED', message: 'Cloud storage quota reached for today.', request_id: 'r' } }, { 'retry-after': '3600' });
      }
      if (mode === '503') {
        return json(503, { error: { code: 'STORAGE_UNAVAILABLE', message: 'unavailable', request_id: 'r' } });
      }
      this.batches.push(body);
      const response: SyncBatchResponse = {
        batch_id: body.batch_id,
        replayed: false,
        devices: { accepted: [], rejected: [] },
        sessions: { accepted: [], rejected: [] },
        events: { accepted: [], duplicate: [], rejected: [] },
      };
      for (const d of body.devices) {
        this.devices.set(d.id, d);
        response.devices.accepted.push(d.id);
      }
      for (const s of body.sessions) {
        this.sessions.set(s.id, s);
        response.sessions.accepted.push(s.id);
      }
      body.events.forEach((e: { id: string }, i: number) => {
        if (mode === 'reject-first-event' && i === 0) {
          response.events.rejected.push({ index: -1, id: e.id, reason: 'PARENT_NOT_FOUND' });
        } else if (this.events.has(e.id)) {
          response.events.duplicate.push(e.id);
        } else {
          this.events.set(e.id, e);
          response.events.accepted.push(e.id);
        }
      });
      if (mode === 'lose-response') {
        // Stored server-side, but the phone never hears back.
        throw new TypeError('Network request failed');
      }
      return json(200, response);
    }
    return json(404, {});
  };
}

function memoryTokenStore(): TokenStore {
  let token: string | null = null;
  return {
    getRefreshToken: async () => token,
    setRefreshToken: async (t) => {
      token = t;
    },
    clear: async () => {
      token = null;
    },
  };
}

async function setup({ signIn = true, enable = true } = {}) {
  const db = openMemoryDatabase();
  await migrate(db);
  const server = new FakeServer();
  let clock = Date.parse('2026-11-25T12:00:00.000Z');
  const now = () => clock;
  const logger = new BLELogger();
  const devices = new DeviceRepository(db);
  const sessions = new SessionRepository(db);
  const events = new EventRepository(db);
  const recorder = new SessionRecorder({
    logger,
    devices,
    sessions,
    events,
    gattProfiles: new GattProfileRepository(db),
    getGattProfile: () => undefined,
    appVersion: '0.1.0',
  });
  const settings = new SettingsRepository(db);
  await settings.update({ apiBaseUrl: 'https://api.test', syncEnabled: enable });
  const api = new APIClient(() => 'https://api.test', server.fetch);
  const auth = new AuthManager(api, memoryTokenStore(), now);
  if (signIn) {
    await auth.login('owner@example.test', 'right password', 'test');
  }
  const outbox = new SyncOutbox(db);
  const sync = new SyncManager({ api, auth, outbox, settings, now, random: () => 0.5 });

  async function recordSession(eventCount: number) {
    await recorder.start({ bleDeviceId: FD, advertisedName: 'FD', sessionType: 'IDLE_MONITOR' });
    for (let i = 0; i < eventCount; i++) {
      logger.log({ bleDeviceId: FD, eventType: 'RSSI_SAMPLE', description: `sample ${i}`, rssi: -60 - (i % 30) });
    }
    return recorder.stop();
  }
  const statusCounts = async () => {
    const { rows } = await db.execute(
      'SELECT sync_status, COUNT(*) AS n FROM events GROUP BY sync_status ORDER BY sync_status',
    );
    return Object.fromEntries(rows.map((r) => [r.sync_status, r.n]));
  };

  return {
    db,
    server,
    sync,
    auth,
    outbox,
    devices,
    recorder,
    logger,
    recordSession,
    statusCounts,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test('does nothing until the user opts in', async () => {
  const { server, sync, recordSession } = await setup({ enable: false });
  await recordSession(3);
  await sync.sync({ force: true });
  expect(sync.getStatus().state).toBe('disabled');
  expect(server.batches).toHaveLength(0);
});

test('requires a sign-in', async () => {
  const { server, sync, recordSession } = await setup({ signIn: false });
  await recordSession(1);
  await sync.sync({ force: true });
  expect(sync.getStatus().state).toBe('signed_out');
  expect(server.batches).toHaveLength(0);
});

test('uploads devices, sessions and events, and keeps local copies', async () => {
  const { server, sync, recordSession, statusCounts, db } = await setup();
  const session = await recordSession(5);
  await sync.sync();

  expect(sync.getStatus()).toMatchObject({ state: 'idle', lastError: null });
  expect(server.devices.size).toBe(1);
  expect(server.sessions.get(session!.id)).toMatchObject({ status: 'COMPLETED' });
  expect(server.events.size).toBe(5);
  expect(await statusCounts()).toEqual({ SYNCED: 5 });
  // Local records are never deleted by syncing.
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM events');
  expect(rows[0]?.n).toBe(5);
  expect(sync.getStatus().pending).toMatchObject({ events: 0, sessions: 0, devices: 0 });
});

test('sends exactly the shared wire fields', async () => {
  const { server, sync, recordSession } = await setup();
  await recordSession(1);
  await sync.sync();
  const batch = server.batches[0] as { devices: object[]; sessions: object[]; events: object[] };
  expect(Object.keys(batch.devices[0]!).sort()).toEqual([...SYNC_DEVICE_FIELDS].sort());
  expect(Object.keys(batch.sessions[0]!).sort()).toEqual([...SYNC_SESSION_FIELDS].sort());
  expect(Object.keys(batch.events[0]!).sort()).toEqual([...SYNC_EVENT_FIELDS].sort());
});

test('splits large backlogs into bounded batches', async () => {
  const { server, sync, recordSession } = await setup();
  await recordSession(MAX_EVENTS_PER_REQUEST + 50);
  await sync.sync();
  expect(server.batches.map((b) => (b.events as unknown[]).length)).toEqual([MAX_EVENTS_PER_REQUEST, 50]);
  expect(server.events.size).toBe(MAX_EVENTS_PER_REQUEST + 50);
});

test('offline: keeps records pending and backs off', async () => {
  const { server, sync, recordSession, statusCounts, advance } = await setup();
  await recordSession(2);
  server.next.push('network');
  await sync.sync();

  const status = sync.getStatus();
  expect(status.state).toBe('backing_off');
  expect(status.nextRetryAt).not.toBeNull();
  expect(await statusCounts()).toEqual({ PENDING: 2 });

  // Automatic triggers respect the backoff window…
  await sync.sync();
  expect(server.batches).toHaveLength(0);
  // …and run once it has passed.
  advance(Date.parse(status.nextRetryAt!) - Date.parse('2026-11-25T12:00:00.000Z') + 1);
  await sync.sync();
  expect(sync.getStatus().state).toBe('idle');
  expect(await statusCounts()).toEqual({ SYNCED: 2 });
});

test('a lost response is retried without duplicating events', async () => {
  const { server, sync, recordSession, statusCounts } = await setup();
  await recordSession(3);
  server.next.push('lose-response');
  await sync.sync();
  expect(await statusCounts()).toEqual({ PENDING: 3 });
  expect(server.events.size).toBe(3);

  await sync.sync({ force: true });
  expect(server.events.size).toBe(3);
  expect(await statusCounts()).toEqual({ SYNCED: 3 });
  // Same event IDs were resent, never regenerated.
  const [first, second] = server.batches as { events: { id: string }[] }[];
  expect(second!.events.map((e) => e.id)).toEqual(first!.events.map((e) => e.id));
});

test('quota exhaustion waits for the server-provided retry time', async () => {
  const { server, sync, recordSession, statusCounts } = await setup();
  await recordSession(1);
  server.next.push('429');
  await sync.sync();
  const status = sync.getStatus();
  expect(status.state).toBe('quota_exceeded');
  expect(status.nextRetryAt).toBe('2026-11-25T13:00:00.000Z');
  expect(await statusCounts()).toEqual({ PENDING: 1 });
});

test('backoff grows with repeated failures', async () => {
  const { server, sync, recordSession } = await setup();
  await recordSession(1);
  server.next.push('503', '503');
  await sync.sync({ force: true });
  const first = Date.parse(sync.getStatus().nextRetryAt!);
  await sync.sync({ force: true });
  const second = Date.parse(sync.getStatus().nextRetryAt!);
  expect(second).toBeGreaterThan(first);
});

test('rejected records are kept with the reason and not resent', async () => {
  const { server, sync, recordSession, statusCounts, outbox, db } = await setup();
  await recordSession(2);
  server.next.push('reject-first-event');
  await sync.sync();
  expect(await statusCounts()).toEqual({ REJECTED: 1, SYNCED: 1 });
  const { rows } = await db.execute("SELECT sync_error FROM events WHERE sync_status = 'REJECTED'");
  expect(rows[0]?.sync_error).toBe('PARENT_NOT_FOUND');
  expect(sync.getStatus().pending?.rejected).toBe(1);

  await sync.sync({ force: true });
  expect(server.batches).toHaveLength(1);

  await outbox.retryRejected();
  await sync.sync({ force: true });
  expect(await statusCounts()).toEqual({ SYNCED: 2 });
});

test('an expired access token is refreshed once and the batch retried', async () => {
  const { server, sync, recordSession, statusCounts } = await setup();
  await recordSession(1);
  server.next.push('401');
  await sync.sync();
  expect(server.refreshCalls).toBe(1);
  expect(await statusCounts()).toEqual({ SYNCED: 1 });
});

test('a device edited while a batch is in flight is sent again', async () => {
  const { server, sync, recordSession, devices } = await setup();
  await recordSession(1);
  const device = (await devices.findByBleIdentifier(FD))!;

  const realFetch = server.fetch;
  server.fetch = async (url, init) => {
    // The user changes the role while the request is on the wire.
    await devices.setRole(device.id, 'REFERENCE');
    server.fetch = realFetch;
    return realFetch(url, init);
  };
  const api = (sync as unknown as { deps: { api: APIClient } }).deps.api;
  (api as unknown as { fetchImpl: Fetch }).fetchImpl = (u, i) => server.fetch(u, i);

  await sync.sync();
  expect(sync.getStatus().pending?.devices).toBe(0);
  expect(server.devices.get(device.id)).toMatchObject({ device_role: 'REFERENCE' });
  expect(server.batches).toHaveLength(2);
});
