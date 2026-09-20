import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, PageHeader, Screen, Surface } from '@/components/ui';
import { GaitResult } from '@/components/GaitResult';
import { BackendGaitResult } from '@/components/BackendGaitResult';
import { useGaitScoring } from '@/lib/useGaitScoring';
import { useMotionSession } from '@/lib/useMotionSession';
import { GaitCapture, shareGaitCsv } from '@/lib/gait';
import { makeWorkout } from '@/lib/activity';
import { useAppStore } from '@/store/useAppStore';
import { useChallengeStore } from '@/store/useChallengeStore';
import { colors, errorMessage, money } from '@/theme';

export default function Workout() {
  const session = useMotionSession(true);
  const backend = useGaitScoring();
  const challengeId = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<{ capture: GaitCapture; debug: boolean; unlocked: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  async function start() {
    setResult(null);
    backend.reset();
    challengeId.current = useChallengeStore.getState().activeChallenge?.id;
    await session.start();
  }
  function finish() {
    const completed = session.stop();
    if (!completed) return;
    try {
      const event = makeWorkout({
        id: completed.capture.sessionId, startedAt: completed.capture.startedAt,
        timestamp: new Date().toISOString(), steps: completed.steps, debug: completed.debug,
        gait: completed.capture.analysis, challengeId: challengeId.current,
      });
      useAppStore.getState().logWorkout(event);
      useChallengeStore.getState().syncWorkouts(useAppStore.getState().workouts);
      const saved = useAppStore.getState().workouts.find(w => w.id === event.id);
      setResult({ ...completed, unlocked: saved?.unlockedAmount ?? 0 });
      if (!completed.debug) void backend.run(completed.capture, score => useAppStore.getState().attachBackendScore(event.id, score));
    } catch (e) { session.setError(errorMessage(e)); }
  }
  async function share() {
    if (!result) return;
    try { await shareGaitCsv(result.capture); } catch (e) { session.setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader title="A step for yourself." eyebrow="Record a walk" back subtitle="Keep your phone in a pocket and this app open. Aim for 20–30 seconds of steady walking for the model check." />
    <ErrorNotice message={session.error} />
    <Surface dark style={{ alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <Badge label={session.tracking ? 'Recording on your phone' : 'Phone activity'} />
      <AppText variant="number" color={colors.cream}>{session.steps.toLocaleString()}</AppText>
      <AppText color={colors.lime}>steps this session</AppText>
      <AppText variant="caption" color={colors.cream}>{Math.floor(session.seconds / 60)}m {session.seconds % 60}s</AppText>
    </Surface>
    <Button label={session.tracking ? 'Finish & check walk' : 'Start walking'} icon={session.tracking ? 'stop-outline' : 'walk-outline'} loading={session.busy} onPress={session.tracking ? finish : () => void start()} />
    <AppText variant="caption" color={colors.muted} style={{ marginVertical: 16 }}>Only sessions recorded here count. Keep each recording under 20 minutes; multiple walks can count toward the daily goal. Background activity is not collected. These steps do not count as a distance-verified run.</AppText>
    {result && <View style={{ gap: 14 }}>
      <GaitResult analysis={result.capture.analysis} debug={result.debug} />
      {!result.debug && <BackendGaitResult score={backend.score} busy={backend.busy} error={backend.error} onRetry={() => void backend.run(result.capture, score => useAppStore.getState().attachBackendScore(result.capture.sessionId, score))} />}
      {result.unlocked > 0 && <Surface><AppText variant="title">{money(Math.round(result.unlocked * 100))} unlocked.</AppText><AppText color={colors.muted}>From your separate walking wallet. Simulated CAD.</AppText></Surface>}
      <Button label="View step challenge" variant="secondary" onPress={() => router.push('/steps')} />
      <Button label="View workout history" variant="secondary" onPress={() => router.push('/activity')} />
      <Button label="Share this session's raw CSV" variant="ghost" icon="share-outline" onPress={() => void share()} />
    </View>}
    {__DEV__ && session.tracking && <View style={{ gap: 8, marginTop: 16 }}>
      <Button label={showDebug ? 'Hide debug counts' : 'Debug: inject a step count'} variant="ghost" onPress={() => setShowDebug(!showDebug)} />
      {showDebug && <><AppText variant="caption" color={colors.muted}>These counts are unverified and never unlock money or complete a day.</AppText>{[2000, 5000, 8000].map(n => <Button key={n} label={'Inject ' + n.toLocaleString() + ' steps'} variant="secondary" onPress={() => session.inject(n)} />)}</>}
    </View>}
  </Screen>;
}
