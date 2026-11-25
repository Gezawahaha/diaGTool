# BLE research notes

Facts here are either sourced or marked as untested. Nothing about SRAM's
GATT layout is recorded until it is observed on real hardware.

## BLE library: `react-native-ble-manager` 13.0.2

PROJECT.md §5.1 asks to evaluate `react-native-ble-plx` or a maintained
alternative and document the choice. Checked 25 November 2026:

| | react-native-ble-plx 3.5.1 | react-native-ble-manager 13.0.2 |
|---|---|---|
| Last release | Feb 2026 (previous: Feb 2025) | Nov 2026, frequent 12.x/13.x releases |
| New Architecture | No codegen spec; relies on RN's legacy-module interop | Ships a codegen TurboModule spec (`BleManagerSpec`) |
| Value format | base64 strings | `number[]` byte arrays |

React Native 0.88 runs the New Architecture only, so a native TurboModule
is the lower-risk option. Byte arrays also map directly to the hex payloads
we log.

**Untested:** the library has not yet been run on a physical phone with
this app. Confirm on hardware before relying on it.

## Read-only enforcement

- `src/bluetooth/types.ts` defines `BleTransport`, the only BLE surface the
  app uses. It omits `write`, `writeWithoutResponse`, `writeDescriptor`,
  `createBond` and `removeBond`.
- `__tests__/readOnlyGuard.test.js` fails the build if app code calls a
  write/bond API or loads the native module outside `BLEManager.ts`.
- Reads and notification subscriptions are refused unless the device's own
  GATT properties advertise Read / Notify / Indicate.
- `startNotification` writes the standard Client Characteristic
  Configuration Descriptor (0x2902). That is the BLE specification's
  subscription mechanism, not a proprietary command.

## Android permissions

- Android 12+ (API 31+): `BLUETOOTH_SCAN` (declared `neverForLocation`) and
  `BLUETOOTH_CONNECT`. No location permission.
- Android 11 and lower: `ACCESS_FINE_LOCATION` is required by the OS for BLE
  scans. The library's manifest declares location permissions without a
  version cap; the app manifest caps them at `maxSdkVersion="30"`.
- `neverForLocation` lets Android filter some beacon formats from scan
  results. **Untested:** whether this affects SRAM AXS advertising.

## Connection policy

- Scans are time-boxed (15 s) and stop when leaving the scanner or
  backgrounding the app.
- Connect attempts time out after 10 s and the pending connect is cancelled.
- No automatic reconnect. A dropped link is logged as `CONNECTION_LOST`,
  which is an observation, not evidence of sleep.
- Leaving the device screen stops notifications and disconnects, so the app
  does not hold the FD while the official SRAM AXS app needs it.

## Physical test checklist (Sprint 2)

Record phone model, Android version, and whether the official SRAM AXS app
is running for each item.

- [ ] App installs and launches on a physical Android phone.
- [ ] Permission prompt appears; denial and "don't ask again" are handled.
- [ ] Bluetooth off is detected; "Turn on Bluetooth" works.
- [ ] Scan lists nearby devices with RSSI; scan stops after 15 s.
- [ ] FD A (faulty) appears in scan results — record name, identifier,
      manufacturer data, service UUIDs exactly as shown.
- [ ] FD B (reference) appears — record the same fields.
- [ ] Connect to each FD: record outcome (established / failed / timeout).
- [ ] If connected: record the full GATT profile (Export JSON) for each FD.
- [ ] Read each readable characteristic once; record values.
- [ ] Subscribe to notifying characteristics; record whether anything arrives.
- [ ] Leave the device screen; confirm the FD still works with the official app.

## Observations

_None yet. Add dated entries with phone, Android version, and exported JSON._
