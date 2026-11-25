import { useFocusEffect } from '@react-navigation/native';
import type { SessionStatus } from '@axs/shared';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type StatusTone } from '../app/theme';
import { SESSION_TYPE_LABELS } from '../components/SessionPanel';
import { Chip, textStyles } from '../components/ui';
import type { ScreenProps } from '../navigation/types';
import { useSessionStore } from '../state/sessionStore';
import type { SessionSummary } from '../storage/repositories';

export const STATUS_TONE: Record<SessionStatus, StatusTone> = {
  ACTIVE: 'normal',
  COMPLETED: 'unknown',
  INTERRUPTED: 'warning',
};

export function SessionsScreen({ navigation }: ScreenProps<'Sessions'>) {
  const services = useSessionStore((s) => s.services);
  const revision = useSessionStore((s) => s.revision);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      services?.sessions
        .listSummaries()
        .then((rows) => !cancelled && setSessions(rows))
        .catch((err) => !cancelled && setError(String(err)));
      return () => {
        cancelled = true;
      };
      // revision: refetch when sessions are started, ended or written to.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [services, revision]),
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sessions ?? []}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <Text style={textStyles.muted}>
          Sessions are stored on this phone. Showing the latest 50.
        </Text>
      }
      ListEmptyComponent={
        <Text style={[textStyles.muted, styles.empty]}>
          {error ??
            (services
              ? sessions === null
                ? 'Loading…'
                : 'No sessions yet. Start one from a device screen.'
              : 'Opening local storage…')}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('SessionDetail', { sessionId: item.id })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowHeader}>
            <Text style={textStyles.body}>{SESSION_TYPE_LABELS[item.sessionType]}</Text>
            <Chip label={item.status.toLowerCase()} tone={STATUS_TONE[item.status]} />
          </View>
          <Text style={textStyles.muted}>{item.deviceName ?? 'Unnamed device'}</Text>
          <Text style={textStyles.muted}>
            {item.startedAt} · {item.eventCount} event{item.eventCount === 1 ? '' : 's'}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.lg },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.md, gap: 2 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
