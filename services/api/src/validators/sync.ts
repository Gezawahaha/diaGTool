import {
  DEVICE_ROLES,
  EVENT_SOURCES,
  EVENT_TYPES,
  IDENTIFICATION_CONFIDENCE,
  SESSION_STATUSES,
  SESSION_TYPES,
} from '@axs/shared';
import { z } from 'zod';

/** Per-batch caps keep each request well inside Workers Free CPU limits. */
export const MAX_DEVICES_PER_BATCH = 50;
export const MAX_SESSIONS_PER_BATCH = 50;
export const MAX_EVENTS_PER_BATCH = 200;

const id = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const text = (max: number) => z.string().max(max).nullable();

export const deviceSchema = z.object({
  id,
  ble_identifier: text(64),
  display_name: text(100),
  advertised_name: text(100),
  device_role: z.enum(DEVICE_ROLES),
  identification_confidence: z.enum(IDENTIFICATION_CONFIDENCE),
  identification_notes: text(2000),
  created_at: iso,
  updated_at: iso,
});

export const sessionSchema = z.object({
  id,
  device_id: id,
  session_type: z.enum(SESSION_TYPES),
  started_at: iso,
  ended_at: iso.nullable(),
  status: z.enum(SESSION_STATUSES),
  app_version: text(32),
  notes: text(2000),
});

export const eventSchema = z.object({
  id,
  session_id: id,
  device_id: id,
  event_type: z.enum(EVENT_TYPES),
  observed_at: iso,
  recorded_at: iso,
  source: z.enum(EVENT_SOURCES),
  description: text(1000),
  rssi: z.number().int().min(-127).max(20).nullable(),
  connection_state: z.enum(['disconnected', 'connecting', 'connected', 'disconnecting']).nullable(),
  service_uuid: text(64),
  characteristic_uuid: text(64),
  raw_payload_hex: z
    .string()
    .max(1024)
    .regex(/^(?:[0-9a-f]{2})*$/, 'must be lowercase hex bytes')
    .nullable(),
  metadata_json: z
    .string()
    .max(16 * 1024)
    .refine((s) => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    }, 'must be valid JSON')
    .nullable(),
});

/**
 * The envelope is validated strictly; records are validated one by one so
 * a single malformed record is rejected without failing the batch.
 */
export const batchEnvelopeSchema = z.object({
  batch_id: id,
  devices: z.array(z.unknown()).max(MAX_DEVICES_PER_BATCH).default([]),
  sessions: z.array(z.unknown()).max(MAX_SESSIONS_PER_BATCH).default([]),
  events: z.array(z.unknown()).max(MAX_EVENTS_PER_BATCH).default([]),
});

export type SyncDevice = z.output<typeof deviceSchema>;
export type SyncSession = z.output<typeof sessionSchema>;
export type SyncEvent = z.output<typeof eventSchema>;
