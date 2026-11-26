import { SESSION_TYPES, type SessionType } from '@axs/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { getBLEManager } from '../bluetooth/BLEManager';
import type { UserMarker } from '../diagnostics/SessionRecorder';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useSessionStore } from '../state/sessionStore';
import { IdleMonitorPanel } from './IdleMonitorPanel';
import { Button, textStyles } from './ui';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  GENERAL: 'General',
  INITIAL_POWER: 'Initial power',
  IDLE_MONITOR: 'Idle monitoring',
  MANUAL_WAKE: 'Manual wake',
};

const MARKER_LABELS: Record<UserMarker, string> = {
  MANUAL_WAKE_MARKER: 'AXS button press',
  USER_REPORTED_UNRESPONSIVE: 'Unresponsive',
  SHIFTER_PRESSED_MARKER: 'Shifter press',
};

function useElapsed(since: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  if (!since) {
    return '';
  }
  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Start/stop a diagnostic session and add user markers. With `device` set,
 * offers to start a session for it; without, only controls an active one.
 */
export function SessionPanel({
  device,
}: {
  device?: { bleDeviceId: string; advertisedName: string | null };
}) {
  const { services, storageError, active, pendingWrites, writeError } = useSessionStore();
  const [sessionType, setSessionType] = useState<SessionType>('GENERAL');
  const [note, setNote] = useState('');
  const [lastMarker, setLastMarker] = useState<string | null>(null);
  const elapsed = useElapsed(active?.session.startedAt);

  const start = useAsyncAction(async () => {
    if (!services || !device) {
      throw new Error('Local storage is not ready.');
    }
    await services.recorder.start({ ...device, sessionType });
  });
  const stop = useAsyncAction(async () => {
    // Its events would no longer be recorded once the session ends.
    getBLEManager().idleMonitor.stop();
    const ended = await services?.recorder.stop();
    const bleId = active?.device.bleIdentifier;
    // Ended away from the device screen: nothing else holds the connection.
    if (ended && !device && bleId) {
      await getBLEManager().disconnect(bleId);
    }
  });
  const mark = useAsyncAction(async (type: UserMarker) => {
    const event = services?.recorder.addMarker(type, note);
    if (event) {
      setLastMarker(`${MARKER_LABELS[type]} at ${event.observedAt}`);
      setNote('');
    }
  });

  if (storageError) {
    return (
      <Text style={textStyles.error}>
        Local storage unavailable: {storageError}. Events are not being saved.
      </Text>
    );
  }
  if (!services) {
    return <Text style={textStyles.muted}>Opening local storage…</Text>;
  }

  const activeHere = active && (!device || active.device.bleIdentifier === device.bleDeviceId);

  if (active && !activeHere) {
    const name = active.device.displayName ?? active.device.bleIdentifier;
    return (
      <Text style={textStyles.muted}>
        A session is active for {name}. End it before starting another.
      </Text>
    );
  }

  if (!active) {
    if (!device) {
      return <Text style={textStyles.muted}>No active session.</Text>;
    }
    return (
      <View style={styles.gap}>
        <Text style={textStyles.muted}>Test scenario</Text>
        <View style={styles.types}>
          {SESSION_TYPES.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ selected: t === sessionType }}
              onPress={() => setSessionType(t)}
              style={[styles.type, t === sessionType && styles.typeSelected]}
            >
              <Text style={styles.typeText}>{SESSION_TYPE_LABELS[t]}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Start session" onPress={start.run} busy={start.busy} />
        <Text style={textStyles.muted}>
          Saves this device to the local inventory. Only this device's events are recorded.
        </Text>
        {start.error && <Text style={textStyles.error}>{start.error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <Text style={textStyles.body}>
        {SESSION_TYPE_LABELS[active.session.sessionType]} · {elapsed}
      </Text>
      {!device && (
        <Text style={textStyles.muted}>
          {active.device.displayName ?? active.device.bleIdentifier}
        </Text>
      )}
      <TextInput
        style={styles.note}
        placeholder="Optional note for the next marker"
        placeholderTextColor={colors.textSecondary}
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="I pressed AXS button" onPress={() => mark.run('MANUAL_WAKE_MARKER')} />
        </View>
        <View style={styles.flex}>
          <Button
            title="Device unresponsive"
            variant="secondary"
            onPress={() => mark.run('USER_REPORTED_UNRESPONSIVE')}
          />
        </View>
      </View>
      <Button
        title="I pressed the shifter"
        variant="secondary"
        onPress={() => mark.run('SHIFTER_PRESSED_MARKER')}
      />
      {lastMarker && <Text style={textStyles.muted}>Marked: {lastMarker}</Text>}
      {active.device.bleIdentifier && <IdleMonitorPanel bleDeviceId={active.device.bleIdentifier} />}
      <Button title="End session" variant="destructive" onPress={stop.run} busy={stop.busy} />
      <Text style={textStyles.muted}>
        {pendingWrites > 0 ? `${pendingWrites} events waiting to be saved.` : 'All events saved locally.'}
      </Text>
      {writeError && <Text style={textStyles.error}>Save failed, retrying: {writeError}</Text>}
      {(mark.error || stop.error) && (
        <Text style={textStyles.error}>{mark.error ?? stop.error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  type: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  typeSelected: { borderColor: '#0A84FF', backgroundColor: '#0A84FF33' },
  typeText: { color: colors.textPrimary, fontSize: 14 },
  note: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.textPrimary,
  },
});
