import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { getBLEManager } from '../bluetooth/BLEManager';
import { requestBlePermissions } from '../bluetooth/permissions';
import type { DiscoveredDevice } from '../bluetooth/types';
import { Banner, Button, Chip, textStyles } from '../components/ui';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { ScreenProps } from '../navigation/types';
import { useBleStore } from '../state/bleStore';

export function filterDevices(devices: DiscoveredDevice[], query: string): DiscoveredDevice[] {
  const q = query.trim().toLowerCase();
  return devices
    .filter(
      (d) => !q || d.id.toLowerCase().includes(q) || (d.name ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => b.rssi - a.rssi);
}

export function ScannerScreen({ navigation }: ScreenProps<'Scanner'>) {
  const manager = getBLEManager();
  const { permission, adapterState, scanning, devices, setPermission } = useBleStore();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterDevices(devices, query), [devices, query]);

  const requestPermission = useAsyncAction(async () => {
    setPermission(await requestBlePermissions());
  });
  const scan = useAsyncAction(() =>
    scanning ? manager.scanner.stop() : manager.scanner.start(),
  );
  const enable = useAsyncAction(() => manager.requestEnable());

  // Stop scanning when the user leaves this screen.
  useFocusEffect(
    useCallback(
      () => () => {
        manager.scanner.stop().catch(() => undefined);
      },
      [manager],
    ),
  );

  const ready = permission === 'granted' && adapterState === 'on';

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        <View style={styles.header}>
          {permission !== 'granted' && (
            <Banner
              tone="warning"
              message={
                permission === 'blocked'
                  ? 'Bluetooth permission was denied permanently. Enable "Nearby devices" in system settings.'
                  : 'Bluetooth permission is needed to scan for and connect to devices.'
              }
            >
              {permission === 'blocked' ? (
                <Button title="Open settings" onPress={() => Linking.openSettings()} />
              ) : (
                <Button
                  title="Grant permission"
                  onPress={requestPermission.run}
                  busy={requestPermission.busy}
                />
              )}
            </Banner>
          )}
          {permission === 'granted' && adapterState !== 'on' && (
            <Banner
              tone="warning"
              message={`Bluetooth adapter state: ${adapterState ?? 'unknown'}.`}
            >
              {adapterState === 'off' && (
                <Button title="Turn on Bluetooth" onPress={enable.run} busy={enable.busy} />
              )}
            </Banner>
          )}

          <Button
            title={scanning ? 'Stop scan' : 'Start scan'}
            variant={scanning ? 'secondary' : 'primary'}
            onPress={scan.run}
            disabled={!ready && !scanning}
            busy={scan.busy}
          />
          {scan.error && <Text style={textStyles.error}>{scan.error}</Text>}

          <TextInput
            style={styles.search}
            placeholder="Filter by name or identifier"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={textStyles.muted}>
            {scanning ? 'Scanning… ' : ''}
            {visible.length} device{visible.length === 1 ? '' : 's'}. Names are shown as
            advertised and do not identify a model.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={[textStyles.muted, styles.empty]}>
          {scanning ? 'No devices observed yet.' : 'No devices observed. Start a scan.'}
        </Text>
      }
      renderItem={({ item }) => (
        <DeviceRow
          device={item}
          onPress={() => navigation.navigate('DeviceDetail', { deviceId: item.id })}
        />
      )}
    />
  );
}

function DeviceRow({ device, onPress }: { device: DiscoveredDevice; onPress: () => void }) {
  const mfrCount = Object.keys(device.manufacturerData).length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Text style={[textStyles.body, !device.name && styles.unnamed]} numberOfLines={1}>
          {device.name ?? 'Unnamed device'}
        </Text>
        <Text style={textStyles.muted} numberOfLines={1}>
          {device.id}
        </Text>
        <View style={styles.chips}>
          {device.isConnectable === false && <Chip label="not connectable" />}
          {device.serviceUUIDs.length > 0 && (
            <Chip label={`${device.serviceUUIDs.length} svc UUID`} />
          )}
          {mfrCount > 0 && <Chip label="mfr data" />}
        </View>
      </View>
      <Text style={styles.rssi}>{device.rssi} dBm</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  search: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.textPrimary,
  },
  empty: { textAlign: 'center', marginTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1, gap: 2 },
  unnamed: { color: colors.textSecondary, fontStyle: 'italic' },
  chips: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  rssi: { color: colors.textPrimary, fontSize: 15, fontVariant: ['tabular-nums'] },
});
