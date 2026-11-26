import { BLEConnection } from '../../src/bluetooth/BLEConnection';
import { BLELogger } from '../../src/bluetooth/BLELogger';
import { BLEScanner } from '../../src/bluetooth/BLEScanner';
import {
  IdleMonitor,
  MONITOR_PERIOD_MS,
  MONITOR_SCAN_SECONDS,
} from '../../src/bluetooth/IdleMonitor';
import { FakeBleTransport, peripheral } from '../../src/test-utils/FakeBleTransport';

const ID = 'AA:BB:CC:DD:EE:01';
const WINDOW_MS = MONITOR_SCAN_SECONDS * 1000 + 500;

function setup() {
  const transport = new FakeBleTransport();
  const logger = new BLELogger();
  const scanner = new BLEScanner(transport, logger);
  const connection = new BLEConnection(transport, logger);
  const monitor = new IdleMonitor(transport, scanner, connection, logger);
  const events = (type: string) => logger.all().filter((e) => e.eventType === type);
  /** Run one check: optionally advertise during its window, then wait for the next one. */
  const check = async (advertise: boolean, rssi = -70) => {
    if (advertise) {
      transport.discover.emit(peripheral({ id: ID, rssi }));
    }
    await jest.advanceTimersByTimeAsync(MONITOR_PERIOD_MS);
  };
  return { transport, logger, scanner, connection, monitor, events, check };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('logs an RSSI sample when advertising is observed in a scan', async () => {
  const { transport, monitor, events } = setup();
  monitor.start(ID);
  await jest.advanceTimersByTimeAsync(0);
  expect(transport.scan).toHaveBeenCalledWith(
    expect.objectContaining({ seconds: MONITOR_SCAN_SECONDS }),
  );

  transport.discover.emit(peripheral({ id: ID, rssi: -80 }));
  transport.discover.emit(peripheral({ id: 'someone-else', rssi: -40 }));
  transport.discover.emit(peripheral({ id: ID, rssi: -66 }));
  await jest.advanceTimersByTimeAsync(WINDOW_MS);

  const samples = events('RSSI_SAMPLE');
  expect(samples).toHaveLength(1);
  expect(samples[0]).toMatchObject({ bleDeviceId: ID, rssi: -66, metadata: { packets: 2 } });
  expect(monitor.getStatus()).toMatchObject({ observed: true, lastRssi: -66, checks: 1 });
});

test('reports absence once after consecutive misses, then the resumption', async () => {
  const { monitor, events, check } = setup();
  monitor.start(ID);
  await check(true);
  await check(false);
  expect(events('ADVERTISING_NOT_OBSERVED')).toHaveLength(0); // one miss is noise
  await check(false);
  await check(false);
  expect(events('ADVERTISING_NOT_OBSERVED')).toHaveLength(1);
  expect(monitor.getStatus().notObservedSince).not.toBeNull();

  await check(true, -58);
  const resumed = events('ADVERTISING_RESUMED');
  expect(resumed).toHaveLength(1);
  expect(resumed[0]?.metadata?.gapSeconds).toBe((4 * MONITOR_PERIOD_MS) / 1000);
  expect(monitor.getStatus()).toMatchObject({ observed: true, notObservedSince: null });
});

test('reads RSSI over the link instead of scanning while connected', async () => {
  const { transport, connection, monitor, events } = setup();
  await connection.connect(ID);
  monitor.start(ID);
  await jest.advanceTimersByTimeAsync(0);

  expect(transport.scan).not.toHaveBeenCalled();
  expect(transport.readRSSI).toHaveBeenCalledWith(ID);
  expect(events('RSSI_SAMPLE')).toHaveLength(1);
  expect(monitor.getStatus().observed).toBe(true);
});

test("shares a user's scan instead of restarting it", async () => {
  const { transport, scanner, monitor, check } = setup();
  await scanner.start();
  monitor.start(ID);
  await check(true);
  expect(transport.scan).toHaveBeenCalledTimes(1); // the user's scan only
  expect(monitor.getStatus().observed).toBe(true);
});

test('never counts a failed scan as absence', async () => {
  const { transport, monitor, events } = setup();
  transport.scan.mockRejectedValue(new Error('Bluetooth is off'));
  monitor.start(ID);
  await jest.advanceTimersByTimeAsync(3 * MONITOR_PERIOD_MS);
  expect(monitor.getStatus()).toMatchObject({ checks: 0, lastError: 'Bluetooth is off' });
  expect(events('ADVERTISING_NOT_OBSERVED')).toHaveLength(0);
});

test('discards a check that was paused in the background', async () => {
  const { monitor } = setup();
  monitor.start(ID);
  await jest.advanceTimersByTimeAsync(0);
  // Timers stopped while backgrounded: wall time jumps past the scan window.
  jest.setSystemTime(Date.now() + 60_000);
  await jest.advanceTimersByTimeAsync(WINDOW_MS);
  expect(monitor.getStatus().checks).toBe(0);
  expect(monitor.getStatus().lastError).toMatch(/interrupted/);
});

test('stop ends the checks and the listener', async () => {
  const { transport, monitor, events, check } = setup();
  monitor.start(ID);
  await check(true);
  monitor.stop();
  const scans = transport.scan.mock.calls.length;

  await check(false);
  await check(false);
  await check(false);
  expect(transport.scan).toHaveBeenCalledTimes(scans);
  expect(transport.discover.count).toBe(0);
  expect(events('ADVERTISING_NOT_OBSERVED')).toHaveLength(0);
  expect(monitor.getStatus().running).toBe(false);
});
