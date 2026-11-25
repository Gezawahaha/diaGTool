import type { EventSubscription } from 'react-native';
import type {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateStateEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleState,
  BleStopScanEvent,
  Peripheral,
  PeripheralInfo,
  ScanOptions,
} from 'react-native-ble-manager';

/**
 * The subset of react-native-ble-manager this app is allowed to use.
 *
 * Deliberately read-only: no write, writeWithoutResponse, writeDescriptor,
 * createBond or removeBond. PROJECT.md forbids writes to unknown
 * characteristics, so code built on this interface cannot send them.
 * (startNotification enables the standard CCCD descriptor — the documented
 * BLE mechanism for subscribing — and is only called for characteristics
 * that advertise Notify/Indicate.)
 */
export interface BleTransport {
  start(): Promise<void>;
  checkState(): Promise<BleState>;
  enableBluetooth(): Promise<void>;
  scan(options?: ScanOptions): Promise<void>;
  stopScan(): Promise<void>;
  connect(peripheralId: string): Promise<void>;
  disconnect(peripheralId: string, force?: boolean): Promise<void>;
  retrieveServices(peripheralId: string): Promise<PeripheralInfo>;
  read(peripheralId: string, serviceUUID: string, characteristicUUID: string): Promise<number[]>;
  readRSSI(peripheralId: string): Promise<number>;
  startNotification(peripheralId: string, serviceUUID: string, characteristicUUID: string): Promise<void>;
  stopNotification(peripheralId: string, serviceUUID: string, characteristicUUID: string): Promise<void>;
  onDiscoverPeripheral(cb: (p: Peripheral) => void): EventSubscription;
  onStopScan(cb: (e: BleStopScanEvent) => void): EventSubscription;
  onDidUpdateState(cb: (e: BleManagerDidUpdateStateEvent) => void): EventSubscription;
  onDisconnectPeripheral(cb: (e: BleDisconnectPeripheralEvent) => void): EventSubscription;
  onDidUpdateValueForCharacteristic(
    cb: (e: BleManagerDidUpdateValueForCharacteristicEvent) => void,
  ): EventSubscription;
}

/** A device as observed in advertising. Nothing here is inferred. */
export interface DiscoveredDevice {
  id: string;
  /** Name reported by the OS/advertising; never used to infer a model. */
  name: string | null;
  rssi: number;
  isConnectable: boolean | null;
  txPowerLevel: number | null;
  serviceUUIDs: string[];
  /** Company ID (as reported) → payload hex. */
  manufacturerData: Record<string, string>;
  /** Service UUID → payload hex. */
  serviceData: Record<string, string>;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Advertisements received during the current scan. */
  advertisementCount: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export interface GattCharacteristicProperties {
  broadcast: boolean;
  read: boolean;
  write: boolean;
  writeWithoutResponse: boolean;
  notify: boolean;
  indicate: boolean;
  authenticatedSignedWrites: boolean;
  extendedProperties: boolean;
}

export interface GattCharacteristic {
  uuid: string;
  properties: GattCharacteristicProperties;
  descriptorUUIDs: string[];
}

export interface GattService {
  uuid: string;
  characteristics: GattCharacteristic[];
}

/** GATT layout exactly as reported by the device; exportable as JSON. */
export interface GattProfile {
  deviceId: string;
  discoveredAt: string;
  services: GattService[];
}
