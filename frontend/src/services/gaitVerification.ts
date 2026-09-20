import { Accelerometer, Gyroscope, Pedometer } from 'expo-sensors';

type Subscription = { remove(): void };

export type GaitVerification = {
  verified: boolean;
  reason: string;
  durationSeconds: number;
  steps: number;
  sampleCount: number;
  sampleRateHz: number;
  cadenceSpm: number;
  accelerationVariationG: number;
  rotationEnergy: number;
};

type ActiveSession = {
  startedAt: number;
  accelerations: number[];
  gyroscopeMagnitudes: number[];
  steps: number;
  subscriptions: Subscription[];
};

let active: ActiveSession | null = null;

const magnitude = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
const standardDeviation = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};

/**
 * Starts an in-app, foreground-only gait check. The native collector is still
 * the path for screen-off/raw CSV collection; Expo Go does not keep this stream
 * alive in the background.
 */
export async function startGaitVerification(): Promise<void> {
  if (active) throw new Error('A walking check is already running.');
  const [accelerometerAvailable, gyroscopeAvailable, pedometerAvailable] = await Promise.all([
    Accelerometer.isAvailableAsync(),
    Gyroscope.isAvailableAsync(),
    Pedometer.isAvailableAsync(),
  ]);
  if (!accelerometerAvailable || !gyroscopeAvailable || !pedometerAvailable) {
    throw new Error('This phone needs an accelerometer, gyroscope, and step sensor for a verified walk.');
  }
  const permission = await Pedometer.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Allow Physical activity permission to verify a walk.');

  Accelerometer.setUpdateInterval(50);
  Gyroscope.setUpdateInterval(50);
  const session: ActiveSession = { startedAt: Date.now(), accelerations: [], gyroscopeMagnitudes: [], steps: 0, subscriptions: [] };
  try {
    session.subscriptions.push(
      Accelerometer.addListener(({ x, y, z }) => {
        if (session.accelerations.length < 18_000) session.accelerations.push(magnitude(x, y, z));
      }),
      Gyroscope.addListener(({ x, y, z }) => {
        if (session.gyroscopeMagnitudes.length < 18_000) session.gyroscopeMagnitudes.push(magnitude(x, y, z));
      }),
      Pedometer.watchStepCount(({ steps }) => { session.steps = Math.max(session.steps, steps); }),
    );
    active = session;
  } catch (error) {
    session.subscriptions.forEach((subscription) => subscription.remove());
    throw error;
  }
}

export function cancelGaitVerification(): void {
  active?.subscriptions.forEach((subscription) => subscription.remove());
  active = null;
}

export function stopGaitVerification(): GaitVerification {
  const session = active;
  if (!session) throw new Error('Start a walking check first.');
  cancelGaitVerification();

  const durationSeconds = Math.max(0, (Date.now() - session.startedAt) / 1000);
  const sampleCount = session.accelerations.length;
  const sampleRateHz = sampleCount / Math.max(durationSeconds, 1);
  const accelerationVariationG = standardDeviation(session.accelerations);
  const rotationEnergy = mean(session.gyroscopeMagnitudes);
  const cadenceSpm = session.steps / Math.max(durationSeconds, 1) * 60;
  const verified = durationSeconds >= 10
    && session.steps >= 8
    && sampleCount >= 120
    && sampleRateHz >= 12
    && accelerationVariationG >= 0.07
    && rotationEnergy >= 0.03;
  const reason = verified
    ? 'Step, acceleration, and rotation signals agree with an active walk.'
    : durationSeconds < 10 ? 'Walk for at least 10 seconds before stopping.'
      : session.steps < 8 ? 'Not enough detected steps. Keep the phone in your pocket and walk naturally.'
        : sampleRateHz < 12 ? 'The motion sensor stream was too sparse. Try again with the app open.'
          : 'The motion signal was too still for a walking check. Try another short walk.';
  return { verified, reason, durationSeconds, steps: session.steps, sampleCount, sampleRateHz, cadenceSpm, accelerationVariationG, rotationEnergy };
}
