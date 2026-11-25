import type { SqlDatabase } from './sql';

/**
 * Non-secret app settings. Tokens never go here; they live in the Android
 * Keystore via TokenStore.
 */
export interface AppSettings {
  /** Worker API origin, e.g. https://axs-diagnostic-lab-api.example.workers.dev */
  apiBaseUrl: string | null;
  /** Explicit opt-in for uploading diagnostic data (PROJECT.md §13). */
  syncEnabled: boolean;
  /** Email of the signed-in account, for display only. */
  accountEmail: string | null;
  lastSyncAt: string | null;
}

const KEYS = {
  apiBaseUrl: 'api_base_url',
  syncEnabled: 'sync_enabled',
  accountEmail: 'account_email',
  lastSyncAt: 'last_sync_at',
} as const;

export class SettingsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(): Promise<AppSettings> {
    const { rows } = await this.db.execute('SELECT key, value FROM settings');
    const map = new Map(rows.map((r) => [String(r.key), r.value === null ? null : String(r.value)]));
    return {
      apiBaseUrl: map.get(KEYS.apiBaseUrl) ?? null,
      syncEnabled: map.get(KEYS.syncEnabled) === '1',
      accountEmail: map.get(KEYS.accountEmail) ?? null,
      lastSyncAt: map.get(KEYS.lastSyncAt) ?? null,
    };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    await this.db.transaction(async (tx) => {
      for (const [field, value] of Object.entries(patch)) {
        const key = KEYS[field as keyof AppSettings];
        const stored =
          value === null || value === undefined
            ? null
            : typeof value === 'boolean'
              ? value
                ? '1'
                : '0'
              : String(value);
        await tx.execute(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, stored],
        );
      }
    });
    return this.get();
  }
}

/**
 * Accept https URLs, or http only for local development hosts (the Android
 * emulator reaches the dev machine at 10.0.2.2). Returns the normalised
 * origin or throws with a user-facing message.
 */
export function normaliseApiBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  const match = /^(https?):\/\/([^/?#\s]+)$/i.exec(trimmed);
  if (!match) {
    throw new Error('Enter the API origin only, e.g. https://your-worker.workers.dev');
  }
  const scheme = match[1]!.toLowerCase();
  const host = match[2]!.toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(hostname);
  if (scheme !== 'https' && !local) {
    throw new Error('Use https:// — plain http is only allowed for local development.');
  }
  return `${scheme}://${host}`;
}
