import type {
  DeviceRole,
  EventSource,
  EventType,
  IdentificationConfidence,
  SessionStatus,
  SessionType,
  SyncStatus,
} from '@axs/shared';
import type { ConnectionState, GattProfile } from '../bluetooth/types';
import { uuidv4 } from '../utils/id';
import { optNum, optStr, str, type SqlDatabase, type SqlRow, type SqlValue } from './sql';

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface DeviceRecord {
  id: string;
  bleIdentifier: string | null;
  displayName: string | null;
  /** Name as advertised when saved. Not evidence of the model. */
  advertisedName: string | null;
  deviceRole: DeviceRole;
  identificationConfidence: IdentificationConfidence;
  identificationNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  deviceId: string;
  sessionType: SessionType;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  appVersion: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SessionSummary extends SessionRecord {
  deviceName: string | null;
  eventCount: number;
}

export interface EventRecord {
  id: string;
  /**
   * Local insertion order (SQLite rowid). Breaks ties between events
   * observed in the same millisecond, so they keep the order they happened.
   */
  seq: number;
  sessionId: string;
  deviceId: string;
  eventType: EventType;
  observedAt: string;
  recordedAt: string;
  source: EventSource;
  description: string | null;
  rssi: number | null;
  connectionState: ConnectionState | null;
  serviceUuid: string | null;
  characteristicUuid: string | null;
  rawPayloadHex: string | null;
  metadataJson: string | null;
  syncStatus: SyncStatus;
}

export type NewEvent = Omit<EventRecord, 'seq' | 'syncStatus'>;

type Clock = () => Date;
const systemClock: Clock = () => new Date();

function toDevice(r: SqlRow): DeviceRecord {
  return {
    id: str(r, 'id'),
    bleIdentifier: optStr(r, 'ble_identifier'),
    displayName: optStr(r, 'display_name'),
    advertisedName: optStr(r, 'advertised_name'),
    deviceRole: str(r, 'device_role') as DeviceRole,
    identificationConfidence: str(r, 'identification_confidence') as IdentificationConfidence,
    identificationNotes: optStr(r, 'identification_notes'),
    createdAt: str(r, 'created_at'),
    updatedAt: str(r, 'updated_at'),
  };
}

function toSession(r: SqlRow): SessionRecord {
  return {
    id: str(r, 'id'),
    deviceId: str(r, 'device_id'),
    sessionType: str(r, 'session_type') as SessionType,
    startedAt: str(r, 'started_at'),
    endedAt: optStr(r, 'ended_at'),
    status: str(r, 'status') as SessionStatus,
    appVersion: optStr(r, 'app_version'),
    notes: optStr(r, 'notes'),
    createdAt: str(r, 'created_at'),
  };
}

function toEvent(r: SqlRow): EventRecord {
  return {
    id: str(r, 'id'),
    seq: Number(r.seq),
    sessionId: str(r, 'session_id'),
    deviceId: str(r, 'device_id'),
    eventType: str(r, 'event_type') as EventType,
    observedAt: str(r, 'observed_at'),
    recordedAt: str(r, 'recorded_at'),
    source: str(r, 'source') as EventSource,
    description: optStr(r, 'description'),
    rssi: optNum(r, 'rssi'),
    connectionState: optStr(r, 'connection_state') as ConnectionState | null,
    serviceUuid: optStr(r, 'service_uuid'),
    characteristicUuid: optStr(r, 'characteristic_uuid'),
    rawPayloadHex: optStr(r, 'raw_payload_hex'),
    metadataJson: optStr(r, 'metadata_json'),
    syncStatus: str(r, 'sync_status') as SyncStatus,
  };
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export class DeviceRepository {
  constructor(private readonly db: SqlDatabase, private readonly now: Clock = systemClock) {}

  async getById(id: string): Promise<DeviceRecord | null> {
    const { rows } = await this.db.execute(
      'SELECT * FROM devices WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async findByBleIdentifier(bleIdentifier: string): Promise<DeviceRecord | null> {
    const { rows } = await this.db.execute(
      'SELECT * FROM devices WHERE ble_identifier = ? AND deleted_at IS NULL',
      [bleIdentifier],
    );
    return rows[0] ? toDevice(rows[0]) : null;
  }

  async list(): Promise<DeviceRecord[]> {
    const { rows } = await this.db.execute(
      'SELECT * FROM devices WHERE deleted_at IS NULL ORDER BY created_at DESC',
    );
    return rows.map(toDevice);
  }

  /** Return the saved device for a BLE identifier, saving it first if needed. */
  async ensure(bleIdentifier: string, advertisedName: string | null): Promise<DeviceRecord> {
    const existing = await this.findByBleIdentifier(bleIdentifier);
    if (existing) {
      return existing;
    }
    const at = this.now().toISOString();
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO devices (id, ble_identifier, display_name, advertised_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, bleIdentifier, advertisedName, advertisedName, at, at],
    );
    return (await this.getById(id))!;
  }

  async setRole(id: string, role: DeviceRole): Promise<void> {
    await this.update(id, 'device_role', role);
  }

  async setDisplayName(id: string, name: string | null): Promise<void> {
    await this.update(id, 'display_name', name);
  }

  private async update(id: string, column: string, value: SqlValue): Promise<void> {
    await this.db.execute(
      `UPDATE devices SET ${column} = ?, updated_at = ?, sync_status = 'PENDING' WHERE id = ?`,
      [value, this.now().toISOString(), id],
    );
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export class SessionRepository {
  constructor(private readonly db: SqlDatabase, private readonly now: Clock = systemClock) {}

  async create(input: {
    deviceId: string;
    sessionType: SessionType;
    appVersion: string;
    notes?: string | null;
  }): Promise<SessionRecord> {
    const at = this.now().toISOString();
    const id = uuidv4();
    await this.db.execute(
      `INSERT INTO sessions (id, device_id, session_type, started_at, status, app_version, notes, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [id, input.deviceId, input.sessionType, at, input.appVersion, input.notes ?? null, at],
    );
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<SessionRecord | null> {
    const { rows } = await this.db.execute('SELECT * FROM sessions WHERE id = ?', [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async complete(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE sessions SET status = 'COMPLETED', ended_at = ?, sync_status = 'PENDING'
       WHERE id = ? AND status = 'ACTIVE'`,
      [this.now().toISOString(), id],
    );
  }

  /**
   * Sessions still ACTIVE at startup were cut off by the app stopping.
   * Their end time is unknown, so ended_at stays NULL.
   */
  async markActiveInterrupted(): Promise<number> {
    const { rowsAffected } = await this.db.execute(
      `UPDATE sessions SET status = 'INTERRUPTED', sync_status = 'PENDING' WHERE status = 'ACTIVE'`,
    );
    return rowsAffected;
  }

  async listSummaries(limit = 50): Promise<SessionSummary[]> {
    const { rows } = await this.db.execute(
      `SELECT s.*, COALESCE(d.display_name, d.advertised_name, d.ble_identifier) AS device_name,
              (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count
       FROM sessions s JOIN devices d ON d.id = s.device_id
       ORDER BY s.started_at DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      ...toSession(r),
      deviceName: optStr(r, 'device_name'),
      eventCount: Number(r.event_count ?? 0),
    }));
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Rows per INSERT statement; stays under SQLite's bound-parameter limits. */
const INSERT_CHUNK = 50;
const EVENT_COLUMNS = [
  'id',
  'session_id',
  'device_id',
  'event_type',
  'observed_at',
  'recorded_at',
  'source',
  'description',
  'rssi',
  'connection_state',
  'service_uuid',
  'characteristic_uuid',
  'raw_payload_hex',
  'metadata_json',
] as const;

function eventParams(e: NewEvent): SqlValue[] {
  return [
    e.id,
    e.sessionId,
    e.deviceId,
    e.eventType,
    e.observedAt,
    e.recordedAt,
    e.source,
    e.description,
    e.rssi,
    e.connectionState,
    e.serviceUuid,
    e.characteristicUuid,
    e.rawPayloadHex,
    e.metadataJson,
  ];
}

export interface EventQuery {
  eventTypes?: readonly EventType[];
  limit?: number;
  /** Cursor: return events strictly after this (observedAt, seq) pair. */
  after?: { observedAt: string; seq: number };
}

export class EventRepository {
  constructor(private readonly db: SqlDatabase) {}

  /**
   * Insert events atomically. Existing IDs are ignored, so retrying a batch
   * never duplicates events. Returns the number of rows actually inserted.
   */
  async insertMany(events: readonly NewEvent[]): Promise<number> {
    let inserted = 0;
    if (events.length === 0) {
      return inserted;
    }
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < events.length; i += INSERT_CHUNK) {
        const chunk = events.slice(i, i + INSERT_CHUNK);
        const placeholders = chunk
          .map(() => `(${EVENT_COLUMNS.map(() => '?').join(', ')})`)
          .join(', ');
        const { rowsAffected } = await tx.execute(
          `INSERT OR IGNORE INTO events (${EVENT_COLUMNS.join(', ')}) VALUES ${placeholders}`,
          chunk.flatMap(eventParams),
        );
        inserted += rowsAffected;
      }
    });
    return inserted;
  }

  /** Events for a session in observation order, paginated by cursor. */
  async listBySession(sessionId: string, query: EventQuery = {}): Promise<EventRecord[]> {
    const where = ['session_id = ?'];
    const params: SqlValue[] = [sessionId];
    if (query.eventTypes && query.eventTypes.length > 0) {
      where.push(`event_type IN (${query.eventTypes.map(() => '?').join(', ')})`);
      params.push(...query.eventTypes);
    }
    if (query.after) {
      where.push('(observed_at > ? OR (observed_at = ? AND rowid > ?))');
      params.push(query.after.observedAt, query.after.observedAt, query.after.seq);
    }
    params.push(query.limit ?? 200);
    // rowid is part of every SQLite index, so this order is served by
    // idx_events_session_observed without a sort.
    const { rows } = await this.db.execute(
      `SELECT rowid AS seq, * FROM events WHERE ${where.join(' AND ')}
       ORDER BY observed_at, rowid LIMIT ?`,
      params,
    );
    return rows.map(toEvent);
  }

  /** Every event in a session, fetched page by page (for export). */
  async allForSession(sessionId: string, pageSize = 500): Promise<EventRecord[]> {
    const out: EventRecord[] = [];
    let after: EventQuery['after'];
    for (;;) {
      const page = await this.listBySession(sessionId, { limit: pageSize, after });
      out.push(...page);
      const last = page.at(-1);
      if (!last || page.length < pageSize) {
        return out;
      }
      after = { observedAt: last.observedAt, seq: last.seq };
    }
  }

  async countPending(): Promise<number> {
    const { rows } = await this.db.execute(
      "SELECT COUNT(*) AS n FROM events WHERE sync_status = 'PENDING'",
    );
    return Number(rows[0]?.n ?? 0);
  }
}

// ---------------------------------------------------------------------------
// GATT profiles
// ---------------------------------------------------------------------------

export class GattProfileRepository {
  constructor(private readonly db: SqlDatabase, private readonly now: Clock = systemClock) {}

  /** Store a profile unless this device already has one with the same hash. */
  async saveIfNew(deviceId: string, profile: GattProfile, profileHash: string): Promise<boolean> {
    const { rowsAffected } = await this.db.execute(
      `INSERT OR IGNORE INTO gatt_profiles (id, device_id, profile_hash, profile_json, discovered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        deviceId,
        profileHash,
        JSON.stringify(profile),
        profile.discoveredAt,
        this.now().toISOString(),
      ],
    );
    return rowsAffected > 0;
  }

  async listForDevice(deviceId: string): Promise<{ profileHash: string; discoveredAt: string }[]> {
    const { rows } = await this.db.execute(
      'SELECT profile_hash, discovered_at FROM gatt_profiles WHERE device_id = ? ORDER BY discovered_at',
      [deviceId],
    );
    return rows.map((r) => ({ profileHash: str(r, 'profile_hash'), discoveredAt: str(r, 'discovered_at') }));
  }
}
