/**
 * Static guard for PROJECT.md: no undocumented BLE writes in this release.
 * Fails if any app source calls a BLE write or bonding API, or loads the
 * native module (beyond type imports) outside the one place that adapts it.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const ADAPTER = path.join(SRC, 'bluetooth', 'BLEManager.ts');
const FORBIDDEN = /\.(write|writeWithoutResponse|writeDescriptor|createBond|removeBond)\s*\(/;
const IMPORTS = /import\s+(type\s+)?[^;]*?from\s+'react-native-ble-manager'/g;
const REQUIRE = /require\(\s*'react-native-ble-manager'\s*\)/;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test-utils' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test('app source never calls BLE write or bonding APIs', () => {
  const offenders = sourceFiles(SRC).filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});

test('only BLEManager loads the native module at runtime', () => {
  const offenders = sourceFiles(SRC).filter((f) => {
    if (f === ADAPTER) {
      return false;
    }
    const source = fs.readFileSync(f, 'utf8');
    const valueImport = [...source.matchAll(IMPORTS)].some((m) => !m[1]);
    return valueImport || REQUIRE.test(source);
  });
  expect(offenders).toEqual([]);
});

test('the guard detects violations', () => {
  expect(FORBIDDEN.test('transport.write(id, s, c, [1])')).toBe(true);
  expect(FORBIDDEN.test('manager.gatt.read(id, s, c)')).toBe(false);
  const multiLineType = "import type {\n  Peripheral,\n} from 'react-native-ble-manager';";
  expect([...multiLineType.matchAll(IMPORTS)].every((m) => m[1])).toBe(true);
  const valueImport = "import BleManager from 'react-native-ble-manager';";
  expect([...valueImport.matchAll(IMPORTS)].some((m) => !m[1])).toBe(true);
});
