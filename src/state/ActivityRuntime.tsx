import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useChallengeStore } from '../store/useChallengeStore';
import { retryStorage, useStorageStatus } from '../store/storage';
import { AppText, Button, ErrorNotice, Screen } from '../components/ui';
import { colors } from '../theme';

export function ActivityRuntime({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const { error, readFailed } = useStorageStatus();
  const workouts = useAppStore(s => s.workouts);
  const challengeId = useChallengeStore(s => s.activeChallenge?.id);
  useEffect(() => {
    const update = () => setReady(useAppStore.persist.hasHydrated() && useChallengeStore.persist.hasHydrated());
    const a = useAppStore.persist.onFinishHydration(update);
    const b = useChallengeStore.persist.onFinishHydration(update);
    update();
    return () => { a(); b(); };
  }, []);
  useEffect(() => {
    if (!ready || readFailed) return;
    const sync = () => useChallengeStore.getState().syncWorkouts(useAppStore.getState().workouts);
    sync();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    const timer = setInterval(sync, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [ready, readFailed, workouts, challengeId]);
  async function retryRead() {
    useStorageStatus.setState({ readFailed: false, error: null });
    await Promise.all([useAppStore.persist.rehydrate(), useChallengeStore.persist.rehydrate()]);
  }
  if (!ready || readFailed) return <Screen contentStyle={{ justifyContent: 'center', gap: 18 }}>
    <AppText variant="title">Your next step.</AppText>
    {readFailed ? <><ErrorNotice message={error} /><Button label="Retry loading" onPress={() => void retryRead()} /></> : <ActivityIndicator color={colors.forest} accessibilityLabel="Loading saved activity" />}
  </Screen>;
  return <View style={{ flex: 1 }}>{error && <View style={{ padding: 16, paddingTop: 42 }}><ErrorNotice message={error} /><Button label="Retry saving" onPress={() => void retryStorage()} /></View>}{children}</View>;
}
