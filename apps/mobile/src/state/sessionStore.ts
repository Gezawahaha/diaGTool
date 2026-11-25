import { create } from 'zustand';
import type { ActiveSession, RecorderStatus } from '../diagnostics/SessionRecorder';
import type { LocalServices } from '../storage/LocalDatabase';

export interface SessionStoreState {
  services: LocalServices | null;
  /** Set when local storage cannot be opened; diagnostics are then not saved. */
  storageError: string | null;
  active: ActiveSession | null;
  pendingWrites: number;
  writeError: string | null;
  /** Bumped when stored sessions change, so lists refetch. */
  revision: number;
}

export const useSessionStore = create<SessionStoreState>()(() => ({
  services: null,
  storageError: null,
  active: null,
  pendingWrites: 0,
  writeError: null,
  revision: 0,
}));

export function bindSessionStore(services: LocalServices): () => void {
  const apply = (status: RecorderStatus) =>
    useSessionStore.setState((s) => ({
      active: status.active,
      pendingWrites: status.pendingWrites,
      writeError: status.lastError,
      // Session start/end and completed writes change what lists show.
      revision:
        status.active?.session.id !== s.active?.session.id || status.pendingWrites === 0
          ? s.revision + 1
          : s.revision,
    }));
  useSessionStore.setState({ services, storageError: null });
  apply(services.recorder.getStatus());
  return services.recorder.subscribe(apply);
}
