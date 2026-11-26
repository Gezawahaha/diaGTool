import type { EventSubscription } from 'react-native';
import type { ScanOptions } from 'react-native-ble-manager';
import type { BLEConnection } from './BLEConnection';
import type { BLELogger } from './BLELogger';
import type { BLEScanner } from './BLEScanner';
import type { BleTransport } from './types';

/** One presence check per period: a short scan, or an RSSI read if connected. */
export const MONITOR_PERIOD_MS = 15_000;
export const MONITOR_SCAN_SECONDS = 5;
/** A single missed scan is common radio noise; report absence after this many. */
export const MISSES_BEFORE_NOT_OBSERVED = 2;
/** Extra wait after a timed scan so late results still count. */
const SCAN_GRACE_MS = 500;
/**
 * A check that took this much longer than planned was paused (JS timers stop
 * while the app is in the background, where unfiltered scans also return
 * nothing). Its result is discarded rather than counted as absence.
 */
const OVERRUN_TOLERANCE_MS = 5_000;
// BleScanMode.LowLatency. A literal keeps the native module out of this file;
// the default low-power mode listens too rarely to rely on a 5 s window.
const LOW_LATENCY_SCAN_MODE = 2 as ScanOptions['scanMode'];

export interface IdleMonitorStatus {
  deviceId: string | null;
  running: boolean;
  /** null until the first check completes. */
  observed: boolean | null;
  lastObservedAt: string | null;
  lastRssi: number | null;
  /** Set while advertising is not being observed (last time it was). */
  notObservedSince: string | null;
  checks: number;
  /** A check that failed (e.g. Bluetooth off). Failed checks never count as absence. */
  lastError: string | null;
}

type Listener = (status: IdleMonitorStatus) => void;

interface Sighting {
  packets: number;
  rssi: number;
  at: string;
}

const IDLE: IdleMonitorStatus = {
  deviceId: null,
  running: false,
  observed: null,
  lastObservedAt: null,
  lastRssi: null,
  notObservedSince: null,
  checks: 0,
  lastError: null,
};

/**
 * Periodically checks whether one device is still observable (PROJECT.md §8
 * Module 6, Scenario B) and logs what was seen: an RSSI sample per check,
 * plus an event when advertising stops or starts being observed.
 *
 * Read-only: it only scans and reads RSSI. It never decides that a device is
 * asleep; it records when advertising was and was not observed.
 */
export class IdleMonitor {
  private status: IdleMonitorStatus = IDLE;
  private readonly listeners = new Set<Listener>();
  private discoverSub: EventSubscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on start/stop so an in-flight check from an old run is ignored. */
  private generation = 0;
  private sighting: Sighting | null = null;
  private misses = 0;
  private monitorStartedAt = '';

  constructor(
    private readonly transport: BleTransport,
    private readonly scanner: BLEScanner,
    private readonly connection: BLEConnection,
    private readonly logger: BLELogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getStatus(): IdleMonitorStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(deviceId: string): void {
    if (this.status.running && this.status.deviceId === deviceId) {
      return;
    }
    this.stop();
    const generation = ++this.generation;
    this.misses = 0;
    this.sighting = null;
    this.monitorStartedAt = this.now().toISOString();
    // Listen for the whole run, so advertisements seen by a user-started
    // scan count too.
    this.discoverSub = this.transport.onDiscoverPeripheral((p) => {
      if (p.id === deviceId) {
        this.sighting = {
          packets: (this.sighting?.packets ?? 0) + 1,
          rssi: p.rssi,
          at: this.now().toISOString(),
        };
      }
    });
    this.update({ ...IDLE, deviceId, running: true });
    this.check(generation).catch(() => undefined);
  }

  /**
   * Stop checking. A monitor scan already running ends on its own timer
   * rather than via stopScan, which would also cancel a user's scan.
   */
  stop(): void {
    this.generation += 1;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.discoverSub?.remove();
    this.discoverSub = null;
    if (this.status.running) {
      this.update({ running: false });
    }
  }

  private async check(generation: number): Promise<void> {
    const deviceId = this.status.deviceId;
    if (generation !== this.generation || !deviceId) {
      return;
    }
    const started = this.now().getTime();
    this.sighting = null;
    let connectedRssi: number | null = null;
    let failed = false;
    try {
      if (this.connection.getState(deviceId) === 'connected') {
        // Connected devices often stop advertising; the link itself is the
        // observation. readRssi logs its own RSSI_SAMPLE.
        connectedRssi = await this.connection.readRssi(deviceId);
      } else {
        // Another scan is running (the user's): its results reach our
        // listener, so just wait out the window instead of restarting it.
        if (!this.scanner.isScanning()) {
          await this.transport.scan({
            seconds: MONITOR_SCAN_SECONDS,
            allowDuplicates: true,
            scanMode: LOW_LATENCY_SCAN_MODE,
          });
        }
        await this.wait(MONITOR_SCAN_SECONDS * 1000 + SCAN_GRACE_MS);
      }
    } catch (err) {
      failed = true;
      if (generation === this.generation) {
        this.update({ lastError: err instanceof Error ? err.message : String(err) });
      }
    }
    if (generation !== this.generation) {
      return;
    }
    const elapsed = this.now().getTime() - started;
    const planned = connectedRssi !== null ? 0 : MONITOR_SCAN_SECONDS * 1000 + SCAN_GRACE_MS;
    if (!failed && elapsed > planned + OVERRUN_TOLERANCE_MS) {
      this.update({ lastError: 'A check was interrupted (app in the background) and not counted.' });
    } else if (!failed) {
      this.evaluate(deviceId, connectedRssi);
    }
    this.timer = setTimeout(() => this.check(generation).catch(() => undefined), Math.max(0, MONITOR_PERIOD_MS - elapsed));
  }

  private evaluate(deviceId: string, connectedRssi: number | null): void {
    const at = this.now().toISOString();
    const seen: Sighting | null =
      connectedRssi !== null ? { packets: 0, rssi: connectedRssi, at } : this.sighting;
    const checks = this.status.checks + 1;

    if (seen) {
      if (connectedRssi === null) {
        this.logger.log({
          bleDeviceId: deviceId,
          eventType: 'RSSI_SAMPLE',
          observedAt: seen.at,
          rssi: seen.rssi,
          connectionState: this.connection.getState(deviceId),
          description: `Advertising observed: ${seen.packets} packet(s) in a ${MONITOR_SCAN_SECONDS} s idle-monitor scan; last RSSI ${seen.rssi} dBm.`,
          metadata: { monitor: 'idle', packets: seen.packets, scanSeconds: MONITOR_SCAN_SECONDS },
        });
      }
      if (this.status.notObservedSince !== null) {
        const since = this.status.lastObservedAt ?? this.monitorStartedAt;
        const gapSeconds = Math.round((Date.parse(seen.at) - Date.parse(since)) / 1000);
        this.logger.log({
          bleDeviceId: deviceId,
          eventType: 'ADVERTISING_RESUMED',
          observedAt: seen.at,
          rssi: seen.rssi,
          connectionState: this.connection.getState(deviceId),
          description: `Device observed again after ${gapSeconds} s without observed advertising (last observed ${this.status.lastObservedAt ?? 'never in this monitor run'}).`,
          metadata: { monitor: 'idle', gapSeconds, previousObservedAt: this.status.lastObservedAt },
        });
      }
      this.misses = 0;
      this.update({
        observed: true,
        lastObservedAt: seen.at,
        lastRssi: seen.rssi,
        notObservedSince: null,
        checks,
        lastError: null,
      });
      return;
    }

    this.misses += 1;
    const patch: Partial<IdleMonitorStatus> = { observed: false, checks, lastError: null };
    if (this.misses === MISSES_BEFORE_NOT_OBSERVED) {
      const since = this.status.lastObservedAt ?? this.monitorStartedAt;
      this.logger.log({
        bleDeviceId: deviceId,
        eventType: 'ADVERTISING_NOT_OBSERVED',
        observedAt: at,
        connectionState: this.connection.getState(deviceId),
        description: `Advertising not observed in ${this.misses} consecutive ${MONITOR_SCAN_SECONDS} s idle-monitor scans (last observed ${this.status.lastObservedAt ?? 'never in this monitor run'}). Absence of advertising does not by itself confirm sleep.`,
        metadata: {
          monitor: 'idle',
          missedScans: this.misses,
          scanSeconds: MONITOR_SCAN_SECONDS,
          lastObservedAt: this.status.lastObservedAt,
        },
      });
      patch.notObservedSince = since;
    }
    this.update(patch);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = setTimeout(resolve, ms);
    });
  }

  private update(patch: Partial<IdleMonitorStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }
}
