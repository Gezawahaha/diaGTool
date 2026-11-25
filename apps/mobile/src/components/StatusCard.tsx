import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type StatusTone } from '../app/theme';

interface Props {
  label: string;
  value: string;
  tone: StatusTone;
  detail?: string;
}

export function StatusCard({ label, value, tone, detail }: Props) {
  return (
    <View style={styles.card} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: colors[tone] }]} />
        <Text style={styles.value}>{value}</Text>
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  value: { color: colors.textPrimary, fontSize: 17, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: 13 },
});
