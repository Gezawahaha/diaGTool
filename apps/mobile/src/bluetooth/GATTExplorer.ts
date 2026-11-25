import type { EventSubscription } from 'react-native';
import type { Characteristic, PeripheralInfo } from 'react-native-ble-manager';
import { bytesToHex } from '../utils/bytes';
import type { BLELogger } from './BLELogger';
import type {
  BleTransport,
  GattCharacteristic,
  GattCharacteristicProperties,
  GattProfile,
} from './types';

export interface CharacteristicValue {
  hex: string;
  observedAt: string;
  via: 'read' | 'notification';
}

type Listener = (deviceId: string) => void;

export class GattOperationNotSupportedError extends Error {
  constructor(operation: string, characteristicUuid: string) {
    super(`Characteristic ${characteristicUuid} does not support ${operation}.`);
    this.name = 'GattOperationNotSupportedError';
  }
}

function key(serviceUuid: string, characteristicUuid: string): string {
  return `${serviceUuid.toLowerCase()}/${characteristicUuid.toLowerCase()}`;
}

function toProperties(p: Characteristic['properties']): GattCharacteristicProperties {
  return {
    broadcast: Boolean(p.Broadcast),
    read: Boolean(p.Read),
    write: Boolean(p.Write),
    writeWithoutResponse: Boolean(p.WriteWithoutResponse),
    notify: Boolean(p.Notify),
    indicate: Boolean(p.Indicate),
    authenticatedSignedWrites: Boolean(p.AuthenticatedSignedWrites),
    extendedProperties: Boolean(p.ExtendedProperties),
  };
}

/** Convert the library's flat characteristic list into a service tree. */
export function toGattProfile(info: PeripheralInfo, discoveredAt: string): GattProfile {
  const services = new Map<string, GattCharacteristic[]>();
  for (const s of info.services ?? []) {
    services.set(s.uuid, []);
  }
  for (const c of info.characteristics ?? []) {
    const list = services.get(c.service) ?? [];
    list.push({
      uuid: c.characteristic,
      properties: toProperties(c.properties),
      descriptorUUIDs: (c.descriptors ?? []).map((d) => d.uuid),
    });
    services.set(c.service, list);
  }
  return {
    deviceId: info.id,
    discoveredAt,
    services: [...services.entries()].map(([uuid, characteristics]) => ({
      uuid,
      characteristics,
    })),
  };
}

/**
 * Read-only GATT inspection (PROJECT.md Module 4). Reads and subscriptions
 * are refused unless the device itself advertises the property. There is
 * no write path.
 */
export class GATTExplorer {
  private readonly profiles = new Map<string, GattProfile>();
  private readonly values = new Map<string, Map<string, CharacteristicValue>>();
  private readonly subscribed = new Map<string, Set<string>>();
  private readonly listeners = new Set<Listener>();
  private readonly subscription: EventSubscription;

  constructor(
    private readonly transport: BleTransport,
    private readonly logger: BLELogger,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.subscription = transport.onDidUpdateValueForCharacteristic((e) => {
      const k = key(e.service, e.characteristic);
      if (!this.subscribed.get(e.peripheral)?.has(k)) {
        return;
      }
      const observedAt = this.now().toISOString();
      const hex = bytesToHex(e.value);
      this.setValue(e.peripheral, k, { hex, observedAt, via: 'notification' });
      this.logger.log({
        bleDeviceId: e.peripheral,
        eventType: 'NOTIFICATION_RECEIVED',
        observedAt,
        description: `Notification (${e.value.length} bytes).`,
        serviceUuid: e.service,
        characteristicUuid: e.characteristic,
        rawPayloadHex: hex,
      });
    });
  }

  getProfile(deviceId: string): GattProfile | undefined {
    return this.profiles.get(deviceId);
  }

  getValue(deviceId: string, serviceUuid: string, characteristicUuid: string) {
    return this.values.get(deviceId)?.get(key(serviceUuid, characteristicUuid));
  }

  isSubscribed(deviceId: string, serviceUuid: string, characteristicUuid: string): boolean {
    return this.subscribed.get(deviceId)?.has(key(serviceUuid, characteristicUuid)) ?? false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async discover(deviceId: string): Promise<GattProfile> {
    const info = await this.transport.retrieveServices(deviceId);
    const profile = toGattProfile(info, this.now().toISOString());
    this.profiles.set(deviceId, profile);
    const characteristicCount = profile.services.reduce(
      (n, s) => n + s.characteristics.length,
      0,
    );
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'GATT_DISCOVERED',
      observedAt: profile.discoveredAt,
      description: `${profile.services.length} services, ${characteristicCount} characteristics.`,
      metadata: { profile },
    });
    this.emit(deviceId);
    return profile;
  }

  async read(deviceId: string, serviceUuid: string, characteristicUuid: string) {
    this.requireProperty(deviceId, serviceUuid, characteristicUuid, 'read');
    try {
      const bytes = await this.transport.read(deviceId, serviceUuid, characteristicUuid);
      const value: CharacteristicValue = {
        hex: bytesToHex(bytes),
        observedAt: this.now().toISOString(),
        via: 'read',
      };
      this.setValue(deviceId, key(serviceUuid, characteristicUuid), value);
      this.logger.log({
        bleDeviceId: deviceId,
        eventType: 'CHARACTERISTIC_READ',
        observedAt: value.observedAt,
        description: `Read ${bytes.length} bytes.`,
        serviceUuid,
        characteristicUuid,
        rawPayloadHex: value.hex,
        metadata: { ok: true },
      });
      return value;
    } catch (err) {
      this.logger.log({
        bleDeviceId: deviceId,
        eventType: 'CHARACTERISTIC_READ',
        description: `Read failed: ${err instanceof Error ? err.message : String(err)}`,
        serviceUuid,
        characteristicUuid,
        metadata: { ok: false },
      });
      throw err;
    }
  }

  async startNotifications(deviceId: string, serviceUuid: string, characteristicUuid: string) {
    this.requireProperty(deviceId, serviceUuid, characteristicUuid, 'notify');
    await this.transport.startNotification(deviceId, serviceUuid, characteristicUuid);
    let set = this.subscribed.get(deviceId);
    if (!set) {
      set = new Set();
      this.subscribed.set(deviceId, set);
    }
    set.add(key(serviceUuid, characteristicUuid));
    this.emit(deviceId);
  }

  async stopNotifications(deviceId: string, serviceUuid: string, characteristicUuid: string) {
    const set = this.subscribed.get(deviceId);
    const k = key(serviceUuid, characteristicUuid);
    if (!set?.has(k)) {
      return;
    }
    set.delete(k);
    this.emit(deviceId);
    await this.transport.stopNotification(deviceId, serviceUuid, characteristicUuid);
  }

  /** Stop all notifications for a device (before disconnecting). */
  async stopAll(deviceId: string): Promise<void> {
    const set = this.subscribed.get(deviceId);
    if (!set) {
      return;
    }
    const keys = [...set];
    this.subscribed.delete(deviceId);
    this.emit(deviceId);
    await Promise.all(
      keys.map((k) => {
        const [s, c] = k.split('/') as [string, string];
        return this.transport.stopNotification(deviceId, s, c).catch(() => undefined);
      }),
    );
  }

  /** Forget subscriptions after a disconnect; the link no longer exists. */
  handleDisconnected(deviceId: string): void {
    if (this.subscribed.delete(deviceId)) {
      this.emit(deviceId);
    }
  }

  dispose(): void {
    this.subscription.remove();
    this.listeners.clear();
  }

  private requireProperty(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    operation: 'read' | 'notify',
  ): void {
    const characteristic = this.profiles
      .get(deviceId)
      ?.services.find((s) => s.uuid.toLowerCase() === serviceUuid.toLowerCase())
      ?.characteristics.find((c) => c.uuid.toLowerCase() === characteristicUuid.toLowerCase());
    const p = characteristic?.properties;
    const supported = operation === 'read' ? p?.read : p?.notify || p?.indicate;
    if (!supported) {
      throw new GattOperationNotSupportedError(operation, characteristicUuid);
    }
  }

  private setValue(deviceId: string, k: string, value: CharacteristicValue): void {
    let map = this.values.get(deviceId);
    if (!map) {
      map = new Map();
      this.values.set(deviceId, map);
    }
    map.set(k, value);
    this.emit(deviceId);
  }

  private emit(deviceId: string): void {
    for (const listener of this.listeners) {
      listener(deviceId);
    }
  }
}
