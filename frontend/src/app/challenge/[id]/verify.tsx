import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../../../components/ui';
import { colors, errorMessage } from '../../../theme';
import { useDemo } from '../../../state/DemoProvider';
import { cancelGaitVerification, type GaitVerification, startGaitVerification, stopGaitVerification } from '../../../services/gaitVerification';
import { getActiveGaitProfile } from '../../../services/gaitProfileStorage';

export default function VerifyWalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challengeById, dispatch, busy } = useDemo();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GaitVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileSource, setProfileSource] = useState<'bundled' | 'runtime'>('bundled');
  const challenge = challengeById(id);

  useFocusEffect(useCallback(() => {
    void getActiveGaitProfile().then((activeProfile) => setProfileSource(activeProfile.source)).catch(() => {});
  }, []));
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => () => cancelGaitVerification(), []);

  async function start() {
    setError(null); setResult(null); setSeconds(0);
    try { await startGaitVerification(); setRecording(true); } catch (cause) { setError(errorMessage(cause)); }
  }
  async function stop() {
    try { setResult(await stopGaitVerification()); } catch (cause) { setError(errorMessage(cause)); }
    finally { setRecording(false); }
  }
  async function saveVerifiedWalk() {
    if (!result?.verified) return;
    setError(null);
    try {
      // The server owns challenge progress; this action is available only after on-device verification.
      await dispatch({ type: 'addRun', id });
      router.back();
    } catch (cause) { setError(errorMessage(cause)); }
  }

  if (!challenge) return <Screen><PageHeader title="Challenge not found" back /><AppText>Return to your challenges and try again.</AppText></Screen>;
  return <Screen>
    <PageHeader back eyebrow="On-device gait check" title="Verify a walk" subtitle="The walking model and active owner profile must agree." action={<Badge label={profileSource === 'runtime' ? 'Personal profile' : 'Bundled profile'} tone={profileSource === 'runtime' ? 'green' : 'neutral'} />} />
    <ErrorNotice message={error} onDismiss={() => setError(null)} />
    <Surface dark style={{ gap: 14, marginBottom: 20 }}>
      <Icon name={recording ? 'radio-outline' : result?.verified ? 'checkmark-circle-outline' : 'walk-outline'} color={colors.lime} size={37} />
      <AppText color={colors.cream} variant="title" style={{ fontSize: 30 }}>{recording ? `${seconds}s walking check` : result?.verified ? 'Walk verified' : 'Ready when you are'}</AppText>
      <AppText color="#D2DDCE">{recording ? 'Keep the phone in your pocket, walk naturally for at least 15 seconds, and keep the app open.' : result?.reason ?? 'Walk naturally for at least 15 seconds. Scoring stays on this phone.'}</AppText>
      {result && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={`${result.steps} steps`} tone="green" />
        <Badge label={`${Math.round(result.sampleRateHz)} Hz`} tone="green" />
        <Badge label={`${result.modelWindowCount} model windows`} tone="green" />
        <Badge label={`${Math.round(result.modelIdentityWindowFraction * 100)}% profile match`} tone="green" />
        <Badge label={result.profileSource === 'runtime' ? 'Personal profile' : 'Bundled profile'} tone="neutral" />
      </View>}
    </Surface>
    {!recording && !result && <Button label="Start walking check" icon="play-outline" onPress={() => void start()} />}
    {recording && <Button label="Stop and check" icon="stop-outline" onPress={() => void stop()} />}
    {result && <View style={{ gap: 10 }}>
      {result.verified ? <Button label="Record verified challenge run" icon="checkmark" loading={busy} onPress={() => void saveVerifiedWalk()} /> : <Button label="Try another walk" icon="refresh-outline" onPress={() => void start()} />}
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>}
    <Surface style={{ marginTop: 22, gap: 8 }}>
      <AppText variant="label" color={colors.muted}>WHAT THIS CHECKS</AppText>
      <Button label={profileSource === 'runtime' ? 'Manage gait calibration' : 'Calibrate my gait (optional)'} variant="secondary" icon="person-outline" disabled={recording} onPress={() => router.push('/gait-enrollment' as Href)} />
      <AppText variant="caption" color={colors.muted}>Runs a 25K-parameter gait model entirely on this phone. It checks walking activity and the active owner signature without location or network access. It is anti-cheat support—not medical identification.</AppText>
    </Surface>
  </Screen>;
}
