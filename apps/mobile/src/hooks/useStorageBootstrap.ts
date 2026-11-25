import { useEffect } from 'react';
import { AppState } from 'react-native';
import { disposeLocalServices, getLocalServices, type LocalServices } from '../storage/LocalDatabase';
import { bindSessionStore, useSessionStore } from '../state/sessionStore';
import { bindSyncStore } from '../state/syncStore';

/** While the app is open, look for pending records this often. */
export const SYNC_INTERVAL_MS = 5 * 60_000;

/** Start an automatic sync; failures are reported through sync status. */
function autoSync(services: LocalServices | null | undefined): void {
  services?.sync.sync().catch(() => undefined);
}

/**
 * Open local storage, keep the stores in sync with it, and trigger syncs
 * (PROJECT.md §12): on launch, on returning to the foreground, when a
 * session ends, and periodically while the app is open. No background
 * sync runs while the app is closed.
 */
export function useStorageBootstrap(): void {
  useEffect(() => {
    const unbinds: (() => void)[] = [];
    let cancelled = false;
    let services: LocalServices | null = null;

    getLocalServices()
      .then((s) => {
        if (cancelled) {
          return;
        }
        services = s;
        unbinds.push(bindSessionStore(s), bindSyncStore(s));
        let hadSession = s.recorder.getStatus().active !== null;
        unbinds.push(
          s.recorder.subscribe((status) => {
            const hasSession = status.active !== null;
            if (hadSession && !hasSession) {
              autoSync(s);
            }
            hadSession = hasSession;
          }),
        );
        autoSync(s);
      })
      .catch((err) =>
        useSessionStore.setState({
          storageError: err instanceof Error ? err.message : String(err),
        }),
      );

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        autoSync(services);
      } else {
        // Write queued events before Android may suspend or kill the app.
        services?.recorder.flush().catch(() => undefined);
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        autoSync(services);
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      appState.remove();
      unbinds.forEach((u) => u());
      disposeLocalServices().catch(() => undefined);
    };
  }, []);
}
