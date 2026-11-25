import type { EventSubscription } from 'react-native';
import type { BLELogger } from './BLELogger';
import type { BleTransport, ConnectionState } from './types';

export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

type Listener = (deviceId: string, state: ConnectionState) => void;

class ConnectTimeoutError extends Error {
  constructor(ms: number) {
    super(`Connection attempt timed out after ${ms} ms.`);
    this.name = 'ConnectTimeoutError';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Connection lifecycle for individual peripherals.
 *
 * There is intentionally no automatic reconnect: repeated reconnects drain
 * the FD battery and can interfere with the official SRAM AXS app
 * (PROJECT.md Module 3). Reconnecting is always a user action.
 */
export class BLEConnection {
  private readonly states = new Map<string, ConnectionState>();
  /** Devices whose next disconnect event is one we asked for. */
  private readonly expectedDisconnects = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private readonly subscription: EventSubscription;

  constructor(
    private readonly transport: BleTransport,
    private readonly logger: BLELogger,
    private readonly timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  ) {
    this.subscription = transport.onDisconnectPeripheral((e) =>
      this.handleDisconnected(e.peripheral, e.status),
    );
  }

  getState(deviceId: string): ConnectionState {
    return this.states.get(deviceId) ?? 'disconnected';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(deviceId: string): Promise<void> {
    const current = this.getState(deviceId);
    if (current === 'connected' || current === 'connecting') {
      return;
    }
    // A stale flag from a disconnect that raised no event must not hide a
    // genuine loss on this new connection.
    this.expectedDisconnects.delete(deviceId);
    this.setState(deviceId, 'connecting');
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'CONNECTION_ATTEMPTED',
      description: 'Connection attempt started.',
      connectionState: 'connecting',
      metadata: { timeoutMs: this.timeoutMs },
    });

    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.transport.connect(deviceId),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ConnectTimeoutError(this.timeoutMs)), this.timeoutMs);
        }),
      ]);
    } catch (err) {
      // Mark disconnected first so a disconnect event raised by the cleanup
      // below is not mistaken for a lost connection.
      this.setState(deviceId, 'disconnected');
      // Android keeps trying a pending connect in the background; cancel it.
      await this.transport.disconnect(deviceId).catch(() => undefined);
      this.logger.log({
        bleDeviceId: deviceId,
        eventType: 'CONNECTION_FAILED',
        description: errorMessage(err),
        connectionState: 'disconnected',
        metadata: {
          reason: err instanceof ConnectTimeoutError ? 'TIMEOUT' : 'ERROR',
          elapsedMs: Date.now() - startedAt,
        },
      });
      throw err;
    } finally {
      clearTimeout(timer);
    }

    this.setState(deviceId, 'connected');
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'CONNECTION_ESTABLISHED',
      description: 'Connected.',
      connectionState: 'connected',
      metadata: { elapsedMs: Date.now() - startedAt },
    });
  }

  async disconnect(deviceId: string): Promise<void> {
    const current = this.getState(deviceId);
    if (current === 'disconnected' || current === 'disconnecting') {
      return;
    }
    this.expectedDisconnects.add(deviceId);
    this.setState(deviceId, 'disconnecting');
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'DISCONNECT_REQUESTED',
      source: 'USER_MARKER',
      description: 'User requested disconnect.',
      connectionState: 'disconnecting',
    });
    try {
      await this.transport.disconnect(deviceId);
    } finally {
      // Some stacks emit no disconnect event after a forced disconnect.
      if (this.getState(deviceId) !== 'disconnected') {
        this.setState(deviceId, 'disconnected');
      }
    }
  }

  async readRssi(deviceId: string): Promise<number> {
    const rssi = await this.transport.readRSSI(deviceId);
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'RSSI_SAMPLE',
      description: `RSSI ${rssi} dBm (connected read).`,
      rssi,
      connectionState: this.getState(deviceId),
    });
    return rssi;
  }

  /** Disconnect everything and stop listening. Call on teardown. */
  async dispose(): Promise<void> {
    const connected = [...this.states.entries()]
      .filter(([, s]) => s !== 'disconnected')
      .map(([id]) => id);
    await Promise.all(connected.map((id) => this.disconnect(id).catch(() => undefined)));
    this.subscription.remove();
    this.listeners.clear();
  }

  private handleDisconnected(deviceId: string, status?: number): void {
    const wasExpected = this.expectedDisconnects.delete(deviceId);
    const previous = this.getState(deviceId);
    this.setState(deviceId, 'disconnected');
    if (wasExpected || previous === 'disconnected') {
      return;
    }
    // Observed fact only: the link dropped. It does not show the FD slept.
    this.logger.log({
      bleDeviceId: deviceId,
      eventType: 'CONNECTION_LOST',
      description: 'Connection lost without a user request.',
      connectionState: 'disconnected',
      metadata: { previousState: previous, status: status ?? null },
    });
  }

  private setState(deviceId: string, state: ConnectionState): void {
    this.states.set(deviceId, state);
    for (const listener of this.listeners) {
      listener(deviceId, state);
    }
  }
}
