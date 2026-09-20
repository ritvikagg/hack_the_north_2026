import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../../../components/ui';
import { colors, errorMessage } from '../../../theme';
import { useDemo } from '../../../state/DemoProvider';
import { cancelGaitVerification, enrollGaitBaseline, gaitBaselineSessions, type GaitVerification, startGaitVerification, stopGaitVerification } from '../../../services/gaitVerification';

export default function VerifyWalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challengeById, dispatch, busy } = useDemo();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GaitVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'enrollment' | 'verification'>('verification');
  const [baselineCount, setBaselineCount] = useState(0);
  const challenge = challengeById(id);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => () => cancelGaitVerification(), []);
  useEffect(() => { void gaitBaselineSessions().then(setBaselineCount); }, []);

  async function start(nextMode: 'enrollment' | 'verification' = 'verification') {
    setError(null); setResult(null); setSeconds(0);
    try { setMode(nextMode); await startGaitVerification(nextMode); setRecording(true); } catch (cause) { setError(errorMessage(cause)); }
  }
  async function stop() {
    try { setResult(await stopGaitVerification()); } catch (cause) { setError(errorMessage(cause)); }
    finally { setRecording(false); }
  }
  async function saveBaseline() { if (!result?.walkSignalsVerified) return; try { setBaselineCount(await enrollGaitBaseline(result)); setResult(null); } catch (cause) { setError(errorMessage(cause)); } }
  async function saveVerifiedWalk() {
    if (!result?.verified) return;
    setError(null);
    try {
      await dispatch({ type: 'recordGaitRun', id, gait: result });
      router.back();
    } catch (cause) { setError(errorMessage(cause)); }
  }

  if (!challenge) return <Screen><PageHeader title="Challenge not found" back /><AppText>Return to your challenges and try again.</AppText></Screen>;
  return <Screen>
    <PageHeader back eyebrow="Gait mechanics check" title="Verify a walk" subtitle="Gait mechanics and your enrolled baseline must agree." />
    <ErrorNotice message={error} onDismiss={() => setError(null)} />
    <Surface dark style={{ gap: 14, marginBottom: 20 }}>
      <Icon name={recording ? 'radio-outline' : result?.verified ? 'checkmark-circle-outline' : 'walk-outline'} color={colors.lime} size={37} />
      <AppText color={colors.cream} variant="title" style={{ fontSize: 30 }}>{recording ? `${seconds}s walking check` : result?.verified ? 'Walk verified' : 'Ready when you are'}</AppText>
      <AppText color="#D2DDCE">{recording ? 'Keep the phone in your pocket, walk naturally, and keep the app open.' : result?.reason ?? (baselineCount < 2 ? `Enroll ${2 - baselineCount} more real walk${2 - baselineCount === 1 ? '' : 's'} first.` : 'Walk naturally for at least 15 seconds.')}</AppText>
      {result && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={`${result.steps} steps`} tone="green" />
        <Badge label={`${Math.round(result.sampleRateHz)} Hz`} tone="green" />
        <Badge label={`${Math.round(result.cadenceSpm)} steps/min`} tone="green" />
      </View>}
    </Surface>
    {!recording && !result && <Button label={baselineCount < 2 ? 'Enroll a baseline walk' : 'Start walking check'} icon="play-outline" onPress={() => void start(baselineCount < 2 ? 'enrollment' : 'verification')} />}
    {recording && <Button label="Stop and check" icon="stop-outline" onPress={() => void stop()} />}
    {result && <View style={{ gap: 10 }}>
      {mode === 'enrollment' && result.walkSignalsVerified ? <Button label="Save this baseline walk" icon="finger-print-outline" onPress={() => void saveBaseline()} /> : result.verified ? <Button label="Record verified demo run" icon="checkmark" loading={busy} onPress={() => void saveVerifiedWalk()} /> : <Button label="Try another walk" icon="refresh-outline" onPress={() => void start(baselineCount < 2 ? 'enrollment' : 'verification')} />}
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>}
    <Surface style={{ marginTop: 22, gap: 8 }}>
      <AppText variant="label" color={colors.muted}>WHAT THIS CHECKS</AppText>
      <AppText variant="caption" color={colors.muted}>Checks heel-strike rhythm, rotation coupling, vibration, and a local two-walk baseline. It works indoors without location, but is anti-cheat support—not medical or identity proof.</AppText>
    </Surface>
  </Screen>;
}
