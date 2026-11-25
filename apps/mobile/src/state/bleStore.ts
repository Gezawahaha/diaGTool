import { create } from 'zustand';
import type { BLEManager } from '../bluetooth/BLEManager';
import type { DiagnosticEvent } from '../bluetooth/BLELogger';
import type { PermissionStatus } from '../bluetooth/permissions';
import type { ConnectionState, DiscoveredDevice } from '../bluetooth/types';

/** Mirrors BLE subsystem state for React. The subsystems remain the source of truth. */
export interface BleStoreState {
  /** Adapter state reported by the OS (`on`, `off`, `unauthorized`, …), or null before the first report. */
  adapterState: string | null;
  permission: PermissionStatus | null;
  scanning: boolean;
  /** Devices seen in the current (or last) scan. */
  devices: DiscoveredDevice[];
  /** Latest advertisement per device across all scans this app session. */
  knownDevices: Record<string, DiscoveredDevice>;
  connectionStates: Record<string, ConnectionState>;
  events: DiagnosticEvent[];
  /** Bumped whenever GATT profiles, values or subscriptions change. */
  gattRevision: number;
  setPermission(permission: PermissionStatus): void;
}

/** Events kept in the store for display; the logger holds more. */
const MAX_DISPLAY_EVENTS = 500;

export const useBleStore = create<BleStoreState>()((set) => ({
  adapterState: null,
  permission: null,
  scanning: false,
  devices: [],
  knownDevices: {},
  connectionStates: {},
  events: [],
  gattRevision: 0,
  setPermission: (permission) => set({ permission }),
}));

/** Subscribe the store to a manager. Returns an unsubscribe function. */
export function bindBleStore(manager: BLEManager): () => void {
  const unsubs = [
    manager.scanner.subscribe((devices, scanning) =>
      useBleStore.setState((s) => {
        const knownDevices = { ...s.knownDevices };
        for (const d of devices) {
          knownDevices[d.id] = d;
        }
        return { devices, scanning, knownDevices };
      }),
    ),
    manager.connection.subscribe((deviceId, state) =>
      useBleStore.setState((s) => ({
        connectionStates: { ...s.connectionStates, [deviceId]: state },
      })),
    ),
    manager.gatt.subscribe(() =>
      useBleStore.setState((s) => ({ gattRevision: s.gattRevision + 1 })),
    ),
    manager.logger.subscribe((event) =>
      useBleStore.setState((s) => ({
        events: [...s.events, event].slice(-MAX_DISPLAY_EVENTS),
      })),
    ),
    manager.onStateChange((adapterState) => useBleStore.setState({ adapterState })),
  ];
  return () => unsubs.forEach((u) => u());
}
