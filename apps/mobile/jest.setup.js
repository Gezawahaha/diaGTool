/* global jest */
// SafeAreaProvider renders nothing until native window metrics arrive,
// which never happens under Jest. Use the library's official mock.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The native BLE module is unavailable under Jest. Unit tests use
// FakeBleTransport; this stub only lets the app shell render.
jest.mock('react-native-ble-manager', () => {
  const subscription = () => ({ remove: jest.fn() });
  return {
    __esModule: true,
    BleState: {
      Unknown: 'unknown',
      Resetting: 'resetting',
      Unsupported: 'unsupported',
      Unauthorized: 'unauthorized',
      On: 'on',
      Off: 'off',
      TurningOn: 'turning_on',
      TurningOff: 'turning_off',
    },
    default: {
      start: jest.fn(() => Promise.resolve()),
      checkState: jest.fn(() => Promise.resolve('on')),
      enableBluetooth: jest.fn(() => Promise.resolve()),
      scan: jest.fn(() => Promise.resolve()),
      stopScan: jest.fn(() => Promise.resolve()),
      connect: jest.fn(() => Promise.resolve()),
      disconnect: jest.fn(() => Promise.resolve()),
      retrieveServices: jest.fn(() => Promise.resolve({ id: '', rssi: 0, advertising: {} })),
      read: jest.fn(() => Promise.resolve([])),
      readRSSI: jest.fn(() => Promise.resolve(0)),
      startNotification: jest.fn(() => Promise.resolve()),
      stopNotification: jest.fn(() => Promise.resolve()),
      onDiscoverPeripheral: jest.fn(subscription),
      onStopScan: jest.fn(subscription),
      onDidUpdateState: jest.fn(subscription),
      onDisconnectPeripheral: jest.fn(subscription),
      onDidUpdateValueForCharacteristic: jest.fn(subscription),
    },
  };
});

// op-sqlite is native; back it with Node's built-in SQLite so the app shell
// opens a real (in-memory) database under Jest.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => require('./src/test-utils/nodeSqlite').openMemoryDatabase(),
}));

// Keystore-backed token storage is native; keep it in memory under Jest.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
    setGenericPassword: jest.fn(async (username, password, options) => {
      store.set(options?.service, { username, password });
      return { service: options?.service, storage: 'KeystoreAESGCM_NoAuth' };
    }),
    getGenericPassword: jest.fn(async (options) => store.get(options?.service) ?? false),
    resetGenericPassword: jest.fn(async (options) => store.delete(options?.service)),
  };
});
