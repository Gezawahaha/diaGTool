import { APP_VERSION } from '../app/version';
import { getBLEManager } from '../bluetooth/BLEManager';
import { SessionRecorder } from '../diagnostics/SessionRecorder';
import { migrate } from './migrations';
import { openDeviceDatabase } from './opSqlite';
import {
  DeviceRepository,
  EventRepository,
  GattProfileRepository,
  SessionRepository,
} from './repositories';
import type { SqlDatabase } from './sql';

export interface LocalServices {
  db: SqlDatabase;
  devices: DeviceRepository;
  sessions: SessionRepository;
  events: EventRepository;
  gattProfiles: GattProfileRepository;
  recorder: SessionRecorder;
}

/** Build repositories and the recorder on a migrated database. */
export async function createLocalServices(db: SqlDatabase): Promise<LocalServices> {
  await migrate(db);
  const devices = new DeviceRepository(db);
  const sessions = new SessionRepository(db);
  const events = new EventRepository(db);
  const gattProfiles = new GattProfileRepository(db);
  const ble = getBLEManager();
  const recorder = new SessionRecorder({
    logger: ble.logger,
    devices,
    sessions,
    events,
    gattProfiles,
    getGattProfile: (id) => ble.gatt.getProfile(id),
    appVersion: APP_VERSION,
  });
  await recorder.init();
  return { db, devices, sessions, events, gattProfiles, recorder };
}

let services: Promise<LocalServices> | null = null;

/** App-wide local storage, opened and migrated once. */
export function getLocalServices(): Promise<LocalServices> {
  services ??= createLocalServices(openDeviceDatabase()).catch((err) => {
    services = null;
    throw err;
  });
  return services;
}

export async function disposeLocalServices(): Promise<void> {
  const current = services;
  services = null;
  const resolved = await current?.catch(() => null);
  await resolved?.recorder.dispose();
}
