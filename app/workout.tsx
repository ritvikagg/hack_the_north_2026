// PERSON 1 (UI) + PERSON 2 (data) share this screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, typography, radius } from '../src/theme';
import {
  isPedometerAvailable,
  requestPedometerPermission,
  watchSteps,
  injectDebugSteps,
} from '../src/lib/pedometer';
import { evaluateUnlock } from '../src/lib/unlockRules';
import { useAppStore } from '../src/store/useAppStore';
import { WorkoutEvent } from '../src/types';

type PermissionState = 'checking' | 'granted' | 'denied' | 'unavailable';

export default function Workout() {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [steps, setSteps] = useState(0);
  const [tracking, setTracking] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const user = useAppStore(s => s.user);
  const logWorkout = useAppStore(s => s.logWorkout);

  // Runs once on mount: check the sensor exists, then request permission.
  // On Android this is what actually triggers the ACTIVITY_RECOGNITION
  // system dialog — without this call it never appears and watchSteps()
  // just silently never fires.
  useEffect(() => {
    (async () => {
      const available = await isPedometerAvailable();
      if (!available) {
        setPermission('unavailable');
        return;
      }
      const granted = await requestPedometerPermission();
      setPermission(granted ? 'granted' : 'denied');
    })();

    return () => unsubscribeRef.current?.();
  }, []);

  const startTracking = useCallback(() => {
    setSteps(0);
    setTracking(true);
    unsubscribeRef.current = watchSteps(setSteps);
  }, []);

  const endTracking = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setTracking(false);

    const result = evaluateUnlock(steps, user.lockedAmount, user.streak);
    const event: WorkoutEvent = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      steps,
      source: 'pedometer',
      verified: result.ruleApplied !== null,
    };
    logWorkout(event, result.unlockedAmount, result.newStreak);
    router.push('/dashboard');
  }, [steps, user.lockedAmount, user.streak, logWorkout]);

  if (permission === 'checking') {
    return (
      <View style={styles.container}>
        <Text style={[typography.body, { color: colors.textSecondary }]}>Checking sensor…</Text>
      </View>
    );
  }

  if (permission === 'unavailable') {
    return (
      <View style={styles.container}>
        <Text style={[typography.h3, { color: colors.textPrimary }]}>No pedometer on this device</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
          Use the debug buttons below to demo the unlock flow anyway.
        </Text>
        <DebugRow onInject={injectDebugSteps} />
      </View>
    );
  }

  if (permission === 'denied') {
    return (
      <View style={styles.container}>
        <Text style={[typography.h3, { color: colors.textPrimary }]}>Motion permission denied</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
          Enable it in system settings, then come back to this screen.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[typography.h1, { color: colors.pink }]}>{steps}</Text>
      <Text style={[typography.body, { color: colors.textSecondary }]}>steps this session</Text>

      <Pressable
        style={[styles.button, { backgroundColor: tracking ? colors.danger : colors.purple }]}
        onPress={tracking ? endTracking : startTracking}
      >
        <Text style={[typography.h3, { color: colors.textPrimary }]}>
          {tracking ? 'End workout' : 'Start workout'}
        </Text>
      </Pressable>

      {tracking && <DebugRow onInject={setSteps} />}
    </View>
  );
}

/**
 * DEMO SAFETY NET. Tap buttons, not a text prompt — Alert.prompt is
 * iOS-only in React Native, so it would silently no-op on Android.
 * Only render this in dev builds if you don't want it visible on stage.
 */
function DebugRow({ onInject }: { onInject: (steps: number) => void }) {
  return (
    <View style={styles.debugRow}>
      {[2000, 5000, 8000].map(n => (
        <Pressable key={n} style={styles.debugButton} onPress={() => onInject(n)}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{n.toLocaleString()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  button: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  debugRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  debugButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
