import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { cancelGaitCapture, GaitCapture, startGaitCapture, stopGaitCapture } from './gait';
import { clearDebugOverride, injectDebugSteps, isDebugOverrideActive, isPedometerAvailable, requestPedometerPermission, watchSteps } from './pedometer';
import { errorMessage } from '../theme';

export function useMotionSession(withSteps: boolean) {
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const count = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);
  const active = useRef(false);
  const starting = useRef(false);
  const generation = useRef(0);
  const beganAt = useRef(0);
  const cancel = useCallback(() => {
    generation.current++;
    unsubscribe.current?.(); unsubscribe.current = null;
    cancelGaitCapture(); clearDebugOverride();
    active.current = false; starting.current = false;
    setTracking(false); setBusy(false);
  }, []);
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      // Permission prompts can temporarily background the app before capture starts.
      if (state !== 'active' && active.current) {
        cancel(); setError('Recording stopped when the app left the foreground. No activity was credited. Start a new session and keep this screen open.');
      }
    });
    const timer = setInterval(() => { if (active.current) setSeconds(Math.floor((Date.now() - beganAt.current) / 1000)); }, 1000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [cancel]);
  async function start() {
    if (starting.current || active.current) return;
    const token = ++generation.current;
    starting.current = true; setBusy(true); setError(null);
    try {
      if (Platform.OS === 'web') throw new Error('Open pledgefit in Expo Go on your phone to record motion.');
      if (withSteps) {
        if (!await requestPedometerPermission()) throw new Error('Allow physical activity / motion access in Settings, then try again.');
        if (!await isPedometerAvailable()) throw new Error('This device has no available step counter. You can still try Walking analysis from You.');
      }
      if (token !== generation.current) return;
      clearDebugOverride(); count.current = 0; setSteps(0); setSeconds(0);
      await startGaitCapture(withSteps ? 'workout' : 'walking_analysis');
      if (token !== generation.current) { cancelGaitCapture(); return; }
      if (withSteps) unsubscribe.current = watchSteps(value => { count.current = value; setSteps(value); });
      beganAt.current = Date.now(); active.current = true; setTracking(true);
    } catch (e) { if (token === generation.current) { cancel(); setError(errorMessage(e)); } }
    finally { if (token === generation.current) { starting.current = false; setBusy(false); } }
  }
  function stop(): { capture: GaitCapture; steps: number; debug: boolean } | null {
    if (!active.current) return null;
    try {
      unsubscribe.current?.(); unsubscribe.current = null;
      const capture = stopGaitCapture(withSteps ? count.current : null);
      return { capture, steps: count.current, debug: isDebugOverrideActive() };
    } catch (e) { setError(errorMessage(e)); return null; }
    finally { active.current = false; setTracking(false); clearDebugOverride(); }
  }
  function inject(value: number) { if (__DEV__ && active.current) injectDebugSteps(value); }
  return { tracking, busy, steps, seconds, error, setError, start, stop, inject };
}
