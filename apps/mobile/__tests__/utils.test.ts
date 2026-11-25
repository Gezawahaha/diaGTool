import { bytesToHex, formatHex } from '../src/utils/bytes';
import { uuidv4 } from '../src/utils/id';
import { filterDevices } from '../src/screens/ScannerScreen';
import type { DiscoveredDevice } from '../src/bluetooth/types';

test('bytesToHex pads and masks bytes', () => {
  expect(bytesToHex([0, 1, 0xab, 0xff, 256])).toBe('0001abff00');
  expect(bytesToHex([])).toBe('');
  expect(formatHex('0001abff')).toBe('00 01 ab ff');
});

test('uuidv4 produces distinct RFC 4122 v4 ids', () => {
  const ids = new Set(Array.from({ length: 1000 }, uuidv4));
  expect(ids.size).toBe(1000);
  for (const id of ids) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('filterDevices matches name or id and sorts by signal strength', () => {
  const d = (id: string, name: string | null, rssi: number) =>
    ({ id, name, rssi }) as DiscoveredDevice;
  const devices = [d('aa', 'Alpha', -80), d('bb', null, -50), d('cc', 'Charlie', -60)];
  expect(filterDevices(devices, '').map((x) => x.id)).toEqual(['bb', 'cc', 'aa']);
  expect(filterDevices(devices, 'ALP').map((x) => x.id)).toEqual(['aa']);
  expect(filterDevices(devices, 'bb').map((x) => x.id)).toEqual(['bb']);
});
