import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../../../components/ui';
import { colors, errorMessage } from '../../../theme';
import { useDemo } from '../../../state/DemoProvider';
import { cancelGaitVerification, type GaitVerification, startGaitVerification, stopGaitVerification } from '../../../services/gaitVerification';

export default function VerifyWalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challengeById, dispatch, busy } = useDemo();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<GaitVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const challenge = challengeById(id);

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
  function stop() {
    try { setResult(stopGaitVerification()); } catch (cause) { setError(errorMessage(cause)); }
    finally { setRecording(false); }
  }
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
    <PageHeader back eyebrow="Prototype gait check" title="Verify a walk" subtitle="A short movement check before this demo run counts." />
    <ErrorNotice message={error} onDismiss={() => setError(null)} />
    <Surface dark style={{ gap: 14, marginBottom: 20 }}>
      <Icon name={recording ? 'radio-outline' : result?.verified ? 'checkmark-circle-outline' : 'walk-outline'} color={colors.lime} size={37} />
      <AppText color={colors.cream} variant="title" style={{ fontSize: 30 }}>{recording ? `${seconds}s walking check` : result?.verified ? 'Walk verified' : 'Ready when you are'}</AppText>
      <AppText color="#D2DDCE">{recording ? 'Keep the phone in your pocket and walk naturally. Keep this app open.' : result?.reason ?? 'Walk for at least 10 seconds. We compare steps with acceleration and rotation.'}</AppText>
      {result && <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={`${result.steps} steps`} tone="green" />
        <Badge label={`${Math.round(result.sampleRateHz)} Hz`} tone="green" />
        <Badge label={`${Math.round(result.cadenceSpm)} steps/min`} tone="green" />
      </View>}
    </Surface>
    {!recording && !result && <Button label="Start walking check" icon="play-outline" onPress={() => void start()} />}
    {recording && <Button label="Stop and check" icon="stop-outline" onPress={stop} />}
    {result && <View style={{ gap: 10 }}>
      {result.verified ? <Button label="Record verified demo run" icon="checkmark" loading={busy} onPress={() => void saveVerifiedWalk()} /> : <Button label="Try another walk" icon="refresh-outline" onPress={() => void start()} />}
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>}
    <Surface style={{ marginTop: 22, gap: 8 }}>
      <AppText variant="label" color={colors.muted}>WHAT THIS CHECKS</AppText>
      <AppText variant="caption" color={colors.muted}>This prototype checks foreground motion consistency only. It does not measure distance, diagnose gait, or identify a person. For screen-off raw CSV collection, use the separate native collector in this repository.</AppText>
    </Surface>
  </Screen>;
}
