import { SYNC_DEVICE_FIELDS, SYNC_EVENT_FIELDS, SYNC_SESSION_FIELDS } from '@axs/shared';
import type { SqlDatabase, SqlRow, SqlValue } from './sql';

/** Wire records, snake_case to match the API (services/api/src/validators/sync.ts). */
export type WireRecord = Record<string, SqlValue>;

export interface OutboxBatch {
  devices: WireRecord[];
  sessions: WireRecord[];
  events: WireRecord[];
}

export interface PendingCounts {
  devices: number;
  sessions: number;
  events: number;
  rejected: number;
}

// Local column names equal the wire field names, so the shared lists select
// exactly what the API accepts.
const DEVICE_COLUMNS = SYNC_DEVICE_FIELDS.join(', ');
const SESSION_COLUMNS = SYNC_SESSION_FIELDS.join(', ');
const EVENT_COLUMNS = SYNC_EVENT_FIELDS.join(', ');

/**
 * "Row still equals what was sent", comparing every synced field. Timestamps
 * alone are not enough: an edit in the same millisecond keeps updated_at.
 */
const unchanged = (fields: readonly string[]) => fields.map((f) => `${f} IS ?`).join(' AND ');
const UNCHANGED_DEVICE = unchanged(SYNC_DEVICE_FIELDS);
const UNCHANGED_SESSION = unchanged(SYNC_SESSION_FIELDS);

function inList(ids: readonly string[]): string {
  return ids.map(() => '?').join(', ');
}

function plain(rows: SqlRow[]): WireRecord[] {
  return rows.map((r) => ({ ...r }));
}

/**
 * Local outbox queries (PROJECT.md §12). Records are never deleted after a
 * successful sync — only their sync_status changes.
 */
export class SyncOutbox {
  constructor(private readonly db: SqlDatabase) {}

  async counts(): Promise<PendingCounts> {
    const { rows } = await this.db.execute(`
      SELECT
        (SELECT COUNT(*) FROM devices WHERE sync_status = 'PENDING' AND deleted_at IS NULL) AS devices,
        (SELECT COUNT(*) FROM sessions WHERE sync_status = 'PENDING') AS sessions,
        (SELECT COUNT(*) FROM events WHERE sync_status = 'PENDING') AS events,
        (SELECT COUNT(*) FROM events WHERE sync_status = 'REJECTED')
          + (SELECT COUNT(*) FROM sessions WHERE sync_status = 'REJECTED')
          + (SELECT COUNT(*) FROM devices WHERE sync_status = 'REJECTED') AS rejected`);
    const r = rows[0] ?? {};
    return {
      devices: Number(r.devices ?? 0),
      sessions: Number(r.sessions ?? 0),
      events: Number(r.events ?? 0),
      rejected: Number(r.rejected ?? 0),
    };
  }

  /**
   * Next batch: up to `maxEvents` pending events in observation order, plus
   * every pending device/session and the parents those events need, so the
   * server can accept the batch on its own.
   */
  async nextBatch(maxEvents: number, maxParents = 50): Promise<OutboxBatch> {
    const events = plain(
      (
        await this.db.execute(
          `SELECT ${EVENT_COLUMNS} FROM events WHERE sync_status = 'PENDING'
           ORDER BY observed_at, rowid LIMIT ?`,
          [maxEvents],
        )
      ).rows,
    );
    const sessionIds = [...new Set(events.map((e) => String(e.session_id)))];
    const sessions = plain(
      (
        await this.db.execute(
          `SELECT ${SESSION_COLUMNS} FROM sessions
           WHERE id IN (${inList(sessionIds) || 'NULL'})
              OR id IN (SELECT id FROM sessions WHERE sync_status = 'PENDING' ORDER BY started_at LIMIT ?)`,
          [...sessionIds, maxParents],
        )
      ).rows,
    );
    const deviceIds = [
      ...new Set([...events.map((e) => String(e.device_id)), ...sessions.map((s) => String(s.device_id))]),
    ];
    const devices = plain(
      (
        await this.db.execute(
          `SELECT ${DEVICE_COLUMNS} FROM devices
           WHERE id IN (${inList(deviceIds) || 'NULL'})
              OR id IN (SELECT id FROM devices WHERE sync_status = 'PENDING' AND deleted_at IS NULL
                        ORDER BY created_at LIMIT ?)`,
          [...deviceIds, maxParents],
        )
      ).rows,
    );
    return { devices, sessions, events };
  }

  /**
   * Apply the server's verdicts. Devices and sessions are only marked synced
   * if they still match what was sent, so a local edit made while the
   * request was in flight is sent on the next run instead of being lost.
   */
  async applyResult(
    sent: OutboxBatch,
    result: {
      devices: { accepted: string[]; rejected: { id: string | null; reason: string; detail?: string }[] };
      sessions: { accepted: string[]; rejected: { id: string | null; reason: string; detail?: string }[] };
      events: {
        accepted: string[];
        duplicate: string[];
        rejected: { id: string | null; reason: string; detail?: string }[];
      };
    },
    syncedAt: string,
  ): Promise<void> {
    const sentDevices = new Map(sent.devices.map((d) => [String(d.id), d]));
    const sentSessions = new Map(sent.sessions.map((s) => [String(s.id), s]));
    const sentEvents = new Set(sent.events.map((e) => String(e.id)));
    const reason = (r: { reason: string; detail?: string }) =>
      r.detail ? `${r.reason}: ${r.detail}` : r.reason;

    await this.db.transaction(async (tx) => {
      for (const id of result.devices.accepted) {
        const d = sentDevices.get(id);
        if (d) {
          await tx.execute(
            `UPDATE devices SET sync_status = 'SYNCED', sync_error = NULL
             WHERE ${UNCHANGED_DEVICE} AND sync_status = 'PENDING'`,
            SYNC_DEVICE_FIELDS.map((f) => d[f] ?? null),
          );
        }
      }
      for (const id of result.sessions.accepted) {
        const s = sentSessions.get(id);
        if (s) {
          await tx.execute(
            `UPDATE sessions SET sync_status = 'SYNCED', sync_error = NULL
             WHERE ${UNCHANGED_SESSION} AND sync_status = 'PENDING'`,
            SYNC_SESSION_FIELDS.map((f) => s[f] ?? null),
          );
        }
      }
      const syncedEvents = [...result.events.accepted, ...result.events.duplicate].filter((id) =>
        sentEvents.has(id),
      );
      for (let i = 0; i < syncedEvents.length; i += 100) {
        const chunk = syncedEvents.slice(i, i + 100);
        await tx.execute(
          `UPDATE events SET sync_status = 'SYNCED', sync_error = NULL, synced_at = ?
           WHERE id IN (${inList(chunk)})`,
          [syncedAt, ...chunk],
        );
      }
      for (const [table, rejected, known] of [
        ['devices', result.devices.rejected, sentDevices],
        ['sessions', result.sessions.rejected, sentSessions],
        ['events', result.events.rejected, sentEvents],
      ] as const) {
        for (const r of rejected) {
          if (r.id && known.has(r.id)) {
            await tx.execute(
              `UPDATE ${table} SET sync_status = 'REJECTED', sync_error = ? WHERE id = ?`,
              [reason(r), r.id],
            );
          }
        }
      }
    });
  }

  /** Put rejected records back in the queue (e.g. after a server fix). */
  async retryRejected(): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const table of ['devices', 'sessions', 'events']) {
        await tx.execute(
          `UPDATE ${table} SET sync_status = 'PENDING' WHERE sync_status = 'REJECTED'`,
        );
      }
    });
  }
}
