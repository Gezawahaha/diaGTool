import type { SyncBatchResponse } from '@axs/shared';
import type { SettingsRepository } from '../storage/SettingsRepository';
import type { OutboxBatch, PendingCounts, SyncOutbox } from '../storage/SyncOutbox';
import { uuidv4 } from '../utils/id';
import { ApiRequestError, type APIClient } from './APIClient';
import type { AuthManager } from './AuthManager';

/** Must not exceed the server's MAX_EVENTS_PER_BATCH. */
export const MAX_EVENTS_PER_REQUEST = 200;
/** Leaves headroom under the Worker's 256 KB request body limit. */
export const MAX_REQUEST_BYTES = 200 * 1024;
/** Batches per run; the rest waits for the next trigger (free-tier friendly). */
export const MAX_BATCHES_PER_RUN = 10;
export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 30 * 60_000;

export type SyncState =
  | 'disabled'
  | 'not_configured'
  | 'signed_out'
  | 'idle'
  | 'syncing'
  | 'backing_off'
  | 'quota_exceeded'
  | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: PendingCounts | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** When the next automatic attempt is allowed after a failure. */
  nextRetryAt: string | null;
}

type Listener = (status: SyncStatus) => void;

export interface SyncDeps {
  api: APIClient;
  auth: AuthManager;
  outbox: SyncOutbox;
  settings: SettingsRepository;
  now?: () => number;
  random?: () => number;
}

function byteLength(text: string): number {
  // UTF-8 upper bound is fine for a size guard.
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return bytes;
}

/**
 * Uploads the local outbox in idempotent batches (PROJECT.md §12).
 *
 * Every batch carries stable record IDs, so a retry after a timeout or crash
 * can never create duplicates. Failures never touch local data: temporary
 * ones back off exponentially with jitter (or honour Retry-After); quota
 * exhaustion waits for the server's daily reset.
 */
export class SyncManager {
  private status: SyncStatus = {
    state: 'idle',
    pending: null,
    lastSyncAt: null,
    lastError: null,
    nextRetryAt: null,
  };
  private failures = 0;
  private running: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: SyncDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Refresh counts and the idle/disabled state without uploading. */
  async refreshStatus(): Promise<void> {
    const settings = await this.deps.settings.get();
    const pending = await this.deps.outbox.counts();
    const gate = this.gate(settings.syncEnabled, settings.apiBaseUrl);
    this.update({
      pending,
      lastSyncAt: settings.lastSyncAt,
      ...(gate
        ? { state: gate }
        : this.status.state === 'disabled' ||
            this.status.state === 'not_configured' ||
            this.status.state === 'signed_out'
          ? { state: 'idle' as const }
          : {}),
    });
  }

  /**
   * Run a sync. Automatic triggers pass `force: false` and respect the
   * backoff window; the user's "Sync now" passes `force: true`.
   */
  sync({ force = false } = {}): Promise<void> {
    this.running ??= this.run(force).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private gate(syncEnabled: boolean, apiBaseUrl: string | null): SyncState | null {
    if (!syncEnabled) {
      return 'disabled';
    }
    if (!apiBaseUrl) {
      return 'not_configured';
    }
    if (!this.deps.auth.isSignedIn()) {
      return 'signed_out';
    }
    return null;
  }

  private async run(force: boolean): Promise<void> {
    const settings = await this.deps.settings.get();
    const gate = this.gate(settings.syncEnabled, settings.apiBaseUrl);
    if (gate) {
      this.update({ state: gate, pending: await this.deps.outbox.counts() });
      return;
    }
    const retryAt = this.status.nextRetryAt ? Date.parse(this.status.nextRetryAt) : 0;
    if (!force && retryAt > this.now()) {
      return;
    }

    this.update({ state: 'syncing', lastError: null });
    try {
      for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
        const batch = await this.fitBatch();
        if (!batch) {
          break;
        }
        const result = await this.upload(batch);
        const syncedAt = new Date(this.now()).toISOString();
        await this.deps.outbox.applyResult(batch, result, syncedAt);
        await this.deps.settings.update({ lastSyncAt: syncedAt });
        this.update({ lastSyncAt: syncedAt, pending: await this.deps.outbox.counts() });
      }
      this.failures = 0;
      this.update({ state: 'idle', nextRetryAt: null, pending: await this.deps.outbox.counts() });
    } catch (err) {
      await this.handleFailure(err);
    }
  }

  /** The next batch, shrunk until it fits the request size limit. */
  private async fitBatch(): Promise<OutboxBatch | null> {
    let limit = MAX_EVENTS_PER_REQUEST;
    for (;;) {
      const batch = await this.deps.outbox.nextBatch(limit);
      if (batch.events.length === 0 && batch.sessions.length === 0 && batch.devices.length === 0) {
        return null;
      }
      if (byteLength(JSON.stringify(batch)) <= MAX_REQUEST_BYTES || limit === 1) {
        return batch;
      }
      limit = Math.max(1, Math.floor(limit / 2));
    }
  }

  private async upload(batch: OutboxBatch): Promise<SyncBatchResponse> {
    const body = { batch_id: uuidv4(), ...batch };
    const send = async (forceRefresh: boolean) =>
      this.deps.api.request<SyncBatchResponse>('POST', '/sync/batch', {
        body,
        accessToken: await this.deps.auth.getAccessToken(forceRefresh),
      });
    try {
      return await send(false);
    } catch (err) {
      // The access token may have been revoked server-side; refresh once.
      if (err instanceof ApiRequestError && err.status === 401) {
        return send(true);
      }
      throw err;
    }
  }

  private async handleFailure(err: unknown): Promise<void> {
    const pending = await this.deps.outbox.counts().catch(() => this.status.pending);
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof ApiRequestError && err.code === 'SIGNED_OUT') {
      this.update({ state: 'signed_out', lastError: message, pending, nextRetryAt: null });
      return;
    }
    if (err instanceof ApiRequestError && err.temporary) {
      this.failures += 1;
      const quota = err.code === 'QUOTA_EXCEEDED';
      const delayMs =
        err.retryAfterSeconds !== null
          ? err.retryAfterSeconds * 1000
          : this.backoffMs();
      this.update({
        state: quota ? 'quota_exceeded' : 'backing_off',
        lastError: message,
        pending,
        nextRetryAt: new Date(this.now() + delayMs).toISOString(),
      });
      return;
    }
    // Not retryable as-is (e.g. 4xx, misconfiguration); wait for the user.
    this.update({ state: 'error', lastError: message, pending, nextRetryAt: null });
  }

  /** Exponential backoff with "equal jitter": half fixed, half random. */
  private backoffMs(): number {
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.failures - 1));
    return Math.round(exp / 2 + this.random() * (exp / 2));
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }
}
