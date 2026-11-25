import { BLEConnection } from '../../src/bluetooth/BLEConnection';
import { BLELogger } from '../../src/bluetooth/BLELogger';
import { FakeBleTransport } from '../../src/test-utils/FakeBleTransport';

const ID = 'AA:BB:CC:DD:EE:01';

function setup(timeoutMs = 10_000) {
  const transport = new FakeBleTransport();
  const logger = new BLELogger();
  const connection = new BLEConnection(transport, logger, timeoutMs);
  const types = () => logger.all().map((e) => e.eventType);
  return { transport, logger, connection, types };
}

afterEach(() => jest.useRealTimers());

test('logs an attempt and its successful outcome', async () => {
  const { connection, types } = setup();
  await connection.connect(ID);
  expect(connection.getState(ID)).toBe('connected');
  expect(types()).toEqual(['CONNECTION_ATTEMPTED', 'CONNECTION_ESTABLISHED']);
});

test('a timed-out attempt is logged as failed and cancelled', async () => {
  jest.useFakeTimers();
  const { transport, logger, connection, types } = setup(5000);
  transport.connect.mockImplementation(() => new Promise(() => undefined));

  const outcome = connection.connect(ID).catch((err: unknown) => err);
  await jest.advanceTimersByTimeAsync(5000);
  expect(String(await outcome)).toMatch(/timed out/);

  expect(transport.disconnect).toHaveBeenCalledWith(ID);
  expect(connection.getState(ID)).toBe('disconnected');
  expect(types()).toEqual(['CONNECTION_ATTEMPTED', 'CONNECTION_FAILED']);
  expect(logger.all()[1]?.metadata).toMatchObject({ reason: 'TIMEOUT' });
});

test('a rejected attempt is logged as failed', async () => {
  const { transport, logger, connection, types } = setup();
  transport.connect.mockRejectedValueOnce(new Error('GATT 133'));
  await expect(connection.connect(ID)).rejects.toThrow('GATT 133');
  expect(types()).toEqual(['CONNECTION_ATTEMPTED', 'CONNECTION_FAILED']);
  expect(logger.all()[1]?.metadata).toMatchObject({ reason: 'ERROR' });
});

test('a disconnect event during failure cleanup is not a lost connection', async () => {
  const { transport, connection, types } = setup();
  transport.connect.mockRejectedValueOnce(new Error('boom'));
  transport.disconnect.mockImplementationOnce(async (id: string) => {
    transport.disconnected.emit({ peripheral: id });
  });
  await expect(connection.connect(ID)).rejects.toThrow();
  expect(types()).not.toContain('CONNECTION_LOST');
});

test('a user disconnect is not logged as a lost connection', async () => {
  const { transport, connection, types } = setup();
  await connection.connect(ID);
  transport.disconnect.mockImplementationOnce(async (id: string) => {
    transport.disconnected.emit({ peripheral: id });
  });
  await connection.disconnect(ID);

  expect(connection.getState(ID)).toBe('disconnected');
  expect(types()).toEqual([
    'CONNECTION_ATTEMPTED',
    'CONNECTION_ESTABLISHED',
    'DISCONNECT_REQUESTED',
  ]);
});

test('an unrequested disconnect is logged as CONNECTION_LOST and not retried', async () => {
  const { transport, connection, types } = setup();
  await connection.connect(ID);
  transport.disconnected.emit({ peripheral: ID, status: 8 });

  expect(connection.getState(ID)).toBe('disconnected');
  expect(types()).toContain('CONNECTION_LOST');
  expect(transport.connect).toHaveBeenCalledTimes(1);
});

test('a stale expected-disconnect flag does not hide a later real loss', async () => {
  const { transport, connection, types } = setup();
  await connection.connect(ID);
  await connection.disconnect(ID); // fake emits no disconnect event
  await connection.connect(ID);
  transport.disconnected.emit({ peripheral: ID });
  expect(types()).toContain('CONNECTION_LOST');
});

test('RSSI reads are logged as samples', async () => {
  const { logger, connection } = setup();
  await connection.connect(ID);
  await expect(connection.readRssi(ID)).resolves.toBe(-61);
  expect(logger.all().at(-1)).toMatchObject({ eventType: 'RSSI_SAMPLE', rssi: -61 });
});
