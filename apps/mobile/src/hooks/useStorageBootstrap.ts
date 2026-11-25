import { useEffect } from 'react';
import { AppState } from 'react-native';
import { disposeLocalServices, getLocalServices } from '../storage/LocalDatabase';
import { bindSessionStore, useSessionStore } from '../state/sessionStore';

/** Open local storage and keep the session store in sync with the recorder. */
export function useStorageBootstrap(): void {
  useEffect(() => {
    let unbind: (() => void) | null = null;
    let cancelled = false;

    getLocalServices()
      .then((services) => {
        if (!cancelled) {
          unbind = bindSessionStore(services);
        }
      })
      .catch((err) =>
        useSessionStore.setState({
          storageError: err instanceof Error ? err.message : String(err),
        }),
      );

    // Write queued events before Android may suspend or kill the app.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        useSessionStore.getState().services?.recorder.flush().catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      appState.remove();
      unbind?.();
      disposeLocalServices().catch(() => undefined);
    };
  }, []);
}
