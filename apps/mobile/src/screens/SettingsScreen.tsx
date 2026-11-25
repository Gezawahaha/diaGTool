import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../app/theme';
import { Button, Field, Section, textStyles } from '../components/ui';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useSessionStore } from '../state/sessionStore';
import { reloadSettings, useSyncStore } from '../state/syncStore';
import { normaliseApiBaseUrl } from '../storage/SettingsRepository';
import type { SyncState } from '../sync/SyncManager';

export const SYNC_STATE_LABELS: Record<SyncState, string> = {
  disabled: 'Off',
  not_configured: 'No server configured',
  signed_out: 'Signed out',
  idle: 'Up to date',
  syncing: 'Syncing…',
  backing_off: 'Waiting to retry',
  quota_exceeded: 'Cloud quota reached',
  error: 'Needs attention',
};

function deviceLabel(): string {
  const model = (Platform.constants as { Model?: string }).Model;
  return [model, `Android ${Platform.Version}`].filter(Boolean).join(' · ');
}

export function SettingsScreen() {
  const services = useSessionStore((s) => s.services);
  const { settings, signedIn, status } = useSyncStore();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setUrl(settings?.apiBaseUrl ?? '');
    setEmail((e) => e || settings?.accountEmail || '');
  }, [settings?.apiBaseUrl, settings?.accountEmail]);

  const saveUrl = useAsyncAction(async () => {
    if (!services) {
      return;
    }
    const normalised = url.trim() ? normaliseApiBaseUrl(url) : null;
    if (normalised !== settings?.apiBaseUrl && signedIn) {
      // A sign-in belongs to one server.
      await services.auth.logout();
    }
    await services.settings.update({ apiBaseUrl: normalised });
    await reloadSettings(services);
  });
  const toggleSync = useAsyncAction(async (enabled: boolean) => {
    if (!services) {
      return;
    }
    await services.settings.update({ syncEnabled: enabled });
    await reloadSettings(services);
    if (enabled) {
      services.sync.sync({ force: true }).catch(() => undefined);
    }
  });
  const signIn = useAsyncAction(async () => {
    if (!services) {
      return;
    }
    const trimmed = email.trim().toLowerCase();
    await services.auth.login(trimmed, password, deviceLabel());
    setPassword('');
    await services.settings.update({ accountEmail: trimmed });
    await reloadSettings(services);
    services.sync.sync({ force: true }).catch(() => undefined);
  });
  const signOut = useAsyncAction(async () => {
    await services?.auth.logout();
  });
  const syncNow = useAsyncAction(async () => {
    await services?.sync.sync({ force: true });
  });
  const retryRejected = useAsyncAction(async () => {
    await services?.outbox.retryRejected();
    await services?.sync.sync({ force: true });
  });

  if (!services || !settings) {
    return <Text style={[textStyles.muted, styles.pad]}>Opening local storage…</Text>;
  }
  const pending = status?.pending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Cloud sync">
        <View style={styles.switchRow}>
          <Text style={[textStyles.body, styles.flex]}>Upload diagnostic data</Text>
          <Switch
            value={settings.syncEnabled}
            onValueChange={(v) => toggleSync.run(v)}
            disabled={toggleSync.busy}
          />
        </View>
        <Text style={textStyles.muted}>
          Off by default. When on, saved devices, diagnostic sessions and their events — including
          BLE identifiers, advertised names and raw payload bytes — are uploaded to your own
          Cloudflare server. No location, contacts or other phone data is collected. Local records
          are never deleted because of syncing. Diagnostics work fully without it.
        </Text>
        {toggleSync.error && <Text style={textStyles.error}>{toggleSync.error}</Text>}
      </Section>

      <Section title="Server">
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-worker.workers.dev"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button title="Save server" variant="secondary" onPress={saveUrl.run} busy={saveUrl.busy} />
        {saveUrl.error && <Text style={textStyles.error}>{saveUrl.error}</Text>}
      </Section>

      <Section title="Account">
        {signedIn ? (
          <>
            <Field label="Signed in as" value={settings.accountEmail} />
            <Button title="Sign out" variant="destructive" onPress={signOut.run} busy={signOut.busy} />
            <Text style={textStyles.muted}>
              Signing out removes the sign-in from this phone. Local data is kept.
            </Text>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoComplete="password"
            />
            <Button
              title="Sign in"
              onPress={signIn.run}
              busy={signIn.busy}
              disabled={!settings.apiBaseUrl || !email.trim() || !password}
            />
            {!settings.apiBaseUrl && (
              <Text style={textStyles.muted}>Save a server address first.</Text>
            )}
            <Text style={textStyles.muted}>
              The owner account is created on the server with the create-owner script; there is
              no sign-up in the app.
            </Text>
          </>
        )}
        {(signIn.error || signOut.error) && (
          <Text style={textStyles.error}>{signIn.error ?? signOut.error}</Text>
        )}
      </Section>

      <Section title="Sync status">
        <Field label="State" value={status ? SYNC_STATE_LABELS[status.state] : null} />
        <Field
          label="Pending"
          value={
            pending
              ? `${pending.events} events · ${pending.sessions} sessions · ${pending.devices} devices`
              : null
          }
        />
        <Field label="Rejected" value={pending ? String(pending.rejected) : null} />
        <Field label="Last sync" value={status?.lastSyncAt ?? 'Never'} />
        {status?.nextRetryAt && <Field label="Next retry" value={status.nextRetryAt} />}
        {status?.lastError && <Text style={textStyles.error}>{status.lastError}</Text>}
        <Button
          title="Sync now"
          onPress={syncNow.run}
          busy={syncNow.busy || status?.state === 'syncing'}
          disabled={!settings.syncEnabled || !signedIn}
        />
        {pending && pending.rejected > 0 && (
          <Button title="Retry rejected records" variant="secondary" onPress={retryRejected.run} busy={retryRejected.busy} />
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.lg },
  pad: { padding: spacing.md },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.textPrimary,
  },
});
