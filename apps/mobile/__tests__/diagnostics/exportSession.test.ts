import { gattProfileHash } from '../../src/bluetooth/profileHash';
import type { GattProfile } from '../../src/bluetooth/types';
import {
  csvText,
  sessionToCsv,
  sessionToJson,
  utf8Length,
  type SessionExport,
} from '../../src/diagnostics/exportSession';
import type { EventRecord } from '../../src/storage/repositories';

const event: EventRecord = {
  id: 'e1',
  seq: 1,
  sessionId: 's1',
  deviceId: 'd1',
  eventType: 'NOTIFICATION_RECEIVED',
  observedAt: '2026-11-25T12:00:00.000Z',
  recordedAt: '2026-11-25T12:00:00.010Z',
  source: 'AUTOMATIC_OBSERVATION',
  description: 'Notification, "quoted", with comma',
  rssi: -64,
  connectionState: 'connected',
  serviceUuid: '180f',
  characteristicUuid: '2a19',
  rawPayloadHex: '64',
  metadataJson: '{"ok":true}',
  syncStatus: 'PENDING',
};

const data: SessionExport = {
  session: {
    id: 's1',
    deviceId: 'd1',
    sessionType: 'IDLE_MONITOR',
    startedAt: '2026-11-25T11:59:00.000Z',
    endedAt: null,
    status: 'INTERRUPTED',
    appVersion: '0.1.0',
    notes: null,
    createdAt: '2026-11-25T11:59:00.000Z',
  },
  device: {
    id: 'd1',
    bleIdentifier: 'AA:01',
    displayName: '=HYPERLINK("x")',
    advertisedName: '=HYPERLINK("x")',
    deviceRole: 'FAULTY',
    identificationConfidence: 'UNKNOWN',
    identificationNotes: null,
    createdAt: '2026-11-25T11:00:00.000Z',
    updatedAt: '2026-11-25T11:00:00.000Z',
  },
  events: [event],
  exportedAt: '2026-11-25T13:00:00.000Z',
  appVersion: '0.1.0',
};

test('JSON export uses D1 field names and parsed metadata', () => {
  const parsed = JSON.parse(sessionToJson(data));
  expect(parsed).toMatchObject({
    format: 'axs-diagnostic-lab/session',
    format_version: 1,
    device: { ble_identifier: 'AA:01', device_role: 'FAULTY', identification_confidence: 'UNKNOWN' },
    session: { session_type: 'IDLE_MONITOR', status: 'INTERRUPTED', ended_at: null },
  });
  expect(parsed.events[0]).toMatchObject({ event_type: 'NOTIFICATION_RECEIVED', rssi: -64, metadata: { ok: true } });
});

test('CSV export quotes text and keeps numbers raw', () => {
  const lines = sessionToCsv(data).trimEnd().split('\r\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^id,session_id,device_id,event_type/);
  expect(lines[1]).toContain('"Notification, ""quoted"", with comma"');
  expect(lines[1]).toContain(',-64,');
  expect(lines[1]).toContain('"{""ok"":true}"');
});

test('CSV cells cannot start a spreadsheet formula', () => {
  expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  expect(csvText('+1')).toBe(`"'+1"`);
  expect(csvText('-cmd')).toBe(`"'-cmd"`);
  expect(csvText('@sum')).toBe(`"'@sum"`);
  expect(csvText('normal')).toBe('"normal"');
  expect(csvText(null)).toBe('');
});

test('utf8Length counts encoded bytes', () => {
  expect(utf8Length('abc')).toBe(3);
  expect(utf8Length('é')).toBe(2);
  expect(utf8Length('—')).toBe(3);
  expect(utf8Length('🚲')).toBe(4);
});

test('GATT profile hash ignores ordering, case and discovery time', () => {
  const a: GattProfile = {
    deviceId: 'A',
    discoveredAt: '2026-01-01T00:00:00Z',
    services: [
      {
        uuid: '180F',
        characteristics: [
          {
            uuid: '2A19',
            descriptorUUIDs: ['2902'],
            properties: {
              read: true,
              notify: true,
              write: false,
              writeWithoutResponse: false,
              indicate: false,
              broadcast: false,
              authenticatedSignedWrites: false,
              extendedProperties: false,
            },
          },
        ],
      },
      { uuid: '1800', characteristics: [] },
    ],
  };
  const b: GattProfile = {
    ...a,
    deviceId: 'B',
    discoveredAt: '2026-06-01T00:00:00Z',
    services: [...a.services].reverse().map((s) => ({ ...s, uuid: s.uuid.toLowerCase() })),
  };
  expect(gattProfileHash(a)).toBe(gattProfileHash(b));
  expect(gattProfileHash(a)).toMatch(/^[0-9a-f]{14}$/);

  const c: GattProfile = { ...a, services: [a.services[1]!] };
  expect(gattProfileHash(c)).not.toBe(gattProfileHash(a));
});
