import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../components/ui';
import { colors, errorMessage } from '../theme';
import {
  cancelGaitVerification,
  ENROLLMENT_SECONDS_PER_SESSION,
  ENROLLMENT_SESSION_COUNT,
  startGaitEnrollment,
  stopGaitEnrollment,
  type GaitEnrollmentSession,
} from '../services/gaitVerification';
import { fitRuntimeGaitProfile, type ActiveGaitProfile } from '../services/gaitProfile';
import { clearRuntimeGaitProfile, getActiveGaitProfile, saveRuntimeGaitProfile } from '../services/gaitProfileStorage';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function RecordingKeepAwake() {
  useKeepAwake('gait-enrollment');
  return null;
}

export default function GaitEnrollment() {
  const [activeProfile, setActiveProfile] = useState<ActiveGaitProfile | null>(null);
  const [sessions, setSessions] = useState<GaitEnrollmentSession[]>([]);
  const [lastSession, setLastSession] = useState<GaitEnrollmentSession | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try { setActiveProfile(await getActiveGaitProfile()); }
    catch (cause) { setError(errorMessage(cause)); }
  }, []);
  useFocusEffect(useCallback(() => { void refreshProfile(); }, [refreshProfile]));
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => () => cancelGaitVerification(), []);

  async function start() {
    setError(null); setLastSession(null); setSaved(false); setSeconds(0);
    try { await startGaitEnrollment(); setRecording(true); }
    catch (cause) { setError(errorMessage(cause)); }
  }

  async function stop() {
    setError(null);
    try {
      const result = await stopGaitEnrollment();
      setLastSession(result);
      if (result.accepted) setSessions((current) => [...current, result].slice(0, ENROLLMENT_SESSION_COUNT));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setRecording(false); }
  }

  function cancel() {
    cancelGaitVerification();
    setRecording(false); setSeconds(0); setError(null);
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const embeddings = sessions.flatMap((session) => session.walkingEmbeddings);
      await saveRuntimeGaitProfile(fitRuntimeGaitProfile(embeddings, sessions.length));
      setSaved(true); setSessions([]); setLastSession(null); setConfirmClear(false);
      await refreshProfile();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  async function clear() {
    setSaving(true); setError(null);
    try {
      await clearRuntimeGaitProfile();
      setConfirmClear(false); setSaved(false); setSessions([]); setLastSession(null);
      await refreshProfile();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }

  const completed = sessions.length;
  const readyToSave = completed === ENROLLMENT_SESSION_COUNT;
  const currentWalk = Math.min(completed + 1, ENROLLMENT_SESSION_COUNT);
  return <Screen>
    {recording && <RecordingKeepAwake />}
    <PageHeader back eyebrow="Optional setup" title="Calibrate your gait" subtitle="Create a personal owner profile with two separate four-minute walks." />
    <ErrorNotice message={error} onDismiss={() => setError(null)} />
    <Surface dark style={{ gap: 14, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Icon name={recording ? 'radio-outline' : readyToSave ? 'checkmark-circle-outline' : 'walk-outline'} color={colors.lime} size={38} />
        <Badge label={`${completed} of ${ENROLLMENT_SESSION_COUNT} accepted`} tone="green" />
      </View>
      <AppText color={colors.cream} variant="title" style={{ fontSize: 30 }}>
        {recording ? formatTime(seconds) : readyToSave ? 'Ready to create' : `Walk ${currentWalk} of ${ENROLLMENT_SESSION_COUNT}`}
      </AppText>
      <AppText color="#D2DDCE">
        {recording
          ? 'Keep walking naturally with the phone in the same pocket. Keep this screen open.'
          : readyToSave
            ? 'Both walks passed the activity and sensor-quality checks. Save them as this phone\'s personal profile.'
            : `Walk continuously for ${ENROLLMENT_SECONDS_PER_SESSION / 60} minutes. For the second walk, vary the route or pace slightly but use the same pocket.`}
      </AppText>
      {recording && <View style={{ gap: 7 }}>
        <View style={{ height: 7, borderRadius: 5, backgroundColor: '#54705C', overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, seconds / ENROLLMENT_SECONDS_PER_SESSION * 100)}%`, height: '100%', backgroundColor: colors.lime }} />
        </View>
        <AppText variant="caption" color="#D2DDCE">Stop and analyze unlocks at {formatTime(ENROLLMENT_SECONDS_PER_SESSION)}.</AppText>
      </View>}
    </Surface>

    {!recording && !readyToSave && <Button label={`Start calibration walk ${currentWalk}`} icon="play-outline" onPress={() => void start()} />}
    {recording && <View style={{ gap: 8 }}>
      <Button label="Stop and analyze" icon="stop-outline" disabled={seconds < ENROLLMENT_SECONDS_PER_SESSION} onPress={() => void stop()} />
      <Button label="Cancel this walk" variant="ghost" onPress={cancel} />
    </View>}
    {readyToSave && <Button label="Use my personal gait profile" icon="checkmark" loading={saving} onPress={() => void save()} />}

    {lastSession && <Surface style={{ marginTop: 18, gap: 9 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <AppText style={{ fontWeight: '600' }}>Last calibration walk</AppText>
        <Badge label={lastSession.accepted ? 'Accepted' : 'Try again'} tone={lastSession.accepted ? 'green' : 'peach'} />
      </View>
      <AppText variant="caption" color={colors.muted}>{lastSession.reason}</AppText>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={`${lastSession.steps} steps`} tone="neutral" />
        <Badge label={`${Math.round(lastSession.sampleRateHz)} Hz`} tone="neutral" />
        <Badge label={`${Math.round(lastSession.walkWindowFraction * 100)}% walking`} tone="neutral" />
      </View>
    </Surface>}

    {saved && <Surface style={{ marginTop: 18, gap: 7 }}>
      <AppText style={{ fontWeight: '600' }}>Personal gait profile saved</AppText>
      <AppText variant="caption" color={colors.muted}>Future walking checks will use it automatically. Nothing was uploaded.</AppText>
      <Button label="Done" variant="secondary" onPress={() => router.back()} />
    </Surface>}

    <Surface style={{ marginTop: 18, gap: 9 }}>
      <AppText variant="label" color={colors.muted}>ACTIVE PROFILE</AppText>
      <AppText style={{ fontWeight: '600' }}>{activeProfile?.source === 'runtime' ? 'Personal calibration' : 'Bundled owner profile'}</AppText>
      <AppText variant="caption" color={colors.muted}>
        {activeProfile?.source === 'runtime'
          ? `Created from ${activeProfile.sessionCount} walks and ${activeProfile.windowCount} walking windows. It stays only on this phone.`
          : 'Calibration is optional. Until you complete it, walking checks continue using the model\'s bundled profile.'}
      </AppText>
      {activeProfile?.source === 'runtime' && !confirmClear && <Button label="Restore bundled profile" variant="ghost" disabled={recording || saving} onPress={() => setConfirmClear(true)} />}
      {activeProfile?.source === 'runtime' && confirmClear && <View style={{ gap: 8 }}>
        <AppText variant="caption" color={colors.muted}>Remove the personal profile from this phone?</AppText>
        <Button label="Remove personal profile" variant="secondary" loading={saving} onPress={() => void clear()} />
        <Button label="Keep personal profile" variant="ghost" disabled={saving} onPress={() => setConfirmClear(false)} />
      </View>}
    </Surface>
  </Screen>;
}
