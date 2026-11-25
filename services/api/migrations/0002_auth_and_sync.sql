-- Migration 0002: authentication and sync support.

-- Refresh tokens are opaque random values; only their SHA-256 is stored.
-- Rotation: each use replaces the token. Presenting a rotated token again
-- revokes the whole family (likely theft).
CREATE TABLE refresh_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  family_id    TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  device_label TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT NOT NULL,
  rotated_at   TEXT,
  revoked_at   TEXT
);

CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Failed logins per account, for lockout. Rows older than the lockout
-- window are deleted opportunistically on login.
CREATE TABLE auth_failures (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX idx_auth_failures_email_time ON auth_failures(email, attempted_at);

-- The phone records the advertised BLE name separately from the user's
-- display name; neither establishes the SRAM model.
ALTER TABLE user_devices ADD COLUMN advertised_name TEXT;
