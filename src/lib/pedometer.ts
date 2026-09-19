// ─────────────────────────────────────────────────────────────────
// PERSON 2 owns this file.
// Wraps expo-sensors' Pedometer (Android: hardware TYPE_STEP_COUNTER
// sensor, via Google Play Services).
//
// NOTE: Pedometer.getStepCountAsync() (query steps over a date range)
// is iOS-only. On Android we only get live deltas via watchStepCount(),
// which is exactly what we want for a per-workout-session model:
// start watching when the user starts a workout, steps accumulate
// from that moment.
//
// Includes a debug override — USE IT during the live demo if a real
// device's step-counter hardware is being unpredictable. Don't cut this.
// ─────────────────────────────────────────────────────────────────
import { Pedometer } from 'expo-sensors';

type StepListener = (steps: number) => void;

let debugOverride: number | null = null;
let debugListeners: StepListener[] = [];

export async function isPedometerAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Android requires the runtime ACTIVITY_RECOGNITION permission (API 29+). */
export async function requestPedometerPermission(): Promise<boolean> {
  const { status } = await Pedometer.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Starts a workout session. Steps reported are counted from the moment
 * this is called, not lifetime device steps. Returns an unsubscribe fn —
 * call it when the user ends the workout.
 */
export function watchSteps(onChange: StepListener): () => void {
  debugListeners.push(onChange);
  const subscription = Pedometer.watchStepCount(result => {
    if (debugOverride === null) onChange(result.steps);
  });
  return () => {
    subscription.remove();
    debugListeners = debugListeners.filter(l => l !== onChange);
  };
}

/**
 * DEMO SAFETY NET.
 * Call this from a hidden long-press / dev menu button if the real
 * pedometer isn't cooperating during the presentation. Overrides all
 * active listeners with a fake step count.
 */
export function injectDebugSteps(steps: number) {
  debugOverride = steps;
  debugListeners.forEach(l => l(steps));
}

export function clearDebugOverride() {
  debugOverride = null;
}
