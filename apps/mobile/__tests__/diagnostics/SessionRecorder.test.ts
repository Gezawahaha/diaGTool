import { BLELogger } from '../../src/bluetooth/BLELogger';
import type { GattProfile } from '../../src/bluetooth/types';
import { SessionRecorder } from '../../src/diagnostics/SessionRecorder';
import { migrate } from '../../src/storage/migrations';
import {
  DeviceRepository,
  EventRepository,
  GattProfileRepository,
  SessionRepository,
} from '../../src/storage/repositories';
import { openMemoryDatabase } from '../../src/test-utils/nodeSqlite';

const FD = 'AA:BB:CC:00:00:01';
const OTHER = 'AA:BB:CC:00:00:99';

async function setup(profiles: Record<string, GattProfile> = {}) {
  const db = openMemoryDatabase();
  await migrate(db);
  const logger = new BLELogger();
  const deps = {
    logger,
    devices: new DeviceRepository(db),
    sessions: new SessionRepository(db),
    events: new EventRepository(db),
    gattProfiles: new GattProfileRepository(db),
    getGattProfile: (id: string) => profiles[id],
    appVersion: '0.1.0-test',
  };
  const recorder = new SessionRecorder(deps);
  return { db, recorder, ...deps };
}

test('persists only the session device’s events, keeping their IDs', async () => {
  const { logger, recorder, events } = await setup();
  const { session } = await recorder.start({
    bleDeviceId: FD,
    advertisedName: 'FD',
    sessionType: 'IDLE_MONITOR',
  });

  const own = logger.log({ bleDeviceId: FD, eventType: 'CONNECTION_LOST', description: 'lost' });
  logger.log({ bleDeviceId: OTHER, eventType: 'DEVICE_DISCOVERED', description: 'phone' });
  await recorder.flush();

  const stored = await events.allForSession(session.id);
  expect(stored.map((e) => e.id)).toEqual([own.id]);
  expect(stored[0]).toMatchObject({ eventType: 'CONNECTION_LOST', syncStatus: 'PENDING' });
});

test('records nothing outside a session', async () => {
  const { logger, recorder, db } = await setup();
  logger.log({ bleDeviceId: FD, eventType: 'DEVICE_DISCOVERED', description: 'seen' });
  await recorder.flush();
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM events');
  expect(rows[0]?.n).toBe(0);
});

test('user markers are stored as USER_MARKER with the note', async () => {
  const { recorder, events } = await setup();
  const { session } = await recorder.start({ bleDeviceId: FD, advertisedName: null, sessionType: 'MANUAL_WAKE' });

  recorder.addMarker('USER_REPORTED_UNRESPONSIVE');
  recorder.addMarker('MANUAL_WAKE_MARKER', '  pressed twice ');
  await recorder.flush();

  const stored = await events.allForSession(session.id);
  expect(stored.map((e) => [e.eventType, e.source])).toEqual([
    ['USER_REPORTED_UNRESPONSIVE', 'USER_MARKER'],
    ['MANUAL_WAKE_MARKER', 'USER_MARKER'],
  ]);
  expect(JSON.parse(stored[1]!.metadataJson!)).toEqual({ note: 'pressed twice' });
});

test('markers require an active session', async () => {
  const { recorder } = await setup();
  expect(() => recorder.addMarker('MANUAL_WAKE_MARKER')).toThrow(/Start a diagnostic session/);
});

test('only one session may be active', async () => {
  const { recorder } = await setup();
  await recorder.start({ bleDeviceId: FD, advertisedName: null, sessionType: 'GENERAL' });
  await expect(
    recorder.start({ bleDeviceId: OTHER, advertisedName: null, sessionType: 'GENERAL' }),
  ).rejects.toThrow(/already active/);
});

test('stop flushes events and completes the session', async () => {
  const { logger, recorder, events, sessions } = await setup();
  const { session } = await recorder.start({ bleDeviceId: FD, advertisedName: null, sessionType: 'GENERAL' });
  logger.log({ bleDeviceId: FD, eventType: 'RSSI_SAMPLE', description: 'rssi', rssi: -55 });

  const ended = await recorder.stop();
  expect(ended?.status).toBe('COMPLETED');
  expect(await events.allForSession(session.id)).toHaveLength(1);
  expect(recorder.getStatus().active).toBeNull();
  expect((await sessions.getById(session.id))?.endedAt).not.toBeNull();
});

test('failed writes are kept and retried without duplicates', async () => {
  const { logger, recorder, events } = await setup();
  const { session } = await recorder.start({ bleDeviceId: FD, advertisedName: null, sessionType: 'GENERAL' });

  const realInsert = events.insertMany.bind(events);
  const insert = jest
    .spyOn(events, 'insertMany')
    .mockRejectedValue(new Error('disk I/O error'));

  logger.log({ bleDeviceId: FD, eventType: 'RSSI_SAMPLE', description: 'a' });
  await recorder.flush();
  expect(recorder.getStatus()).toMatchObject({ pendingWrites: 1, lastError: 'disk I/O error' });
  // Ending the session retries the write; while storage still fails, the
  // session stays active rather than losing events.
  await expect(recorder.stop()).rejects.toThrow(/not yet saved/);
  expect(recorder.getStatus().active).not.toBeNull();

  insert.mockImplementation(realInsert);
  logger.log({ bleDeviceId: FD, eventType: 'RSSI_SAMPLE', description: 'b' });
  await recorder.flush();
  expect(recorder.getStatus()).toMatchObject({ pendingWrites: 0, lastError: null });
  expect((await events.allForSession(session.id)).map((e) => e.description)).toEqual(['a', 'b']);
  await recorder.stop();
});

test('stores the GATT profile once when discovered during a session', async () => {
  const profile: GattProfile = {
    deviceId: FD,
    discoveredAt: '2026-11-25T12:00:00.000Z',
    services: [{ uuid: '180F', characteristics: [] }],
  };
  const { logger, recorder, gattProfiles, devices } = await setup({ [FD]: profile });
  await recorder.start({ bleDeviceId: FD, advertisedName: null, sessionType: 'GENERAL' });
  logger.log({ bleDeviceId: FD, eventType: 'GATT_DISCOVERED', description: 'gatt' });
  logger.log({ bleDeviceId: FD, eventType: 'GATT_DISCOVERED', description: 'gatt again' });
  await recorder.flush();
  await new Promise<void>((r) => setTimeout(r, 0));

  const device = await devices.findByBleIdentifier(FD);
  expect(await gattProfiles.listForDevice(device!.id)).toHaveLength(1);
  await recorder.stop();
});

test('init marks sessions from a previous run as interrupted', async () => {
  const { recorder, sessions, devices } = await setup();
  const d = await devices.ensure(FD, null);
  const old = await sessions.create({ deviceId: d.id, sessionType: 'GENERAL', appVersion: 'x' });
  expect(await recorder.init()).toBe(1);
  expect((await sessions.getById(old.id))?.status).toBe('INTERRUPTED');
});
