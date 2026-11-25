import { BLELogger } from '../../src/bluetooth/BLELogger';
import { BLEScanner, DEFAULT_SCAN_SECONDS } from '../../src/bluetooth/BLEScanner';
import { FakeBleTransport, peripheral } from '../../src/test-utils/FakeBleTransport';

function setup() {
  const transport = new FakeBleTransport();
  const logger = new BLELogger();
  const scanner = new BLEScanner(transport, logger);
  return { transport, logger, scanner };
}

afterEach(() => jest.useRealTimers());

test('scans are time-boxed', async () => {
  const { transport, scanner } = setup();
  await scanner.start();
  expect(transport.scan).toHaveBeenCalledWith(
    expect.objectContaining({ seconds: DEFAULT_SCAN_SECONDS }),
  );
  expect(scanner.isScanning()).toBe(true);
});

test('deduplicates devices and logs only the first sighting', async () => {
  const { transport, logger, scanner } = setup();
  await scanner.start();

  transport.discover.emit(peripheral({ rssi: -80 }));
  transport.discover.emit(peripheral({ rssi: -60 }));
  transport.discover.emit(peripheral({ id: 'other', name: undefined }));

  const devices = scanner.getDevices();
  expect(devices).toHaveLength(2);
  const first = scanner.getDevice('AA:BB:CC:DD:EE:01');
  expect(first?.rssi).toBe(-60);
  expect(first?.advertisementCount).toBe(2);
  expect(scanner.getDevice('other')?.name).toBeNull();

  const discovered = logger.all().filter((e) => e.eventType === 'DEVICE_DISCOVERED');
  expect(discovered.map((e) => e.bleDeviceId)).toEqual(['AA:BB:CC:DD:EE:01', 'other']);
});

test('records advertising payloads as hex', async () => {
  const { transport, scanner } = setup();
  await scanner.start();
  transport.discover.emit(
    peripheral({
      advertising: {
        isConnectable: true,
        serviceUUIDs: ['fe00'],
        manufacturerData: {
          '0x1234': { CDVType: 'ArrayBuffer', bytes: [0x01, 0xab], data: '' },
        },
      },
    }),
  );
  const d = scanner.getDevice('AA:BB:CC:DD:EE:01');
  expect(d?.manufacturerData).toEqual({ '0x1234': '01ab' });
  expect(d?.serviceUUIDs).toEqual(['fe00']);
  expect(d?.isConnectable).toBe(true);
});

test('stop releases listeners and ignores late advertisements', async () => {
  const { transport, scanner } = setup();
  await scanner.start();
  await scanner.stop();

  expect(scanner.isScanning()).toBe(false);
  expect(transport.discover.count).toBe(0);
  transport.discover.emit(peripheral());
  expect(scanner.getDevices()).toHaveLength(0);
});

test('native scan timeout ends the scan', async () => {
  const { transport, scanner } = setup();
  const states: boolean[] = [];
  scanner.subscribe((_, scanning) => states.push(scanning));
  await scanner.start();
  transport.stopped.emit({});
  expect(scanner.isScanning()).toBe(false);
  expect(states).toEqual([true, false]);
});

test('a new scan starts with an empty device list', async () => {
  const { transport, scanner } = setup();
  await scanner.start();
  transport.discover.emit(peripheral());
  await scanner.stop();
  await scanner.start();
  expect(scanner.getDevices()).toHaveLength(0);
});

test('throttles RSSI-only updates', async () => {
  jest.useFakeTimers();
  const { transport, scanner } = setup();
  const listener = jest.fn();
  await scanner.start();
  scanner.subscribe(listener);

  transport.discover.emit(peripheral()); // new device → immediate
  transport.discover.emit(peripheral({ rssi: -50 }));
  transport.discover.emit(peripheral({ rssi: -40 }));
  expect(listener).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(1000);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener.mock.lastCall?.[0][0].rssi).toBe(-40);
  await scanner.stop();
});
