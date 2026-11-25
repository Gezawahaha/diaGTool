import { create } from 'zustand';
import type { LocalServices } from '../storage/LocalDatabase';
import type { AppSettings } from '../storage/SettingsRepository';
import type { SyncStatus } from '../sync/SyncManager';

export interface SyncStoreState {
  status: SyncStatus | null;
  signedIn: boolean;
  settings: AppSettings | null;
}

export const useSyncStore = create<SyncStoreState>()(() => ({
  status: null,
  signedIn: false,
  settings: null,
}));

export async function reloadSettings(services: LocalServices): Promise<AppSettings> {
  const settings = await services.settings.get();
  services.setApiBaseUrl(settings.apiBaseUrl);
  useSyncStore.setState({ settings });
  await services.sync.refreshStatus();
  return settings;
}

export function bindSyncStore(services: LocalServices): () => void {
  useSyncStore.setState({
    status: services.sync.getStatus(),
    signedIn: services.auth.isSignedIn(),
  });
  reloadSettings(services).catch(() => undefined);
  const unsubs = [
    services.sync.subscribe((status) => useSyncStore.setState({ status })),
    services.auth.subscribe((signedIn) => {
      useSyncStore.setState({ signedIn });
      services.sync.refreshStatus().catch(() => undefined);
    }),
  ];
  return () => unsubs.forEach((u) => u());
}
