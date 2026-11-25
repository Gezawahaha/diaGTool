import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type StatusTone } from '../app/theme';
import { StatusCard } from '../components/StatusCard';
import { Button } from '../components/ui';
import type { ScreenProps } from '../navigation/types';
import { useBleStore } from '../state/bleStore';

function adapterSummary(
  permission: string | null,
  adapterState: string | null,
): { value: string; tone: StatusTone; detail?: string } {
  if (permission === 'unsupported') {
    return { value: 'Unsupported platform', tone: 'error', detail: 'Android is required.' };
  }
  if (permission !== null && permission !== 'granted') {
    return { value: 'Permission needed', tone: 'warning', detail: 'Grant it from the scanner.' };
  }
  if (adapterState === 'on') {
    return { value: 'Ready', tone: 'normal' };
  }
  if (adapterState === null) {
    return { value: 'Checking…', tone: 'unknown' };
  }
  return { value: `Adapter ${adapterState}`, tone: 'warning' };
}

/**
 * Every card reports "not available" honestly until the feature behind it
 * exists — no placeholder data is shown as real.
 */
export function DashboardScreen({ navigation }: ScreenProps<'Dashboard'>) {
  const insets = useSafeAreaInsets();
  const permission = useBleStore((s) => s.permission);
  const adapterState = useBleStore((s) => s.adapterState);
  const connectionStates = useBleStore((s) => s.connectionStates);
  const knownDevices = useBleStore((s) => s.knownDevices);

  const connectedIds = Object.entries(connectionStates)
    .filter(([, state]) => state === 'connected')
    .map(([id]) => id);
  const connectedLabel =
    connectedIds.length === 0
      ? 'Not connected'
      : connectedIds.map((id) => knownDevices[id]?.name ?? id).join(', ');
  const bluetooth = adapterSummary(permission, adapterState);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <Text style={styles.title}>AXS Diagnostic Lab</Text>
      <Text style={styles.subtitle}>Observe first. Record accurately.</Text>

      <Button title="Scan for devices" onPress={() => navigation.navigate('Scanner')} />

      <StatusCard label="Bluetooth" {...bluetooth} />
      <StatusCard
        label="Connection"
        value={connectedLabel}
        tone={connectedIds.length > 0 ? 'normal' : 'unknown'}
      />
      <StatusCard
        label="Latest diagnostic session"
        value="Not Available"
        tone="unknown"
        detail="Local session storage arrives in Sprint 3."
      />
      <StatusCard
        label="Cloud sync"
        value="Not configured"
        tone="unknown"
        detail="Diagnostics never depend on the cloud."
      />
      <StatusCard
        label="Firmware recovery"
        value="Not supported"
        tone="warning"
        detail="Firmware recovery not yet supported — verified protocol or official procedure required."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginBottom: spacing.sm },
});
