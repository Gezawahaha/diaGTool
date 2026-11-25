import { DEVICE_ROLES, type DeviceRole } from '@axs/shared';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type StatusTone } from '../app/theme';
import { getBLEManager } from '../bluetooth/BLEManager';
import type { ConnectionState, GattCharacteristic } from '../bluetooth/types';
import { SessionPanel } from '../components/SessionPanel';
import { Button, Chip, Field, Section, textStyles } from '../components/ui';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { ScreenProps } from '../navigation/types';
import { useBleStore } from '../state/bleStore';
import { useSessionStore } from '../state/sessionStore';
import type { DeviceRecord } from '../storage/repositories';
import { formatHex } from '../utils/bytes';

const CONNECTION_TONE: Record<ConnectionState, StatusTone> = {
  connected: 'normal',
  connecting: 'warning',
  disconnecting: 'warning',
  disconnected: 'unknown',
};

const TIMELINE_LIMIT = 50;

const ROLE_LABELS: Record<DeviceRole, string> = {
  UNASSIGNED: 'Unassigned',
  FAULTY: 'FD A · faulty',
  REFERENCE: 'FD B · reference',
};

/** The inventory record for a BLE device, refetched when sessions change. */
function useSavedDevice(bleDeviceId: string) {
  const services = useSessionStore((s) => s.services);
  const revision = useSessionStore((s) => s.revision);
  const [saved, setSaved] = useState<DeviceRecord | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    services?.devices
      .findByBleIdentifier(bleDeviceId)
      .then((d) => !cancelled && setSaved(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [services, bleDeviceId, revision, reload]);
  return { saved, refresh: () => setReload((n) => n + 1) };
}

export function DeviceDetailScreen({ route, navigation }: ScreenProps<'DeviceDetail'>) {
  const { deviceId } = route.params;
  const manager = getBLEManager();
  const device = useBleStore((s) => s.knownDevices[deviceId]);
  const connectionState = useBleStore((s) => s.connectionStates[deviceId] ?? 'disconnected');
  const allEvents = useBleStore((s) => s.events);
  useBleStore((s) => s.gattRevision); // re-render on GATT changes
  const profile = manager.gatt.getProfile(deviceId);

  const events = useMemo(
    () =>
      allEvents
        .filter((e) => e.bleDeviceId === deviceId)
        .slice(-TIMELINE_LIMIT)
        .reverse(),
    [allEvents, deviceId],
  );

  useEffect(() => {
    navigation.setOptions({ title: device?.name ?? 'Unnamed device' });
  }, [navigation, device?.name]);

  const { saved, refresh: refreshSaved } = useSavedDevice(deviceId);
  const services = useSessionStore((s) => s.services);

  // Leaving the screen releases the device: an idle connection held by this
  // app could interfere with the official SRAM AXS app. During this device's
  // own session the connection is the thing being observed, so it stays.
  useEffect(
    () => () => {
      const active = useSessionStore.getState().active;
      if (active?.device.bleIdentifier !== deviceId) {
        manager.disconnect(deviceId).catch(() => undefined);
      }
    },
    [manager, deviceId],
  );

  const connect = useAsyncAction(async () => {
    await manager.scanner.stop();
    await manager.connection.connect(deviceId);
    await manager.gatt.discover(deviceId);
  });
  const disconnect = useAsyncAction(() => manager.disconnect(deviceId));
  const refresh = useAsyncAction(() => manager.gatt.discover(deviceId));
  const readRssi = useAsyncAction(() => manager.connection.readRssi(deviceId));
  const setRole = useAsyncAction(async (role: DeviceRole) => {
    if (saved && services) {
      await services.devices.setRole(saved.id, role);
      refreshSaved();
    }
  });
  const exportProfile = useAsyncAction(async () => {
    if (profile) {
      await Share.share({ message: JSON.stringify(profile, null, 2) });
    }
  });

  const connected = connectionState === 'connected';
  const actionError =
    connect.error ?? disconnect.error ?? refresh.error ?? readRssi.error ?? exportProfile.error;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="Advertising (last observed)">
        {device ? (
          <>
            <Field label="Name" value={device.name} />
            <Field label="Identifier" value={device.id} />
            <Field label="RSSI" value={`${device.rssi} dBm`} />
            <Field label="Last seen" value={device.lastSeenAt} />
            <Field
              label="Connectable"
              value={device.isConnectable === null ? null : String(device.isConnectable)}
            />
            <Field label="TX power" value={device.txPowerLevel?.toString()} />
            <Field label="Service UUIDs" value={device.serviceUUIDs.join('\n')} />
            {Object.entries(device.manufacturerData).map(([company, hex]) => (
              <Field key={company} label={`Mfr data (${company})`} value={formatHex(hex)} />
            ))}
            {Object.entries(device.serviceData).map(([uuid, hex]) => (
              <Field key={uuid} label={`Svc data ${uuid}`} value={formatHex(hex)} />
            ))}
            <Text style={textStyles.muted}>
              The advertised name does not establish the SRAM model.
            </Text>
          </>
        ) : (
          <Text style={textStyles.muted}>Not observed in a scan this session.</Text>
        )}
      </Section>

      <Section title="Connection">
        <View style={styles.statusRow}>
          <Chip label={connectionState} tone={CONNECTION_TONE[connectionState]} />
        </View>
        {connected ? (
          <View style={styles.buttons}>
            <Button title="Disconnect" variant="destructive" onPress={disconnect.run} busy={disconnect.busy} />
            <Button title="Read RSSI" variant="secondary" onPress={readRssi.run} busy={readRssi.busy} />
          </View>
        ) : (
          <Button
            title={connectionState === 'connecting' ? 'Connecting…' : 'Connect'}
            onPress={connect.run}
            busy={connect.busy}
            disabled={connectionState !== 'disconnected'}
          />
        )}
        <Text style={textStyles.muted}>
          No automatic reconnect. A dropped connection is logged as observed; it does not
          by itself show the device went to sleep.
        </Text>
        {actionError && <Text style={textStyles.error}>{actionError}</Text>}
      </Section>

      <Section title="Diagnostic session">
        <SessionPanel device={{ bleDeviceId: deviceId, advertisedName: device?.name ?? null }} />
      </Section>

      {saved && (
        <Section title="Comparison role">
          <View style={styles.roles}>
            {DEVICE_ROLES.map((role) => (
              <Pressable
                key={role}
                accessibilityRole="radio"
                accessibilityState={{ selected: saved.deviceRole === role }}
                onPress={() => setRole.run(role)}
                style={[styles.role, saved.deviceRole === role && styles.roleSelected]}
              >
                <Text style={styles.roleText}>{ROLE_LABELS[role]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={textStyles.muted}>
            Used to compare a faulty unit with a known-working one. A role is a label you
            assign, not a diagnosis.
          </Text>
          {setRole.error && <Text style={textStyles.error}>{setRole.error}</Text>}
        </Section>
      )}

      <Section title="GATT profile">
        {profile ? (
          <>
            <Text style={textStyles.muted}>Discovered {profile.discoveredAt}</Text>
            <View style={styles.buttons}>
              <Button title="Refresh services" variant="secondary" onPress={refresh.run} busy={refresh.busy} disabled={!connected} />
              <Button title="Export JSON" variant="secondary" onPress={exportProfile.run} />
            </View>
            {profile.services.length === 0 && (
              <Text style={textStyles.muted}>The device reported no services.</Text>
            )}
            {profile.services.map((service) => (
              <View key={service.uuid} style={styles.service}>
                <Text style={textStyles.mono} selectable>
                  {service.uuid}
                </Text>
                {service.characteristics.map((c) => (
                  <CharacteristicRow
                    key={c.uuid}
                    deviceId={deviceId}
                    serviceUuid={service.uuid}
                    characteristic={c}
                    connected={connected}
                  />
                ))}
              </View>
            ))}
          </>
        ) : (
          <Text style={textStyles.muted}>
            {connected ? 'Discovering…' : 'Connect to discover services.'}
          </Text>
        )}
      </Section>

      <Section title={`Timeline (latest ${TIMELINE_LIMIT})`}>
        {events.length === 0 && <Text style={textStyles.muted}>No events yet.</Text>}
        {events.map((e) => (
          <View key={e.id} style={styles.event}>
            <Text style={styles.eventType}>
              {e.eventType}
              {e.source === 'USER_MARKER' ? ' · user' : ''}
            </Text>
            <Text style={textStyles.muted}>{e.observedAt}</Text>
            <Text style={textStyles.body}>{e.description}</Text>
            {e.rawPayloadHex ? (
              <Text style={textStyles.mono} selectable>
                {formatHex(e.rawPayloadHex)}
              </Text>
            ) : null}
          </View>
        ))}
        <Text style={textStyles.muted}>
          Recent in-memory events. Only events recorded during a session are saved.
        </Text>
      </Section>
    </ScrollView>
  );
}

function CharacteristicRow({
  deviceId,
  serviceUuid,
  characteristic: c,
  connected,
}: {
  deviceId: string;
  serviceUuid: string;
  characteristic: GattCharacteristic;
  connected: boolean;
}) {
  const manager = getBLEManager();
  useBleStore((s) => s.gattRevision);
  const value = manager.gatt.getValue(deviceId, serviceUuid, c.uuid);
  const subscribed = manager.gatt.isSubscribed(deviceId, serviceUuid, c.uuid);
  const canNotify = c.properties.notify || c.properties.indicate;

  const read = useAsyncAction(() => manager.gatt.read(deviceId, serviceUuid, c.uuid));
  const toggle = useAsyncAction(() =>
    subscribed
      ? manager.gatt.stopNotifications(deviceId, serviceUuid, c.uuid)
      : manager.gatt.startNotifications(deviceId, serviceUuid, c.uuid),
  );

  const p = c.properties;
  const chips = [
    p.read && 'read',
    p.notify && 'notify',
    p.indicate && 'indicate',
    p.write && 'write',
    p.writeWithoutResponse && 'write-no-rsp',
    p.broadcast && 'broadcast',
    p.authenticatedSignedWrites && 'signed-write',
    p.extendedProperties && 'ext-props',
  ].filter((x): x is string => Boolean(x));

  return (
    <View style={styles.characteristic}>
      <Text style={textStyles.mono} selectable>
        {c.uuid}
      </Text>
      <View style={styles.chips}>
        {chips.map((label) => (
          <Chip key={label} label={label} />
        ))}
      </View>
      {c.descriptorUUIDs.length > 0 && (
        <Text style={textStyles.muted}>Descriptors: {c.descriptorUUIDs.join(', ')}</Text>
      )}
      {(p.write || p.writeWithoutResponse) && (
        <Text style={textStyles.muted}>Writes are disabled in this release.</Text>
      )}
      {(p.read || canNotify) && (
        <View style={styles.buttons}>
          {p.read && (
            <Button title="Read" variant="secondary" onPress={read.run} busy={read.busy} disabled={!connected} />
          )}
          {canNotify && (
            <Button
              title={subscribed ? 'Unsubscribe' : 'Subscribe'}
              variant="secondary"
              onPress={toggle.run}
              busy={toggle.busy}
              disabled={!connected}
            />
          )}
        </View>
      )}
      {value && (
        <Text style={textStyles.mono} selectable>
          {value.via === 'read' ? 'Read' : 'Notified'} {value.observedAt}:{'\n'}
          {value.hex ? formatHex(value.hex) : '(empty)'}
        </Text>
      )}
      {(read.error || toggle.error) && (
        <Text style={textStyles.error}>{read.error ?? toggle.error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.lg },
  statusRow: { flexDirection: 'row' },
  buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  service: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: colors.cardBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  characteristic: { gap: spacing.xs, paddingLeft: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  event: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomColor: colors.cardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventType: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  role: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  roleSelected: { borderColor: '#0A84FF', backgroundColor: '#0A84FF33' },
  roleText: { color: colors.textPrimary, fontSize: 14 },
});
