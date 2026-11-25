import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type StatusTone } from '../app/theme';

export function Button({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'destructive' && styles.buttonDestructive,
        (pressed || inactive) && styles.buttonDimmed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, missing && styles.fieldMissing]} selectable>
        {missing ? 'Not Available' : value}
      </Text>
    </View>
  );
}

export function Chip({ label, tone = 'unknown' }: { label: string; tone?: StatusTone }) {
  return (
    <View style={[styles.chip, { borderColor: colors[tone] }]}>
      <Text style={[styles.chipText, { color: colors[tone] }]}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone,
  message,
  children,
}: {
  tone: StatusTone;
  message: string;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.banner, { borderColor: colors[tone] }]}>
      <Text style={styles.bannerText}>{message}</Text>
      {children}
    </View>
  );
}

export const textStyles = StyleSheet.create({
  muted: { color: colors.textSecondary, fontSize: 13 },
  body: { color: colors.textPrimary, fontSize: 15 },
  mono: { color: colors.textPrimary, fontSize: 13, fontFamily: 'monospace' },
  error: { color: colors.error, fontSize: 13 },
});

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBorder,
  },
  buttonPrimary: { backgroundColor: '#0A84FF' },
  buttonDestructive: { backgroundColor: '#3A1D1B' },
  buttonDimmed: { opacity: 0.5 },
  buttonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  section: { gap: spacing.sm },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
  },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  fieldLabel: { color: colors.textSecondary, fontSize: 14 },
  fieldValue: { color: colors.textPrimary, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  fieldMissing: { color: colors.unknown },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: { fontSize: 11, fontWeight: '600' },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  bannerText: { color: colors.textPrimary, fontSize: 14 },
});
