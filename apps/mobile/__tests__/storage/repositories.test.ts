import { migrate, MIGRATIONS } from '../../src/storage/migrations';
import {
  DeviceRepository,
  EventRepository,
  GattProfileRepository,
  SessionRepository,
  type NewEvent,
} from '../../src/storage/repositories';
import { openMemoryDatabase } from '../../src/test-utils/nodeSqlite';
import { uuidv4 } from '../../src/utils/id';

async function setup() {
  const db = openMemoryDatabase();
  await migrate(db);
  let tick = 0;
  // Deterministic, strictly increasing clock.
  const now = () => new Date(Date.UTC(2026, 10, 25, 12, 0, tick++));
  return {
    db,
    devices: new DeviceRepository(db, now),
    sessions: new SessionRepository(db, now),
    events: new EventRepository(db),
    gatt: new GattProfileRepository(db, now),
  };
}

function event(sessionId: string, deviceId: string, observedAt: string, overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    id: uuidv4(),
    sessionId,
    deviceId,
    eventType: 'RSSI_SAMPLE',
    observedAt,
    recordedAt: observedAt,
    source: 'AUTOMATIC_OBSERVATION',
    description: null,
    rssi: -70,
    connectionState: null,
    serviceUuid: null,
    characteristicUuid: null,
    rawPayloadHex: null,
    metadataJson: null,
    ...overrides,
  };
}

test('migrations are idempotent and tracked by user_version', async () => {
  const db = openMemoryDatabase();
  expect(await migrate(db)).toBe(MIGRATIONS.length);
  expect(await migrate(db)).toBe(MIGRATIONS.length);
  const { rows } = await db.execute('PRAGMA user_version');
  expect(rows[0]?.user_version).toBe(MIGRATIONS.length);
});

test('foreign keys are enforced', async () => {
  const { events } = await setup();
  await expect(events.insertMany([event('missing', 'missing', '2026-01-01T00:00:00Z')])).rejects.toThrow(
    /FOREIGN KEY/,
  );
});

test('ensure() saves a device once per BLE identifier, defaulting to UNKNOWN', async () => {
  const { devices } = await setup();
  const a = await devices.ensure('AA:01', 'AXS FD');
  const again = await devices.ensure('AA:01', 'renamed');
  expect(again.id).toBe(a.id);
  expect(a).toMatchObject({
    advertisedName: 'AXS FD',
    deviceRole: 'UNASSIGNED',
    identificationConfidence: 'UNKNOWN',
  });
  await devices.setRole(a.id, 'FAULTY');
  expect((await devices.getById(a.id))?.deviceRole).toBe('FAULTY');
  expect(await devices.list()).toHaveLength(1);
});

test('sessions complete, and left-over ACTIVE sessions become INTERRUPTED', async () => {
  const { devices, sessions } = await setup();
  const d = await devices.ensure('AA:01', null);
  const s1 = await sessions.create({ deviceId: d.id, sessionType: 'IDLE_MONITOR', appVersion: '0.1.0' });
  const s2 = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  expect(s1.status).toBe('ACTIVE');

  await sessions.complete(s1.id);
  const done = await sessions.getById(s1.id);
  expect(done?.status).toBe('COMPLETED');
  expect(done?.endedAt).not.toBeNull();

  expect(await sessions.markActiveInterrupted()).toBe(1);
  const cut = await sessions.getById(s2.id);
  expect(cut?.status).toBe('INTERRUPTED');
  expect(cut?.endedAt).toBeNull();

  // Completing an interrupted session is a no-op.
  await sessions.complete(s2.id);
  expect((await sessions.getById(s2.id))?.status).toBe('INTERRUPTED');
});

test('inserting the same events twice stores them once', async () => {
  const { devices, sessions, events } = await setup();
  const d = await devices.ensure('AA:01', null);
  const s = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  const batch = Array.from({ length: 120 }, (_, i) =>
    event(s.id, d.id, `2026-11-25T12:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`),
  );
  expect(await events.insertMany(batch)).toBe(120);
  expect(await events.insertMany(batch)).toBe(0);
  expect(await events.countPending()).toBe(120);
  expect((await events.allForSession(s.id, 50)).length).toBe(120);
});

test('a failing batch rolls back entirely', async () => {
  const { devices, sessions, events } = await setup();
  const d = await devices.ensure('AA:01', null);
  const s = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  const good = event(s.id, d.id, '2026-11-25T12:00:00Z');
  const bad = event('missing-session', d.id, '2026-11-25T12:00:01Z');
  await expect(events.insertMany([good, bad])).rejects.toThrow();
  expect(await events.allForSession(s.id)).toHaveLength(0);
});

test('lists events in observation order with cursor pagination and type filter', async () => {
  const { devices, sessions, events } = await setup();
  const d = await devices.ensure('AA:01', null);
  const s = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  await events.insertMany([
    event(s.id, d.id, '2026-11-25T12:00:03Z', { eventType: 'MANUAL_WAKE_MARKER', source: 'USER_MARKER' }),
    event(s.id, d.id, '2026-11-25T12:00:01Z'),
    event(s.id, d.id, '2026-11-25T12:00:02Z', { eventType: 'CONNECTION_LOST' }),
  ]);

  const page1 = await events.listBySession(s.id, { limit: 2 });
  expect(page1.map((e) => e.observedAt)).toEqual(['2026-11-25T12:00:01Z', '2026-11-25T12:00:02Z']);
  const last = page1[1]!;
  const page2 = await events.listBySession(s.id, {
    limit: 2,
    after: { observedAt: last.observedAt, seq: last.seq },
  });
  expect(page2.map((e) => e.eventType)).toEqual(['MANUAL_WAKE_MARKER']);
  expect(page2[0]?.source).toBe('USER_MARKER');

  const markers = await events.listBySession(s.id, {
    eventTypes: ['MANUAL_WAKE_MARKER', 'CONNECTION_LOST'],
  });
  expect(markers).toHaveLength(2);
});

test('events observed in the same millisecond keep their insertion order', async () => {
  const { devices, sessions, events } = await setup();
  const d = await devices.ensure('AA:01', null);
  const s = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  const at = '2026-11-25T12:00:00.000Z';
  const batch = ['first', 'second', 'third'].map((description) =>
    event(s.id, d.id, at, { description }),
  );
  await events.insertMany(batch);
  const page1 = await events.listBySession(s.id, { limit: 2 });
  const page2 = await events.listBySession(s.id, {
    after: { observedAt: at, seq: page1[1]!.seq },
  });
  expect([...page1, ...page2].map((e) => e.description)).toEqual(['first', 'second', 'third']);
});

test('the timeline query uses the session index', async () => {
  const { db } = await setup();
  const { rows } = await db.execute(
    'EXPLAIN QUERY PLAN SELECT rowid AS seq, * FROM events WHERE session_id = ? ORDER BY observed_at, rowid LIMIT 50',
    ['s'],
  );
  const plan = rows.map((r) => String(r.detail)).join(' ');
  expect(plan).toContain('idx_events_session_observed');
  expect(plan).not.toContain('TEMP B-TREE');
});

test('session summaries include device name and event count', async () => {
  const { devices, sessions, events } = await setup();
  const d = await devices.ensure('AA:01', 'Advertised');
  const s = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: '0.1.0' });
  await events.insertMany([event(s.id, d.id, '2026-11-25T12:00:00Z')]);
  const [summary] = await sessions.listSummaries();
  expect(summary).toMatchObject({ id: s.id, deviceName: 'Advertised', eventCount: 1 });
});

test('GATT profiles are stored once per device and hash', async () => {
  const { devices, gatt } = await setup();
  const d = await devices.ensure('AA:01', null);
  const profile = { deviceId: 'AA:01', discoveredAt: '2026-11-25T12:00:00Z', services: [] };
  expect(await gatt.saveIfNew(d.id, profile, 'h1')).toBe(true);
  expect(await gatt.saveIfNew(d.id, profile, 'h1')).toBe(false);
  expect(await gatt.saveIfNew(d.id, profile, 'h2')).toBe(true);
  expect(await gatt.listForDevice(d.id)).toHaveLength(2);
});
