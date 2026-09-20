// PERSON 1 (UI) + PERSON 2 (data) share this screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';
import { colors, spacing, typography, radius } from '../src/theme';
import {
  isPedometerAvailable,
  requestPedometerPermission,
  watchSteps,
  clearDebugOverride,
  injectDebugSteps,
  isDebugOverrideActive,
} from '../src/lib/pedometer';
import { evaluateUnlock } from '../src/lib/unlockRules';
import { useAppStore } from '../src/store/useAppStore';
import { WorkoutEvent } from '../src/types';
import { cancelGaitCapture, startGaitCapture, stopGaitCapture } from '../src/lib/gait';

type PermissionState = 'checking' | 'granted' | 'denied' | 'unavailable';

export default function Workout() {
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [steps, setSteps] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [gaitError, setGaitError] = useState<string | null>(null);
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

    return () => {
      unsubscribeRef.current?.();
      cancelGaitCapture();
    };
  }, []);

  const startTracking = useCallback(async () => {
    setGaitError(null);
    try {
      clearDebugOverride();
      await startGaitCapture('workout');
      setSteps(0);
      setTracking(true);
      unsubscribeRef.current = watchSteps(setSteps);
    } catch (error) {
      setGaitError(error instanceof Error ? error.message : 'Could not start gait validation.');
    }
  }, []);

  const endTracking = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setTracking(false);

    const usedDebugCount = isDebugOverrideActive();
    let gait;
    try {
      gait = stopGaitCapture(steps);
    } catch (error) {
      setGaitError(error instanceof Error ? error.message : 'Gait capture was interrupted.');
      return;
    }
    const canUnlock = !usedDebugCount && gait.analysis.isVerified;
    const result = canUnlock
      ? evaluateUnlock(steps, user.lockedAmount, user.streak)
      : { unlockedAmount: 0, newStreak: 0, ruleApplied: null };
    const event: WorkoutEvent = {
      id: String(Date.now()),
      timestamp: new Date().toISOString(),
      steps,
      source: usedDebugCount ? 'debug-injected' : 'pedometer',
      verified: canUnlock && result.ruleApplied !== null,
      gait: gait.analysis,
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
          {__DEV__ ? 'Debug controls below can exercise the UI, but never unlock funds.' : 'A hardware step sensor is required for verified rewards.'}
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
      <Text style={[typography.caption, styles.gaitCopy]}>
        Gait validation records 50 Hz phone motion and checks that its walking rhythm agrees with the step counter.
      </Text>

      <Pressable
        style={[styles.button, { backgroundColor: tracking ? colors.danger : colors.purple }]}
        onPress={tracking ? endTracking : startTracking}
      >
        <Text style={[typography.h3, { color: colors.textPrimary }]}>
          {tracking ? 'End workout' : 'Start workout'}
        </Text>
      </Pressable>

      {tracking && <DebugRow onInject={setSteps} />}
      {gaitError && <Text style={[typography.caption, styles.error]}>{gaitError}</Text>}
      {!tracking && (
        <Link href="/analysis" style={[typography.body, styles.analysisLink]}>
          Open walking analysis and CSV export
        </Link>
      )}
    </View>
  );
}

/**
 * DEMO SAFETY NET. Tap buttons, not a text prompt — Alert.prompt is
 * iOS-only in React Native, so it would silently no-op on Android.
 * Only render this in dev builds if you don't want it visible on stage.
 */
function DebugRow({ onInject }: { onInject: (steps: number) => void }) {
  if (!__DEV__) return null;
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
  gaitCopy: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 340,
    lineHeight: 18,
  },
  analysisLink: {
    color: colors.pink,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
