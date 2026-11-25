import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const EXPECTED_TABLES = [
  'comparison_reports',
  'component_types',
  'diagnostic_events',
  'diagnostic_sessions',
  'gatt_profiles',
  'groupsets',
  'hardware_models',
  'hardware_profiles',
  'sync_receipts',
  'user_devices',
  'users',
];

// Storage persists across tests within a file, so seeding must be idempotent.
async function seedSession() {
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users (id, email) VALUES ('u1', 'owner@example.test')"),
    env.DB.prepare("INSERT OR IGNORE INTO user_devices (id, user_id, display_name) VALUES ('d1', 'u1', 'FD A')"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO diagnostic_sessions (id, user_id, device_id, session_type) VALUES ('s1', 'u1', 'd1', 'IDLE_MONITOR')",
    ),
  ]);
}

describe('migration 0001_initial', () => {
  it('creates every table in PROJECT.md §11', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(EXPECTED_TABLES);
  });

  it('defaults identification to UNKNOWN rather than guessing', async () => {
    await seedSession();
    const device = await env.DB.prepare(
      "SELECT identification_confidence, created_at FROM user_devices WHERE id = 'd1'",
    ).first<{ identification_confidence: string; created_at: string }>();
    expect(device?.identification_confidence).toBe('UNKNOWN');
    expect(device?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rejects a duplicate event id so retries cannot double-insert', async () => {
    await seedSession();
    const insert = () =>
      env.DB.prepare(
        "INSERT INTO diagnostic_events (id, session_id, device_id, event_type) VALUES ('e1', 's1', 'd1', 'MANUAL_WAKE_MARKER')",
      ).run();
    await insert();
    await expect(insert()).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('enforces foreign keys on events', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO diagnostic_events (id, session_id, device_id, event_type) VALUES ('e2', 'missing', 'missing', 'RSSI_SAMPLE')",
      ).run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it('allows one sync receipt per (user, batch)', async () => {
    await seedSession();
    const insert = (id: string) =>
      env.DB.prepare(
        "INSERT INTO sync_receipts (id, user_id, batch_id) VALUES (?, 'u1', 'batch-1')",
      ).bind(id).run();
    await insert('r1');
    await expect(insert('r2')).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('uses the session/observed_at index for timeline queries', async () => {
    const { results } = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM diagnostic_events WHERE session_id = 's1' ORDER BY observed_at LIMIT 50",
    ).all<{ detail: string }>();
    expect(results.map((r) => r.detail).join(' ')).toContain(
      'idx_diagnostic_events_session_observed',
    );
  });
});
