import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateStateEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleStopScanEvent,
  Peripheral,
  PeripheralInfo,
} from 'react-native-ble-manager';
import { BleState } from 'react-native-ble-manager';
import type { BleTransport } from '../bluetooth/types';

type Handler<T> = (e: T) => void;

class Emitter<T> {
  private handlers = new Set<Handler<T>>();
  on = (h: Handler<T>) => {
    this.handlers.add(h);
    return { remove: () => this.handlers.delete(h) };
  };
  emit(e: T) {
    for (const h of [...this.handlers]) {
      h(e);
    }
  }
  get count() {
    return this.handlers.size;
  }
}

/**
 * In-memory BleTransport for unit tests. Also carries the native module's
 * write methods as spies so tests can prove they are never called.
 */
export class FakeBleTransport implements BleTransport {
  readonly discover = new Emitter<Peripheral>();
  readonly stopped = new Emitter<BleStopScanEvent>();
  readonly stateChanged = new Emitter<BleManagerDidUpdateStateEvent>();
  readonly disconnected = new Emitter<BleDisconnectPeripheralEvent>();
  readonly valueUpdated = new Emitter<BleManagerDidUpdateValueForCharacteristicEvent>();

  services: PeripheralInfo | null = null;
  readValue: number[] = [];

  start = jest.fn(async () => undefined);
  checkState = jest.fn(async () => BleState.On);
  enableBluetooth = jest.fn(async () => undefined);
  scan = jest.fn(async () => undefined);
  stopScan = jest.fn(async () => {
    this.stopped.emit({});
  });
  connect = jest.fn(async (_id: string) => undefined);
  disconnect = jest.fn(async (_id: string, _force?: boolean) => undefined);
  retrieveServices = jest.fn(async (id: string) => {
    if (!this.services) {
      throw new Error('no services configured');
    }
    return { ...this.services, id };
  });
  read = jest.fn(async (_id: string, _s: string, _c: string) => this.readValue);
  readRSSI = jest.fn(async () => -61);
  startNotification = jest.fn(async (_id: string, _s: string, _c: string) => undefined);
  stopNotification = jest.fn(async (_id: string, _s: string, _c: string) => undefined);

  // Not part of BleTransport — present only to detect misuse.
  write = jest.fn();
  writeWithoutResponse = jest.fn();
  writeDescriptor = jest.fn();
  createBond = jest.fn();
  removeBond = jest.fn();

  onDiscoverPeripheral = this.discover.on;
  onStopScan = this.stopped.on;
  onDidUpdateState = this.stateChanged.on;
  onDisconnectPeripheral = this.disconnected.on;
  onDidUpdateValueForCharacteristic = this.valueUpdated.on;
}

export function peripheral(overrides: Partial<Peripheral> = {}): Peripheral {
  return {
    id: 'AA:BB:CC:DD:EE:01',
    rssi: -70,
    name: 'Test device',
    advertising: {},
    ...overrides,
  };
}
