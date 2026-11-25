import type { SessionType } from '@axs/shared';
import type { BLELogger, DiagnosticEvent } from '../bluetooth/BLELogger';
import { gattProfileHash } from '../bluetooth/profileHash';
import type { GattProfile } from '../bluetooth/types';
import type {
  DeviceRecord,
  DeviceRepository,
  EventRepository,
  GattProfileRepository,
  NewEvent,
  SessionRecord,
  SessionRepository,
} from '../storage/repositories';

export type UserMarker = 'MANUAL_WAKE_MARKER' | 'USER_REPORTED_UNRESPONSIVE';

export interface ActiveSession {
  session: SessionRecord;
  device: DeviceRecord;
}

export interface RecorderStatus {
  active: ActiveSession | null;
  /** Events captured but not yet written to SQLite. */
  pendingWrites: number;
  /** Last write failure; cleared by the next successful write. */
  lastError: string | null;
}

export interface RecorderDeps {
  logger: BLELogger;
  devices: DeviceRepository;
  sessions: SessionRepository;
  events: EventRepository;
  gattProfiles: GattProfileRepository;
  getGattProfile: (bleDeviceId: string) => GattProfile | undefined;
  appVersion: string;
}

/** Writes are batched briefly so bursts (notifications) become one transaction. */
export const FLUSH_DELAY_MS = 250;
/** Retry delay after a failed write doubles up to this cap. */
export const MAX_RETRY_DELAY_MS = 10_000;

type Listener = (status: RecorderStatus) => void;

function toNewEvent(e: DiagnosticEvent, active: ActiveSession): NewEvent {
  return {
    id: e.id,
    sessionId: active.session.id,
    deviceId: active.device.id,
    eventType: e.eventType,
    observedAt: e.observedAt,
    recordedAt: e.recordedAt,
    source: e.source,
    description: e.description,
    rssi: e.rssi ?? null,
    connectionState: e.connectionState ?? null,
    serviceUuid: e.serviceUuid ?? null,
    characteristicUuid: e.characteristicUuid ?? null,
    rawPayloadHex: e.rawPayloadHex ?? null,
    metadataJson: e.metadata ? JSON.stringify(e.metadata) : null,
  };
}

/**
 * Persists the diagnostic events of one active session.
 *
 * Only events for the session's device are stored; other devices seen while
 * scanning stay in memory and are never written. Failed writes stay queued
 * and are retried — events are never dropped because storage failed.
 */
export class SessionRecorder {
  private active: ActiveSession | null = null;
  private queue: NewEvent[] = [];
  private lastError: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = FLUSH_DELAY_MS;
  private flushing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: RecorderDeps) {
    this.unsubscribe = deps.logger.subscribe((e) => this.handleEvent(e));
  }

  /** Close out sessions left ACTIVE by a previous run of the app. */
  async init(): Promise<number> {
    return this.deps.sessions.markActiveInterrupted();
  }

  getStatus(): RecorderStatus {
    return {
      active: this.active,
      pendingWrites: this.queue.length,
      lastError: this.lastError,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(input: {
    bleDeviceId: string;
    advertisedName: string | null;
    sessionType: SessionType;
    notes?: string | null;
  }): Promise<ActiveSession> {
    if (this.active) {
      throw new Error('A diagnostic session is already active. End it first.');
    }
    const device = await this.deps.devices.ensure(input.bleDeviceId, input.advertisedName);
    const session = await this.deps.sessions.create({
      deviceId: device.id,
      sessionType: input.sessionType,
      appVersion: this.deps.appVersion,
      notes: input.notes,
    });
    this.active = { session, device };
    this.emit();

    // Capture what is already known about the device's GATT layout.
    const profile = this.deps.getGattProfile(input.bleDeviceId);
    if (profile) {
      await this.saveProfile(device.id, profile);
    }
    return this.active;
  }

  /**
   * Record something the user observed physically. The app cannot detect
   * an AXS button press or a failed shift itself (PROJECT.md Module 6).
   */
  addMarker(type: UserMarker, note?: string): DiagnosticEvent {
    const active = this.active;
    if (!active?.device.bleIdentifier) {
      throw new Error('Start a diagnostic session before adding markers.');
    }
    const trimmed = note?.trim();
    const description =
      type === 'MANUAL_WAKE_MARKER'
        ? 'User pressed the AXS button.'
        : 'User reported the device unresponsive.';
    return this.deps.logger.log({
      bleDeviceId: active.device.bleIdentifier,
      eventType: type,
      source: 'USER_MARKER',
      description: trimmed ? `${description} Note: ${trimmed}` : description,
      metadata: trimmed ? { note: trimmed } : undefined,
    });
  }

  async stop(): Promise<SessionRecord | null> {
    const active = this.active;
    if (!active) {
      return null;
    }
    await this.flush();
    if (this.queue.length > 0) {
      throw new Error(
        `Cannot end the session: ${this.queue.length} events are not yet saved. ${this.lastError ?? ''}`.trim(),
      );
    }
    await this.deps.sessions.complete(active.session.id);
    this.active = null;
    this.emit();
    return this.deps.sessions.getById(active.session.id);
  }

  /** Write queued events now. Safe to call concurrently. */
  flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushing = this.flushing.then(() => this.writeQueued());
    return this.flushing;
  }

  async dispose(): Promise<void> {
    this.unsubscribe();
    await this.flush();
    this.listeners.clear();
  }

  private handleEvent(e: DiagnosticEvent): void {
    const active = this.active;
    if (!active || e.bleDeviceId !== active.device.bleIdentifier) {
      return;
    }
    this.queue.push(toNewEvent(e, active));
    if (e.eventType === 'GATT_DISCOVERED') {
      const profile = this.deps.getGattProfile(e.bleDeviceId);
      if (profile) {
        this.saveProfile(active.device.id, profile).catch((err) => this.setError(err));
      }
    }
    this.scheduleFlush();
    this.emit();
  }

  private scheduleFlush(delayMs = FLUSH_DELAY_MS): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush().catch(() => undefined);
      }, delayMs);
    }
  }

  private async writeQueued(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    const batch = this.queue;
    this.queue = [];
    try {
      await this.deps.events.insertMany(batch);
      this.lastError = null;
      this.retryDelayMs = FLUSH_DELAY_MS;
    } catch (err) {
      // Put the batch back in front; IDs are stable, so a retry is idempotent.
      this.queue = [...batch, ...this.queue];
      this.setError(err);
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS);
      this.scheduleFlush(this.retryDelayMs);
    }
    this.emit();
  }

  private async saveProfile(deviceId: string, profile: GattProfile): Promise<void> {
    await this.deps.gattProfiles.saveIfNew(deviceId, profile, gattProfileHash(profile));
  }

  private setError(err: unknown): void {
    this.lastError = err instanceof Error ? err.message : String(err);
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
