import type { BleState } from 'react-native-ble-manager';
import { BLEConnection } from './BLEConnection';
import { BLELogger } from './BLELogger';
import { BLEScanner } from './BLEScanner';
import { GATTExplorer } from './GATTExplorer';
import type { BleTransport } from './types';

/**
 * Composes the BLE subsystems around one transport and owns their lifecycle.
 * Everything here runs locally; nothing depends on network connectivity.
 */
export class BLEManager {
  readonly logger: BLELogger;
  readonly scanner: BLEScanner;
  readonly connection: BLEConnection;
  readonly gatt: GATTExplorer;
  private started: Promise<void> | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly transport: BleTransport, logger = new BLELogger()) {
    this.logger = logger;
    this.scanner = new BLEScanner(transport, logger);
    this.connection = new BLEConnection(transport, logger);
    this.gatt = new GATTExplorer(transport, logger);
    this.unsubscribe = this.connection.subscribe((deviceId, state) => {
      if (state === 'disconnected') {
        this.gatt.handleDisconnected(deviceId);
      }
    });
  }

  /** Initialise the native module once; safe to call repeatedly. */
  start(): Promise<void> {
    this.started ??= this.transport.start().catch((err) => {
      this.started = null;
      throw err;
    });
    return this.started;
  }

  checkState(): Promise<BleState> {
    return this.transport.checkState();
  }

  /** Android shows the system "turn on Bluetooth?" dialog. */
  requestEnable(): Promise<void> {
    return this.transport.enableBluetooth();
  }

  onStateChange(cb: (state: BleState) => void): () => void {
    const sub = this.transport.onDidUpdateState((e) => cb(e.state));
    return () => sub.remove();
  }

  /** Stop notifications, then disconnect, so the peripheral sees a clean teardown. */
  async disconnect(deviceId: string): Promise<void> {
    await this.gatt.stopAll(deviceId);
    await this.connection.disconnect(deviceId);
  }

  async dispose(): Promise<void> {
    await this.scanner.stop().catch(() => undefined);
    await this.connection.dispose();
    this.gatt.dispose();
    this.unsubscribe();
  }
}

let instance: BLEManager | null = null;

/** App-wide manager backed by react-native-ble-manager. */
export function getBLEManager(): BLEManager {
  if (!instance) {
    // Required lazily so unit tests can construct BLEManager with a fake
    // transport without loading the native module.
    const native = require('react-native-ble-manager').default as BleTransport;
    instance = new BLEManager(native);
  }
  return instance;
}

/** Tear down the app-wide manager; the next getBLEManager() builds a fresh one. */
export async function disposeBLEManager(): Promise<void> {
  const current = instance;
  instance = null;
  await current?.dispose();
}
