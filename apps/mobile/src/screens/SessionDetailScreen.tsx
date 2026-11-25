import { EVENT_TYPES, type EventType } from '@axs/shared';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { APP_VERSION } from '../app/version';
import { SESSION_TYPE_LABELS } from '../components/SessionPanel';
import { Button, Chip, Field, Section, textStyles } from '../components/ui';
import {
  MAX_SHARE_BYTES,
  sessionToCsv,
  sessionToJson,
  utf8Length,
} from '../diagnostics/exportSession';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { ScreenProps } from '../navigation/types';
import { useSessionStore } from '../state/sessionStore';
import type { DeviceRecord, EventRecord, SessionRecord } from '../storage/repositories';
import { formatHex } from '../utils/bytes';
import { STATUS_TONE } from './SessionsScreen';

const PAGE_SIZE = 100;

export function SessionDetailScreen({ route }: ScreenProps<'SessionDetail'>) {
  const { sessionId } = route.params;
  const services = useSessionStore((s) => s.services);
  const revision = useSessionStore((s) => s.revision);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<EventType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!services) {
      return;
    }
    let cancelled = false;
    (async () => {
      const s = await services.sessions.getById(sessionId);
      const d = s ? await services.devices.getById(s.deviceId) : null;
      const first = await services.events.listBySession(sessionId, {
        eventTypes: filter,
        limit: PAGE_SIZE,
      });
      if (!cancelled) {
        setSession(s);
        setDevice(d);
        setEvents(first);
        setHasMore(first.length === PAGE_SIZE);
      }
    })().catch((err) => !cancelled && setLoadError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [services, sessionId, filter, revision]);

  const loadMore = useCallback(async () => {
    const last = events.at(-1);
    if (!services || !last || !hasMore) {
      return;
    }
    const page = await services.events.listBySession(sessionId, {
      eventTypes: filter,
      limit: PAGE_SIZE,
      after: { observedAt: last.observedAt, seq: last.seq },
    });
    setEvents((prev) => [...prev, ...page]);
    setHasMore(page.length === PAGE_SIZE);
  }, [services, sessionId, filter, events, hasMore]);

  const share = useAsyncAction(async (format: 'json' | 'csv') => {
    if (!services || !session || !device) {
      return;
    }
    await services.recorder.flush();
    const data = {
      session,
      device,
      events: await services.events.allForSession(sessionId),
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
    };
    const text = format === 'json' ? sessionToJson(data) : sessionToCsv(data);
    const size = utf8Length(text);
    if (size > MAX_SHARE_BYTES) {
      throw new Error(
        `Export is ${Math.round(size / 1024)} KB, above the ${MAX_SHARE_BYTES / 1024} KB share limit. File export is planned; until then, use CSV (smaller) or a shorter session.`,
      );
    }
    await Share.share({
      title: `AXS session ${session.startedAt} (${format.toUpperCase()})`,
      message: text,
    });
  });

  const toggleType = (t: EventType) =>
    setFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  if (loadError) {
    return <Text style={[textStyles.error, styles.pad]}>{loadError}</Text>;
  }
  if (!session) {
    return <Text style={[textStyles.muted, styles.pad]}>Loading…</Text>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={events}
      keyExtractor={(e) => e.id}
      onEndReached={() => {
        loadMore().catch(() => undefined);
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          <Section title="Session">
            <View style={styles.statusRow}>
              <Chip label={session.status.toLowerCase()} tone={STATUS_TONE[session.status]} />
            </View>
            <Field label="Scenario" value={SESSION_TYPE_LABELS[session.sessionType]} />
            <Field label="Device" value={device?.displayName ?? device?.bleIdentifier} />
            <Field label="Role" value={device?.deviceRole} />
            <Field label="Started" value={session.startedAt} />
            <Field
              label="Ended"
              value={
                session.status === 'INTERRUPTED' ? 'Unknown (app stopped)' : session.endedAt
              }
            />
            <Field label="App version" value={session.appVersion} />
          </Section>
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button title="Export JSON" variant="secondary" onPress={() => share.run('json')} busy={share.busy} />
            </View>
            <View style={styles.flex}>
              <Button title="Export CSV" variant="secondary" onPress={() => share.run('csv')} busy={share.busy} />
            </View>
          </View>
          {share.error && <Text style={textStyles.error}>{share.error}</Text>}
          <Text style={textStyles.muted}>Filter by event type</Text>
          <View style={styles.filters}>
            {EVENT_TYPES.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: filter.includes(t) }}
                onPress={() => toggleType(t)}
              >
                <Chip label={t} tone={filter.includes(t) ? 'normal' : 'unknown'} />
              </Pressable>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={textStyles.muted}>
          {filter.length ? 'No events of the selected types.' : 'No events recorded.'}
        </Text>
      }
      renderItem={({ item }) => <EventRow event={item} />}
    />
  );
}

function EventRow({ event: e }: { event: EventRecord }) {
  return (
    <View style={styles.event}>
      <Text style={styles.eventType}>
        {e.eventType}
        {e.source === 'USER_MARKER' ? ' · user marker' : ''}
      </Text>
      <Text style={textStyles.muted}>{e.observedAt}</Text>
      {e.description ? <Text style={textStyles.body}>{e.description}</Text> : null}
      {e.rssi !== null && <Text style={textStyles.muted}>RSSI {e.rssi} dBm</Text>}
      {e.characteristicUuid && (
        <Text style={textStyles.mono} selectable>
          {e.characteristicUuid}
        </Text>
      )}
      {e.rawPayloadHex ? (
        <Text style={textStyles.mono} selectable>
          {formatHex(e.rawPayloadHex)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  pad: { padding: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  event: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: spacing.md,
    gap: 2,
  },
  eventType: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
