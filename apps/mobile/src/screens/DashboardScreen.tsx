import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../app/theme';
import { StatusCard } from '../components/StatusCard';

/**
 * Sprint 1 shell. Every card reports "not available" honestly until the
 * feature behind it exists — no placeholder data is shown as real.
 */
export function DashboardScreen() {
  const insets = useSafeAreaInsets();

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

      <StatusCard
        label="Selected device"
        value="None selected"
        tone="unknown"
        detail="BLE scanning arrives in Sprint 2."
      />
      <StatusCard label="Connection" value="Not connected" tone="unknown" />
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
