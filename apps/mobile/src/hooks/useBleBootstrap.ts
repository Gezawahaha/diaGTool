import { useEffect } from 'react';
import { AppState } from 'react-native';
import { disposeBLEManager, getBLEManager } from '../bluetooth/BLEManager';
import { checkBlePermissions } from '../bluetooth/permissions';
import { bindBleStore, useBleStore } from '../state/bleStore';

/** Start the BLE module, mirror its state into the store, and tidy up on exit. */
export function useBleBootstrap(): void {
  useEffect(() => {
    const manager = getBLEManager();
    const unbind = bindBleStore(manager);

    manager
      .start()
      .then(() => manager.checkState())
      .then((adapterState) => useBleStore.setState({ adapterState }))
      .catch((err) => console.warn('BLE start failed', err));
    checkBlePermissions()
      .then((permission) => useBleStore.getState().setPermission(permission))
      .catch(() => undefined);

    // Never keep scanning in the background: it drains the battery and
    // Android throttles background scans anyway.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        manager.scanner.stop().catch(() => undefined);
      } else {
        checkBlePermissions()
          .then((permission) => useBleStore.getState().setPermission(permission))
          .catch(() => undefined);
      }
    });

    return () => {
      appState.remove();
      unbind();
      disposeBLEManager().catch(() => undefined);
    };
  }, []);
}
