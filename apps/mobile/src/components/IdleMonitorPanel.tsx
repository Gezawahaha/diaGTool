import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing } from '../app/theme';
import { getBLEManager } from '../bluetooth/BLEManager';
import {
  MISSES_BEFORE_NOT_OBSERVED,
  MONITOR_PERIOD_MS,
  MONITOR_SCAN_SECONDS,
  type IdleMonitorStatus,
} from '../bluetooth/IdleMonitor';
import { Button, Chip, textStyles } from './ui';

function useMonitorStatus(): IdleMonitorStatus {
  const monitor = getBLEManager().idleMonitor;
  const [status, setStatus] = useState(monitor.getStatus());
  useEffect(() => monitor.subscribe(setStatus), [monitor]);
  return status;
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString() : '—';
}

/** Start/stop the automatic presence checks for the session's device. */
export function IdleMonitorPanel({ bleDeviceId }: { bleDeviceId: string }) {
  const monitor = getBLEManager().idleMonitor;
  const status = useMonitorStatus();
  const runningHere = status.running && status.deviceId === bleDeviceId;

  if (!runningHere) {
    return (
      <View style={styles.gap}>
        <Button
          title="Start idle monitor"
          variant="secondary"
          onPress={() => monitor.start(bleDeviceId)}
        />
        <Text style={textStyles.muted}>
          Checks every {MONITOR_PERIOD_MS / 1000} s whether this device is observable ({MONITOR_SCAN_SECONDS} s
          scan, or an RSSI read while connected) and logs when advertising stops or resumes being
          observed. Keeps the screen on; leave the app open.
        </Text>
      </View>
    );
  }

  const tone = status.observed === null ? 'unknown' : status.observed ? 'normal' : 'warning';
  const label =
    status.observed === null ? 'checking…' : status.observed ? 'observed' : 'not observed';
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Text style={textStyles.body}>Idle monitor</Text>
        <Chip label={label} tone={tone} />
      </View>
      <Text style={textStyles.muted}>
        Last observed {clock(status.lastObservedAt)}
        {status.lastRssi !== null ? ` · ${status.lastRssi} dBm` : ''} · {status.checks} checks
      </Text>
      {status.notObservedSince !== null && (
        <Text style={textStyles.muted}>
          Not observed in {MISSES_BEFORE_NOT_OBSERVED}+ consecutive scans since{' '}
          {clock(status.notObservedSince)}. This is an observation, not a confirmed sleep state.
        </Text>
      )}
      {status.lastError && <Text style={textStyles.error}>{status.lastError}</Text>}
      <Button title="Stop idle monitor" variant="secondary" onPress={() => monitor.stop()} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
