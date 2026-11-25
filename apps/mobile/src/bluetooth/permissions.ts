import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unsupported';

/**
 * Runtime permissions needed for BLE scanning and connecting.
 *
 * Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT. Scanning is
 * declared neverForLocation, so no location permission is requested.
 * Android 11 and lower: the OS requires ACCESS_FINE_LOCATION for BLE scans.
 */
export function requiredPermissions(apiLevel: number): Permission[] {
  const P = PermissionsAndroid.PERMISSIONS;
  return apiLevel >= 31
    ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT]
    : [P.ACCESS_FINE_LOCATION];
}

export async function checkBlePermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unsupported';
  }
  const results = await Promise.all(
    requiredPermissions(Number(Platform.Version)).map((p) => PermissionsAndroid.check(p)),
  );
  return results.every(Boolean) ? 'granted' : 'denied';
}

export async function requestBlePermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unsupported';
  }
  const results = await PermissionsAndroid.requestMultiple(
    requiredPermissions(Number(Platform.Version)),
  );
  const values = Object.values(results);
  if (values.every((r) => r === PermissionsAndroid.RESULTS.GRANTED)) {
    return 'granted';
  }
  if (values.some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
    return 'blocked';
  }
  return 'denied';
}
