import type { SyncBatchResponse, SyncRejection } from '@axs/shared';
import { Hono } from 'hono';
import type { z } from 'zod';
import { toStorageError } from '../lib/d1Errors';
import { requireAuth } from '../middleware/auth';
import type { AppBindings } from '../types/env';
import { parseJsonBody } from '../validators/json';
import {
  batchEnvelopeSchema,
  deviceSchema,
  eventSchema,
  sessionSchema,
} from '../validators/sync';

export const sync = new Hono<AppBindings>();
sync.use('*', requireAuth);

function validateEach<S extends z.ZodType>(items: unknown[], schema: S) {
  const valid: z.output<S>[] = [];
  const rejected: SyncRejection[] = [];
  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      const raw = (item as { id?: unknown } | null)?.id;
      rejected.push({
        index,
        id: typeof raw === 'string' ? raw : null,
        reason: 'INVALID',
        detail: result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '(record)'}: ${i.message}`)
          .join('; '),
      });
    }
  });
  return { valid, rejected };
}

// Records travel as one JSON parameter and are expanded with json_each, so
// a batch is a fixed handful of statements regardless of its size (D1 caps
// bound parameters per query and queries per invocation).
const J = (field: string) => `json_extract(j.value, '$.${field}')`;

const UPSERT_DEVICES = `
  INSERT INTO user_devices (id, user_id, ble_identifier, display_name, advertised_name, device_role,
                            identification_confidence, identification_notes, created_at, updated_at)
  SELECT ${J('id')}, ?1, ${J('ble_identifier')}, ${J('display_name')}, ${J('advertised_name')},
         ${J('device_role')}, ${J('identification_confidence')}, ${J('identification_notes')},
         ${J('created_at')}, ${J('updated_at')}
  FROM json_each(?2) j WHERE true
  ON CONFLICT(id) DO UPDATE SET
    ble_identifier = excluded.ble_identifier,
    display_name = excluded.display_name,
    advertised_name = excluded.advertised_name,
    device_role = excluded.device_role,
    identification_confidence = excluded.identification_confidence,
    identification_notes = excluded.identification_notes,
    updated_at = excluded.updated_at
  WHERE user_devices.user_id = excluded.user_id
    AND excluded.updated_at >= user_devices.updated_at`;

const OWNED_DEVICES = `
  SELECT id FROM user_devices
  WHERE user_id = ?1 AND id IN (SELECT ${J('id')} FROM json_each(?2) j)`;

const UPSERT_SESSIONS = `
  INSERT INTO diagnostic_sessions (id, user_id, device_id, session_type, started_at, ended_at,
                                   status, app_version, notes)
  SELECT ${J('id')}, ?1, ${J('device_id')}, ${J('session_type')}, ${J('started_at')},
         ${J('ended_at')}, ${J('status')}, ${J('app_version')}, ${J('notes')}
  FROM json_each(?2) j
  WHERE EXISTS (SELECT 1 FROM user_devices d WHERE d.id = ${J('device_id')} AND d.user_id = ?1)
  ON CONFLICT(id) DO UPDATE SET
    ended_at = excluded.ended_at,
    status = excluded.status,
    notes = excluded.notes
  WHERE diagnostic_sessions.user_id = excluded.user_id
    AND diagnostic_sessions.device_id = excluded.device_id`;

const OWNED_SESSIONS = `
  SELECT id FROM diagnostic_sessions
  WHERE user_id = ?1 AND id IN (SELECT ${J('id')} FROM json_each(?2) j)`;

/** Which submitted event IDs already exist, and whether they are ours. */
const EXISTING_EVENTS = `
  SELECT e.id, (s.user_id = ?1) AS owned
  FROM diagnostic_events e LEFT JOIN diagnostic_sessions s ON s.id = e.session_id
  WHERE e.id IN (SELECT ${J('id')} FROM json_each(?2) j)`;

/** Submitted events whose session belongs to the user and matches the device. */
const INSERTABLE_EVENTS = `
  SELECT ${J('id')} AS id FROM json_each(?2) j
  WHERE EXISTS (SELECT 1 FROM diagnostic_sessions s
                WHERE s.id = ${J('session_id')} AND s.user_id = ?1 AND s.device_id = ${J('device_id')})`;

const INSERT_EVENTS = `
  INSERT INTO diagnostic_events (id, session_id, device_id, event_type, observed_at, recorded_at,
                                 source, description, rssi, connection_state, service_uuid,
                                 characteristic_uuid, raw_payload_hex, metadata_json)
  SELECT ${J('id')}, ${J('session_id')}, ${J('device_id')}, ${J('event_type')}, ${J('observed_at')},
         ${J('recorded_at')}, ${J('source')}, ${J('description')}, ${J('rssi')},
         ${J('connection_state')}, ${J('service_uuid')}, ${J('characteristic_uuid')},
         ${J('raw_payload_hex')}, ${J('metadata_json')}
  FROM json_each(?2) j
  WHERE EXISTS (SELECT 1 FROM diagnostic_sessions s
                WHERE s.id = ${J('session_id')} AND s.user_id = ?1 AND s.device_id = ${J('device_id')})
  ON CONFLICT(id) DO NOTHING`;

const PRIOR_RECEIPT = 'SELECT 1 AS seen FROM sync_receipts WHERE user_id = ?1 AND batch_id = ?2';

const INSERT_RECEIPT = `
  INSERT INTO sync_receipts (id, user_id, batch_id, accepted_count, duplicate_count, rejected_count)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(user_id, batch_id) DO NOTHING`;

sync.post('/batch', async (c) => {
  const envelope = await parseJsonBody(c, batchEnvelopeSchema);
  const userId = c.get('userId');
  const db = c.env.DB;

  const devices = validateEach(envelope.devices, deviceSchema);
  const sessions = validateEach(envelope.sessions, sessionSchema);
  const events = validateEach(envelope.events, eventSchema);

  const devicesJson = JSON.stringify(devices.valid);
  const sessionsJson = JSON.stringify(sessions.valid);
  const eventsJson = JSON.stringify(events.valid);

  let results: D1Result[];
  try {
    // One batch = one transaction: parents are written before children are
    // checked, and a failure rolls everything back.
    results = await db.batch([
      db.prepare(PRIOR_RECEIPT).bind(userId, envelope.batch_id),
      db.prepare(UPSERT_DEVICES).bind(userId, devicesJson),
      db.prepare(OWNED_DEVICES).bind(userId, devicesJson),
      db.prepare(UPSERT_SESSIONS).bind(userId, sessionsJson),
      db.prepare(OWNED_SESSIONS).bind(userId, sessionsJson),
      db.prepare(EXISTING_EVENTS).bind(userId, eventsJson),
      db.prepare(INSERTABLE_EVENTS).bind(userId, eventsJson),
      db.prepare(INSERT_EVENTS).bind(userId, eventsJson),
    ]);
  } catch (err) {
    throw toStorageError(err);
  }

  const ids = (r: D1Result | undefined) =>
    new Set((r?.results ?? []).map((row) => String((row as { id: unknown }).id)));
  const replayed = (results[0]?.results.length ?? 0) > 0;
  const ownedDevices = ids(results[2]);
  const ownedSessions = ids(results[4]);
  const existing = new Map(
    (results[5]?.results ?? []).map((row) => {
      const r = row as { id: string; owned: number | null };
      return [r.id, r.owned === 1] as const;
    }),
  );
  const insertable = ids(results[6]);

  const response: SyncBatchResponse = {
    batch_id: envelope.batch_id,
    replayed,
    devices: { accepted: [], rejected: devices.rejected },
    sessions: { accepted: [], rejected: sessions.rejected },
    events: { accepted: [], duplicate: [], rejected: events.rejected },
  };

  for (const d of devices.valid) {
    if (ownedDevices.has(d.id)) {
      response.devices.accepted.push(d.id);
    } else {
      response.devices.rejected.push({ index: -1, id: d.id, reason: 'ID_CONFLICT' });
    }
  }
  for (const s of sessions.valid) {
    if (ownedSessions.has(s.id)) {
      response.sessions.accepted.push(s.id);
    } else {
      response.sessions.rejected.push({ index: -1, id: s.id, reason: 'PARENT_NOT_FOUND' });
    }
  }
  for (const e of events.valid) {
    const prior = existing.get(e.id);
    if (prior === true) {
      response.events.duplicate.push(e.id);
    } else if (prior === false) {
      response.events.rejected.push({ index: -1, id: e.id, reason: 'ID_CONFLICT' });
    } else if (insertable.has(e.id)) {
      response.events.accepted.push(e.id);
    } else {
      response.events.rejected.push({ index: -1, id: e.id, reason: 'PARENT_NOT_FOUND' });
    }
  }

  await db
    .prepare(INSERT_RECEIPT)
    .bind(
      crypto.randomUUID(),
      userId,
      envelope.batch_id,
      response.events.accepted.length,
      response.events.duplicate.length,
      response.events.rejected.length,
    )
    .run()
    .catch(() => undefined); // The data is committed; a missing receipt is cosmetic.

  return c.json(response);
});

sync.get('/status', async (c) => {
  try {
    const last = await c.env.DB.prepare(
      `SELECT batch_id, accepted_count, duplicate_count, rejected_count, received_at
       FROM sync_receipts WHERE user_id = ? ORDER BY received_at DESC LIMIT 1`,
    )
      .bind(c.get('userId'))
      .first();
    return c.json({ server_time: new Date().toISOString(), last_receipt: last ?? null });
  } catch (err) {
    throw toStorageError(err);
  }
});
