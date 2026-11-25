import type { EventSource, EventType } from '@axs/shared';
import { uuidv4 } from '../utils/id';
import type { ConnectionState } from './types';

/**
 * A diagnostic event, shaped after PROJECT.md §8 Module 6 and the D1
 * `diagnostic_events` table. The logger keeps a bounded in-memory history;
 * SessionRecorder persists the events that belong to an active session.
 */
export interface DiagnosticEvent {
  /** Stable UUID; also the stored and synced ID, so retries never duplicate. */
  id: string;
  /** Platform BLE identifier of the device the event concerns. */
  bleDeviceId: string;
  eventType: EventType;
  /** When the observation happened (device callback time). */
  observedAt: string;
  /** When the app recorded it. */
  recordedAt: string;
  source: EventSource;
  description: string;
  rssi?: number;
  connectionState?: ConnectionState;
  serviceUuid?: string;
  characteristicUuid?: string;
  rawPayloadHex?: string;
  metadata?: Record<string, unknown>;
}

export type EventInput = Omit<
  DiagnosticEvent,
  'id' | 'observedAt' | 'recordedAt' | 'source'
> & {
  observedAt?: string;
  source?: EventSource;
};

type Listener = (event: DiagnosticEvent) => void;

/** Upper bound on in-memory events so a chatty notification can't exhaust memory. */
export const MAX_IN_MEMORY_EVENTS = 2000;

export class BLELogger {
  private readonly events: DiagnosticEvent[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  log(input: EventInput): DiagnosticEvent {
    const recordedAt = this.now().toISOString();
    const event: DiagnosticEvent = {
      ...input,
      id: uuidv4(),
      observedAt: input.observedAt ?? recordedAt,
      recordedAt,
      source: input.source ?? 'AUTOMATIC_OBSERVATION',
    };
    this.events.push(event);
    if (this.events.length > MAX_IN_MEMORY_EVENTS) {
      this.events.splice(0, this.events.length - MAX_IN_MEMORY_EVENTS);
    }
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  all(): readonly DiagnosticEvent[] {
    return this.events;
  }

  forDevice(bleDeviceId: string): DiagnosticEvent[] {
    return this.events.filter((e) => e.bleDeviceId === bleDeviceId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
