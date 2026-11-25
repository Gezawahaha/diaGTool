import type { DeviceRecord, EventRecord, SessionRecord } from '../storage/repositories';

export const EXPORT_FORMAT = 'axs-diagnostic-lab/session';
export const EXPORT_FORMAT_VERSION = 1;

export interface SessionExport {
  session: SessionRecord;
  device: DeviceRecord;
  events: EventRecord[];
  exportedAt: string;
  appVersion: string;
}

function parseMetadata(json: string | null): unknown {
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/** JSON export with snake_case keys matching the D1 schema. */
export function sessionToJson(data: SessionExport): string {
  const { session: s, device: d } = data;
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      format_version: EXPORT_FORMAT_VERSION,
      exported_at: data.exportedAt,
      app_version: data.appVersion,
      device: {
        id: d.id,
        ble_identifier: d.bleIdentifier,
        display_name: d.displayName,
        advertised_name: d.advertisedName,
        device_role: d.deviceRole,
        identification_confidence: d.identificationConfidence,
        identification_notes: d.identificationNotes,
      },
      session: {
        id: s.id,
        session_type: s.sessionType,
        status: s.status,
        started_at: s.startedAt,
        ended_at: s.endedAt,
        app_version: s.appVersion,
        notes: s.notes,
      },
      events: data.events.map((e) => ({
        id: e.id,
        event_type: e.eventType,
        source: e.source,
        observed_at: e.observedAt,
        recorded_at: e.recordedAt,
        description: e.description,
        rssi: e.rssi,
        connection_state: e.connectionState,
        service_uuid: e.serviceUuid,
        characteristic_uuid: e.characteristicUuid,
        raw_payload_hex: e.rawPayloadHex,
        metadata: parseMetadata(e.metadataJson),
      })),
    },
    null,
    2,
  );
}

const CSV_COLUMNS = [
  'id',
  'session_id',
  'device_id',
  'event_type',
  'source',
  'observed_at',
  'recorded_at',
  'description',
  'rssi',
  'connection_state',
  'service_uuid',
  'characteristic_uuid',
  'raw_payload_hex',
  'metadata_json',
] as const;

/**
 * Quote a text cell. Cells starting with = + - @ (or tab/CR) are prefixed
 * with ' so spreadsheets don't evaluate them: advertised device names and
 * notes are untrusted input.
 */
export function csvText(value: string | null): string {
  if (value === null) {
    return '';
  }
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV export of a session's events, one row per event. */
export function sessionToCsv(data: SessionExport): string {
  const rows = data.events.map((e) =>
    [
      csvText(e.id),
      csvText(e.sessionId),
      csvText(e.deviceId),
      csvText(e.eventType),
      csvText(e.source),
      csvText(e.observedAt),
      csvText(e.recordedAt),
      csvText(e.description),
      e.rssi === null ? '' : String(e.rssi),
      csvText(e.connectionState),
      csvText(e.serviceUuid),
      csvText(e.characteristicUuid),
      csvText(e.rawPayloadHex),
      csvText(e.metadataJson),
    ].join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

/**
 * Android's share sheet passes text through a Binder transaction, which
 * fails above roughly 1 MB. Stay well under it.
 */
export const MAX_SHARE_BYTES = 400 * 1024;

export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
