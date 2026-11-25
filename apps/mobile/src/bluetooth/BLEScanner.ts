import type { EventSubscription } from 'react-native';
import type { CustomAdvertisingData, Peripheral } from 'react-native-ble-manager';
import { bytesToHex } from '../utils/bytes';
import type { BLELogger } from './BLELogger';
import type { BleTransport, DiscoveredDevice } from './types';

/**
 * Scans are always time-boxed: an open-ended scan drains the phone battery
 * and keeps the radio busy. The user can start another one.
 */
export const DEFAULT_SCAN_SECONDS = 15;
const UPDATE_THROTTLE_MS = 1000;

type Listener = (devices: DiscoveredDevice[], scanning: boolean) => void;

function hexRecord(
  data: Record<string, CustomAdvertisingData> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    out[key] = bytesToHex(value.bytes ?? []);
  }
  return out;
}

export class BLEScanner {
  private devices = new Map<string, DiscoveredDevice>();
  private scanning = false;
  private readonly listeners = new Set<Listener>();
  private subscriptions: EventSubscription[] = [];
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly transport: BleTransport,
    private readonly logger: BLELogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isScanning(): boolean {
    return this.scanning;
  }

  getDevices(): DiscoveredDevice[] {
    return [...this.devices.values()];
  }

  getDevice(id: string): DiscoveredDevice | undefined {
    return this.devices.get(id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(seconds = DEFAULT_SCAN_SECONDS): Promise<void> {
    if (this.scanning) {
      return;
    }
    // Each scan starts fresh so the list reflects what is advertising now.
    this.devices = new Map();
    this.subscriptions = [
      this.transport.onDiscoverPeripheral((p) => this.handleDiscovered(p)),
      this.transport.onStopScan(() => this.handleStopped()),
    ];
    this.scanning = true;
    this.emit();
    try {
      await this.transport.scan({ seconds, allowDuplicates: true });
    } catch (err) {
      this.handleStopped();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.scanning) {
      return;
    }
    try {
      await this.transport.stopScan();
    } finally {
      this.handleStopped();
    }
  }

  private handleDiscovered(p: Peripheral): void {
    if (!this.scanning) {
      return;
    }
    const at = this.now().toISOString();
    const existing = this.devices.get(p.id);
    const adv = p.advertising ?? {};
    const device: DiscoveredDevice = {
      id: p.id,
      name: p.name ?? adv.localName ?? existing?.name ?? null,
      rssi: p.rssi,
      isConnectable: adv.isConnectable ?? existing?.isConnectable ?? null,
      txPowerLevel: adv.txPowerLevel ?? existing?.txPowerLevel ?? null,
      serviceUUIDs: adv.serviceUUIDs ?? existing?.serviceUUIDs ?? [],
      manufacturerData: adv.manufacturerData
        ? hexRecord(adv.manufacturerData)
        : existing?.manufacturerData ?? {},
      serviceData: adv.serviceData ? hexRecord(adv.serviceData) : existing?.serviceData ?? {},
      firstSeenAt: existing?.firstSeenAt ?? at,
      lastSeenAt: at,
      advertisementCount: (existing?.advertisementCount ?? 0) + 1,
    };
    this.devices.set(p.id, device);

    // Log first sighting per scan only; every advertisement would flood
    // the log (PROJECT.md §6.3 rule 1).
    if (!existing) {
      this.logger.log({
        bleDeviceId: p.id,
        eventType: 'DEVICE_DISCOVERED',
        observedAt: at,
        description: `Advertising observed${device.name ? ` from "${device.name}"` : ''}.`,
        rssi: p.rssi,
        metadata: {
          name: device.name,
          isConnectable: device.isConnectable,
          txPowerLevel: device.txPowerLevel,
          serviceUUIDs: device.serviceUUIDs,
          manufacturerData: device.manufacturerData,
          serviceData: device.serviceData,
        },
      });
      this.emit();
    } else {
      this.emitThrottled();
    }
  }

  /** RSSI updates arrive many times a second; cap UI refreshes. */
  private emitThrottled(): void {
    if (this.throttleTimer) {
      return;
    }
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.emit();
    }, UPDATE_THROTTLE_MS);
  }

  private handleStopped(): void {
    for (const s of this.subscriptions) {
      s.remove();
    }
    this.subscriptions = [];
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.scanning) {
      this.scanning = false;
      this.emit();
    }
  }

  private emit(): void {
    const devices = this.getDevices();
    for (const listener of this.listeners) {
      listener(devices, this.scanning);
    }
  }
}
