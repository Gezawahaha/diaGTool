import type { SqlDatabase } from './sql';

/**
 * Local schema migrations, applied in order and tracked with
 * PRAGMA user_version. Append new migrations; never edit a shipped one.
 *
 * Columns mirror the D1 schema (services/api/migrations) so records sync
 * without translation, plus local sync bookkeeping.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE devices (
    id                        TEXT PRIMARY KEY,
    ble_identifier            TEXT,
    display_name              TEXT,
    advertised_name           TEXT,
    device_role               TEXT NOT NULL DEFAULT 'UNASSIGNED',
    identification_confidence TEXT NOT NULL DEFAULT 'UNKNOWN',
    identification_notes      TEXT,
    created_at                TEXT NOT NULL,
    updated_at                TEXT NOT NULL,
    deleted_at                TEXT,
    sync_status               TEXT NOT NULL DEFAULT 'PENDING'
  );
  CREATE UNIQUE INDEX idx_devices_ble_identifier
    ON devices(ble_identifier) WHERE deleted_at IS NULL;

  CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL REFERENCES devices(id),
    session_type TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    ended_at     TEXT,
    status       TEXT NOT NULL,
    app_version  TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL,
    sync_status  TEXT NOT NULL DEFAULT 'PENDING'
  );
  CREATE INDEX idx_sessions_device_started ON sessions(device_id, started_at);
  CREATE INDEX idx_sessions_started ON sessions(started_at);

  CREATE TABLE events (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL REFERENCES sessions(id),
    device_id           TEXT NOT NULL REFERENCES devices(id),
    event_type          TEXT NOT NULL,
    observed_at         TEXT NOT NULL,
    recorded_at         TEXT NOT NULL,
    source              TEXT NOT NULL,
    description         TEXT,
    rssi                INTEGER,
    connection_state    TEXT,
    service_uuid        TEXT,
    characteristic_uuid TEXT,
    raw_payload_hex     TEXT,
    metadata_json       TEXT,
    sync_status         TEXT NOT NULL DEFAULT 'PENDING',
    sync_error          TEXT,
    synced_at           TEXT
  );
  CREATE INDEX idx_events_session_observed ON events(session_id, observed_at);
  CREATE INDEX idx_events_pending ON events(sync_status) WHERE sync_status = 'PENDING';

  CREATE TABLE gatt_profiles (
    id            TEXT PRIMARY KEY,
    device_id     TEXT NOT NULL REFERENCES devices(id),
    profile_hash  TEXT NOT NULL,
    profile_json  TEXT NOT NULL,
    discovered_at TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    sync_status   TEXT NOT NULL DEFAULT 'PENDING',
    UNIQUE (device_id, profile_hash)
  );
  `,
  `
  -- Sprint 4: settings and per-record sync errors.
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  ALTER TABLE devices ADD COLUMN sync_error TEXT;
  ALTER TABLE sessions ADD COLUMN sync_error TEXT;
  CREATE INDEX idx_devices_pending ON devices(sync_status) WHERE sync_status = 'PENDING';
  CREATE INDEX idx_sessions_pending ON sessions(sync_status) WHERE sync_status = 'PENDING';
  `,
];

function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

/** Apply pending migrations. Returns the resulting schema version. */
export async function migrate(db: SqlDatabase): Promise<number> {
  await db.execute('PRAGMA foreign_keys = ON');
  const { rows } = await db.execute('PRAGMA user_version');
  let version = Number(rows[0]?.user_version ?? 0);

  for (; version < MIGRATIONS.length; version++) {
    const next = version + 1;
    await db.transaction(async (tx) => {
      for (const statement of statements(MIGRATIONS[version]!)) {
        await tx.execute(statement);
      }
      // PRAGMA cannot be parameterised; `next` is an integer we control.
      await tx.execute(`PRAGMA user_version = ${next}`);
    });
  }
  return version;
}
