import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type StatusTone } from '../app/theme';
import { SESSION_TYPE_LABELS, SessionPanel } from '../components/SessionPanel';
import { StatusCard } from '../components/StatusCard';
import { Button, Section } from '../components/ui';
import type { ScreenProps } from '../navigation/types';
import { useBleStore } from '../state/bleStore';
import { useSessionStore } from '../state/sessionStore';
import { useSyncStore } from '../state/syncStore';
import type { SyncStatus } from '../sync/SyncManager';
import { SYNC_STATE_LABELS } from './SettingsScreen';
import type { SessionSummary } from '../storage/repositories';

/** Latest stored session. */
function useLatestSession() {
  const services = useSessionStore((s) => s.services);
  const revision = useSessionStore((s) => s.revision);
  const [latest, setLatest] = useState<SessionSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      services?.sessions
        .listSummaries(1)
        .then((rows) => !cancelled && setLatest(rows[0] ?? null))
        .catch(() => undefined);
      services?.sync.refreshStatus().catch(() => undefined);
      return () => {
        cancelled = true;
      };
      // revision: refetch when sessions change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [services, revision]),
  );
  return latest;
}

function syncSummary(status: SyncStatus | null): { value: string; tone: StatusTone; detail?: string } {
  if (!status) {
    return { value: 'Checking…', tone: 'unknown' };
  }
  const pending = status.pending?.events ?? 0;
  const detail = [
    `${pending} event${pending === 1 ? '' : 's'} pending upload`,
    status.lastSyncAt ? `last sync ${status.lastSyncAt}` : null,
    status.lastError,
  ]
    .filter(Boolean)
    .join(' · ');
  const tone: StatusTone =
    status.state === 'idle'
      ? pending > 0
        ? 'warning'
        : 'normal'
      : status.state === 'error' || status.state === 'quota_exceeded'
        ? 'error'
        : status.state === 'backing_off' || status.state === 'signed_out'
          ? 'warning'
          : 'unknown';
  return { value: SYNC_STATE_LABELS[status.state], tone, detail };
}

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
  const storageError = useSessionStore((s) => s.storageError);
  const active = useSessionStore((s) => s.active);
  const latest = useLatestSession();
  const sync = syncSummary(useSyncStore((s) => s.status));

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
      <Button
        title="Sessions & logs"
        variant="secondary"
        onPress={() => navigation.navigate('Sessions')}
      />
      <Button title="Settings" variant="secondary" onPress={() => navigation.navigate('Settings')} />

      {active && (
        <Section title="Active session">
          <SessionPanel />
        </Section>
      )}

      <StatusCard label="Bluetooth" {...bluetooth} />
      <StatusCard
        label="Connection"
        value={connectedLabel}
        tone={connectedIds.length > 0 ? 'normal' : 'unknown'}
      />
      <StatusCard
        label="Latest diagnostic session"
        value={
          storageError
            ? 'Storage error'
            : latest
              ? `${SESSION_TYPE_LABELS[latest.sessionType]} · ${latest.status.toLowerCase()}`
              : 'None recorded'
        }
        tone={storageError ? 'error' : latest?.status === 'INTERRUPTED' ? 'warning' : 'unknown'}
        detail={
          storageError ??
          (latest
            ? `${latest.deviceName ?? 'Unnamed device'} · ${latest.eventCount} events · ${latest.startedAt}`
            : undefined)
        }
      />
      <StatusCard label="Cloud sync" {...sync} />
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
