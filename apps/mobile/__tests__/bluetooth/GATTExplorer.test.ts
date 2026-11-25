import type { PeripheralInfo } from 'react-native-ble-manager';
import { BLELogger } from '../../src/bluetooth/BLELogger';
import { BLEManager } from '../../src/bluetooth/BLEManager';
import {
  GATTExplorer,
  GattOperationNotSupportedError,
  toGattProfile,
} from '../../src/bluetooth/GATTExplorer';
import { FakeBleTransport } from '../../src/test-utils/FakeBleTransport';

const ID = 'AA:BB:CC:DD:EE:01';
const SVC = '0000180f-0000-1000-8000-00805f9b34fb';
const READABLE = '00002a19-0000-1000-8000-00805f9b34fb';
const NOTIFY_ONLY = '0000aaaa-0000-1000-8000-00805f9b34fb';
const WRITE_ONLY = '0000bbbb-0000-1000-8000-00805f9b34fb';

const INFO: PeripheralInfo = {
  id: ID,
  rssi: -60,
  advertising: {},
  services: [{ uuid: SVC }],
  characteristics: [
    { service: SVC, characteristic: READABLE, properties: { Read: 'Read' } },
    {
      service: SVC,
      characteristic: NOTIFY_ONLY,
      properties: { Notify: 'Notify' },
      descriptors: [{ uuid: '2902', value: '' }],
    },
    { service: SVC, characteristic: WRITE_ONLY, properties: { Write: 'Write' } },
  ],
};

function setup() {
  const transport = new FakeBleTransport();
  transport.services = INFO;
  const logger = new BLELogger();
  const gatt = new GATTExplorer(transport, logger);
  return { transport, logger, gatt };
}

test('builds a service tree from the flat characteristic list', () => {
  const profile = toGattProfile(INFO, '2026-11-25T00:00:00.000Z');
  expect(profile.services).toHaveLength(1);
  const chars = profile.services[0]!.characteristics;
  expect(chars.map((c) => c.uuid)).toEqual([READABLE, NOTIFY_ONLY, WRITE_ONLY]);
  expect(chars[0]!.properties.read).toBe(true);
  expect(chars[1]!.properties.notify).toBe(true);
  expect(chars[1]!.descriptorUUIDs).toEqual(['2902']);
  expect(chars[2]!.properties.write).toBe(true);
  expect(chars[2]!.properties.read).toBe(false);
});

test('discovery is logged with the observed profile', async () => {
  const { logger, gatt } = setup();
  await gatt.discover(ID);
  const event = logger.all().at(-1);
  expect(event?.eventType).toBe('GATT_DISCOVERED');
  expect(event?.description).toBe('1 services, 3 characteristics.');
});

test('reads a readable characteristic and logs the payload as hex', async () => {
  const { transport, logger, gatt } = setup();
  transport.readValue = [0x64];
  await gatt.discover(ID);
  const value = await gatt.read(ID, SVC, READABLE);
  expect(value.hex).toBe('64');
  expect(logger.all().at(-1)).toMatchObject({
    eventType: 'CHARACTERISTIC_READ',
    rawPayloadHex: '64',
    characteristicUuid: READABLE,
  });
});

test('refuses to read a characteristic without the Read property', async () => {
  const { transport, gatt } = setup();
  await gatt.discover(ID);
  await expect(gatt.read(ID, SVC, WRITE_ONLY)).rejects.toThrow(GattOperationNotSupportedError);
  await expect(gatt.read(ID, SVC, NOTIFY_ONLY)).rejects.toThrow(GattOperationNotSupportedError);
  expect(transport.read).not.toHaveBeenCalled();
});

test('refuses operations before discovery', async () => {
  const { transport, gatt } = setup();
  await expect(gatt.read(ID, SVC, READABLE)).rejects.toThrow(GattOperationNotSupportedError);
  expect(transport.read).not.toHaveBeenCalled();
});

test('refuses to subscribe without Notify/Indicate', async () => {
  const { transport, gatt } = setup();
  await gatt.discover(ID);
  await expect(gatt.startNotifications(ID, SVC, READABLE)).rejects.toThrow(
    GattOperationNotSupportedError,
  );
  expect(transport.startNotification).not.toHaveBeenCalled();
});

test('logs notifications only for subscribed characteristics', async () => {
  const { transport, logger, gatt } = setup();
  await gatt.discover(ID);

  transport.valueUpdated.emit({ peripheral: ID, service: SVC, characteristic: NOTIFY_ONLY, value: [1] });
  expect(logger.all().some((e) => e.eventType === 'NOTIFICATION_RECEIVED')).toBe(false);

  await gatt.startNotifications(ID, SVC, NOTIFY_ONLY);
  // Native layers may report UUIDs in a different case.
  transport.valueUpdated.emit({
    peripheral: ID,
    service: SVC.toUpperCase(),
    characteristic: NOTIFY_ONLY.toUpperCase(),
    value: [0xde, 0xad],
  });
  expect(logger.all().at(-1)).toMatchObject({
    eventType: 'NOTIFICATION_RECEIVED',
    rawPayloadHex: 'dead',
  });
  expect(gatt.getValue(ID, SVC, NOTIFY_ONLY)).toMatchObject({ hex: 'dead', via: 'notification' });

  await gatt.stopNotifications(ID, SVC, NOTIFY_ONLY);
  expect(transport.stopNotification).toHaveBeenCalledWith(ID, SVC, NOTIFY_ONLY);
  expect(gatt.isSubscribed(ID, SVC, NOTIFY_ONLY)).toBe(false);
});

test('a full session never calls a write method', async () => {
  const transport = new FakeBleTransport();
  transport.services = INFO;
  const manager = new BLEManager(transport, new BLELogger());

  await manager.start();
  await manager.connection.connect(ID);
  await manager.gatt.discover(ID);
  await manager.gatt.read(ID, SVC, READABLE);
  await manager.gatt.startNotifications(ID, SVC, NOTIFY_ONLY);
  await manager.disconnect(ID);
  await manager.dispose();

  expect(transport.stopNotification).toHaveBeenCalledWith(ID, SVC, NOTIFY_ONLY);
  for (const spy of [
    transport.write,
    transport.writeWithoutResponse,
    transport.writeDescriptor,
    transport.createBond,
    transport.removeBond,
  ]) {
    expect(spy).not.toHaveBeenCalled();
  }
});

test('subscriptions are forgotten when the device disconnects', async () => {
  const transport = new FakeBleTransport();
  transport.services = INFO;
  const manager = new BLEManager(transport, new BLELogger());
  await manager.connection.connect(ID);
  await manager.gatt.discover(ID);
  await manager.gatt.startNotifications(ID, SVC, NOTIFY_ONLY);

  transport.disconnected.emit({ peripheral: ID });
  expect(manager.gatt.isSubscribed(ID, SVC, NOTIFY_ONLY)).toBe(false);
});
