-- Migration 0001: initial schema (PROJECT.md §11).
-- Timestamps are ISO-8601 UTC strings. Observation timestamps come from the
-- phone; created_at/received_at are server-assigned and stored separately.
-- D1 enforces foreign keys by default.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  password_hash TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Hardware catalog (a product taxonomy, not proof of protocol compatibility)
-- ---------------------------------------------------------------------------

CREATE TABLE groupsets (
  id                  TEXT PRIMARY KEY,
  brand               TEXT NOT NULL,
  name                TEXT NOT NULL,
  discipline          TEXT,
  generation_label    TEXT,
  release_year        INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  source_url          TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE component_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE hardware_models (
  id                  TEXT PRIMARY KEY,
  groupset_id         TEXT REFERENCES groupsets(id),
  component_type_id   TEXT REFERENCES component_types(id),
  model_number        TEXT,
  part_number         TEXT,
  generation          TEXT,
  hardware_revision   TEXT,
  fcc_id              TEXT,
  ic_id               TEXT,
  known_firmware      TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  source_url          TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_hardware_models_model_number ON hardware_models(model_number);
CREATE INDEX idx_hardware_models_part_number  ON hardware_models(part_number);
CREATE INDEX idx_hardware_models_fcc_id       ON hardware_models(fcc_id);
CREATE INDEX idx_hardware_models_ic_id        ON hardware_models(ic_id);

CREATE TABLE hardware_profiles (
  id                           TEXT PRIMARY KEY,
  hardware_model_id            TEXT REFERENCES hardware_models(id),
  profile_version              INTEGER NOT NULL DEFAULT 1,
  ble_capabilities_json        TEXT,
  gatt_profile_json            TEXT,
  diagnostic_capabilities_json TEXT,
  recovery_capabilities_json   TEXT,
  verification_status          TEXT NOT NULL DEFAULT 'UNVERIFIED',
  source_notes                 TEXT,
  created_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Owner-private records
-- ---------------------------------------------------------------------------

CREATE TABLE user_devices (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  hardware_model_id         TEXT REFERENCES hardware_models(id),
  hardware_profile_id       TEXT REFERENCES hardware_profiles(id),
  display_name              TEXT,
  device_role               TEXT,
  ble_identifier            TEXT,
  serial_number             TEXT,
  model_number              TEXT,
  part_number               TEXT,
  fcc_id                    TEXT,
  ic_id                     TEXT,
  hardware_revision         TEXT,
  firmware_version          TEXT,
  identification_confidence TEXT NOT NULL DEFAULT 'UNKNOWN',
  identification_notes      TEXT,
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at                TEXT
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);

CREATE TABLE diagnostic_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  device_id    TEXT NOT NULL REFERENCES user_devices(id),
  session_type TEXT,
  started_at   TEXT,
  ended_at     TEXT,
  status       TEXT,
  app_version  TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_diagnostic_sessions_device_id  ON diagnostic_sessions(device_id);
CREATE INDEX idx_diagnostic_sessions_started_at ON diagnostic_sessions(started_at);

CREATE TABLE diagnostic_events (
  id                  TEXT PRIMARY KEY,  -- client-generated UUID; idempotency key
  session_id          TEXT NOT NULL REFERENCES diagnostic_sessions(id),
  device_id           TEXT NOT NULL REFERENCES user_devices(id),
  event_type          TEXT NOT NULL,
  observed_at         TEXT,
  recorded_at         TEXT,
  source              TEXT,
  description         TEXT,
  rssi                INTEGER,
  connection_state    TEXT,
  service_uuid        TEXT,
  characteristic_uuid TEXT,
  raw_payload_hex     TEXT,
  metadata_json       TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- (session_id, observed_at) serves both "events for a session" and
-- timeline/cursor ordering, so no separate session_id-only index is needed.
CREATE INDEX idx_diagnostic_events_session_observed ON diagnostic_events(session_id, observed_at);
CREATE INDEX idx_diagnostic_events_device_id        ON diagnostic_events(device_id);
CREATE INDEX idx_diagnostic_events_observed_at      ON diagnostic_events(observed_at);

CREATE TABLE gatt_profiles (
  id                  TEXT PRIMARY KEY,
  device_id           TEXT NOT NULL REFERENCES user_devices(id),
  profile_hash        TEXT,
  profile_json        TEXT NOT NULL,
  discovered_at       TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_gatt_profiles_device_id ON gatt_profiles(device_id);

CREATE TABLE comparison_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  device_a_id TEXT NOT NULL REFERENCES user_devices(id),
  device_b_id TEXT NOT NULL REFERENCES user_devices(id),
  report_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_comparison_reports_user_id ON comparison_reports(user_id);

CREATE TABLE sync_receipts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  batch_id        TEXT NOT NULL,
  accepted_count  INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count  INTEGER NOT NULL DEFAULT 0,
  received_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, batch_id)
);
