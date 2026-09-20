import { Accelerometer, Gyroscope, Pedometer } from 'expo-sensors';
import { inferGaitSession, prepareGaitModel, scoreGaitSession, type GaitModelScore } from './gaitModel';
import { getActiveGaitProfile } from './gaitProfileStorage';
import type { SensorSample, Vector3 } from './gaitModelPreprocessing';

type Sub = { remove(): void };

export type GaitVerification = {
  verified: boolean;
  walkSignalsVerified: boolean;
  reason: string;
  durationSeconds: number;
  steps: number;
  sampleCount: number;
  sampleRateHz: number;
  cadenceSpm: number;
  accelerationVariationG: number;
  rotationEnergy: number;
  heelStrikeCount: number;
  stepRegularity: number;
  impactRotationCoupling: number;
  vibrationRatio: number;
  displacementMeters: number;
  pathMeters: number;
  locationSampleCount: number;
  baselineSessions: number;
  baselineSimilarity: number | null;
  modelWindowCount: number;
  modelWalkWindowFraction: number;
  modelIdentityWindowFraction: number;
  modelMeanIdentityDistance: number | null;
  profileSource: 'bundled' | 'runtime';
};

export type GaitEnrollmentSession = {
  accepted: boolean;
  reason: string;
  durationSeconds: number;
  steps: number;
  sampleRateHz: number;
  modelWindowCount: number;
  walkWindowFraction: number;
  walkingEmbeddings: number[][];
};

type Session = {
  startedAt: number;
  samples: SensorSample[];
  latestRotation?: Vector3;
  steps: number;
  subscriptions: Sub[];
};

const GRAVITY_MPS2 = 9.80665;
const TARGET_INTERVAL_MS = 20;
const MINIMUM_SECONDS = 15;
const MINIMUM_STEPS = 8;
const MINIMUM_SAMPLE_RATE_HZ = 15;
export const ENROLLMENT_SESSION_COUNT = 2;
export const ENROLLMENT_SECONDS_PER_SESSION = 240;
const ENROLLMENT_MINIMUM_STEPS = 120;
const ENROLLMENT_MINIMUM_WINDOWS = 100;
const MAXIMUM_SAMPLES = 180_000;
let active: Session | null = null;

const magnitude = (value: Vector3) => Math.hypot(value[0], value[1], value[2]);
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const standardDeviation = (values: readonly number[]) => {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
};

function strikes(values: readonly number[], sampleRateHz: number) {
  const threshold = average(values) + standardDeviation(values) * 0.9;
  const gap = Math.max(4, Math.floor(sampleRateHz * 0.28));
  const peaks: number[] = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] > threshold && values[index] > values[index - 1] && values[index] >= values[index + 1]
      && (!peaks.length || index - peaks[peaks.length - 1] >= gap)) peaks.push(index);
  }
  const gaps = peaks.slice(1).map((peak, index) => (peak - peaks[index]) / Math.max(sampleRateHz, 1));
  return {
    peaks,
    regularity: gaps.length >= 3
      ? Math.max(0, 1 - standardDeviation(gaps) / Math.max(average(gaps), 0.01))
      : 0,
  };
}

function vibration(values: readonly number[]) {
  return values.length < 8
    ? 9
    : average(values.slice(1).map((value, index) => Math.abs(value - values[index])))
      / Math.max(standardDeviation(values), 0.001);
}

export async function startGaitVerification() {
  if (active) throw new Error('A walking check is already running.');
  const [accelerometerAvailable, gyroscopeAvailable, pedometerAvailable] = await Promise.all([
    Accelerometer.isAvailableAsync(),
    Gyroscope.isAvailableAsync(),
    Pedometer.isAvailableAsync(),
  ]);
  if (!accelerometerAvailable || !gyroscopeAvailable || !pedometerAvailable) {
    throw new Error('This phone needs an accelerometer, gyroscope, and step sensor.');
  }
  const activity = await Pedometer.requestPermissionsAsync();
  if (!activity.granted) throw new Error('Allow Physical activity permission to verify a walk.');
  try {
    await prepareGaitModel();
  } catch {
    throw new Error('The on-device gait model is unavailable. Install the latest native Android build.');
  }
  Accelerometer.setUpdateInterval(TARGET_INTERVAL_MS);
  Gyroscope.setUpdateInterval(TARGET_INTERVAL_MS);
  const session: Session = { startedAt: Date.now(), samples: [], steps: 0, subscriptions: [] };
  try {
    session.subscriptions.push(
      Gyroscope.addListener(({ x, y, z }) => {
        session.latestRotation = [x, y, z];
      }),
      Accelerometer.addListener(({ x, y, z, timestamp }) => {
        if (!session.latestRotation || session.samples.length >= MAXIMUM_SAMPLES) return;
        session.samples.push({
          timestampSeconds: timestamp,
          accelerationMps2: [x * GRAVITY_MPS2, y * GRAVITY_MPS2, z * GRAVITY_MPS2],
          rotationRads: [...session.latestRotation],
        });
      }),
      Pedometer.watchStepCount(({ steps }) => {
        session.steps = Math.max(session.steps, steps);
      }),
    );
    active = session;
  } catch (error) {
    session.subscriptions.forEach((subscription) => subscription.remove());
    throw error;
  }
}

export function cancelGaitVerification() {
  active?.subscriptions.forEach((subscription) => subscription.remove());
  active = null;
}

function finishCapture() {
  const session = active;
  if (!session) throw new Error('Start a walking check first.');
  cancelGaitVerification();
  const durationSeconds = (Date.now() - session.startedAt) / 1000;
  const sensorSeconds = session.samples.length > 1
    ? session.samples[session.samples.length - 1].timestampSeconds - session.samples[0].timestampSeconds
    : 0;
  const sampleRateHz = (session.samples.length - 1) / Math.max(sensorSeconds, 1);
  const accelerationMagnitudesG = session.samples.map((sample) => magnitude(sample.accelerationMps2) / GRAVITY_MPS2);
  const rotationMagnitudes = session.samples.map((sample) => magnitude(sample.rotationRads));
  const cadenceSpm = session.steps / Math.max(durationSeconds, 1) * 60;
  const heel = strikes(accelerationMagnitudesG, sampleRateHz);
  const rotationEnergy = average(rotationMagnitudes);
  const impactRotationCoupling = heel.peaks.length
    ? average(heel.peaks.map((index) => rotationMagnitudes[index] ?? 0)) / Math.max(rotationEnergy, 0.001)
    : 0;
  return {
    session,
    durationSeconds,
    sampleRateHz,
    accelerationMagnitudesG,
    rotationMagnitudes,
    cadenceSpm,
    heel,
    rotationEnergy,
    impactRotationCoupling,
  };
}

export const startGaitEnrollment = startGaitVerification;

export async function stopGaitEnrollment(): Promise<GaitEnrollmentSession> {
  const capture = finishCapture();
  let modelError: string | null = null;
  let inference: Awaited<ReturnType<typeof inferGaitSession>> | null = null;
  try {
    inference = await inferGaitSession(capture.session.samples);
  } catch (error) {
    modelError = error instanceof Error ? error.message : 'The gait model could not analyze this calibration walk.';
  }
  const walkingEmbeddings = inference?.embeddings.filter((_, index) => inference?.walkingWindows[index]) ?? [];
  const accepted = capture.durationSeconds >= ENROLLMENT_SECONDS_PER_SESSION
    && capture.session.steps >= ENROLLMENT_MINIMUM_STEPS
    && capture.sampleRateHz >= MINIMUM_SAMPLE_RATE_HZ
    && (inference?.windowCount ?? 0) >= ENROLLMENT_MINIMUM_WINDOWS
    && (inference?.walkWindowFraction ?? 0) >= 0.70;
  let reason = 'Calibration walk accepted.';
  if (capture.durationSeconds < ENROLLMENT_SECONDS_PER_SESSION) reason = `Keep walking until the timer reaches ${ENROLLMENT_SECONDS_PER_SESSION / 60} minutes.`;
  else if (capture.sampleRateHz < MINIMUM_SAMPLE_RATE_HZ || !inference) reason = modelError ?? 'Not enough synchronized sensor data was collected. Keep the app open and try again.';
  else if (capture.session.steps < ENROLLMENT_MINIMUM_STEPS) reason = 'Too few physical steps were detected for a four-minute calibration walk.';
  else if (inference.windowCount < ENROLLMENT_MINIMUM_WINDOWS) reason = 'Not enough model windows were collected. Keep the app open for the full walk.';
  else if (inference.walkWindowFraction < 0.70) reason = 'The model did not detect continuous natural walking throughout this session.';
  return {
    accepted,
    reason,
    durationSeconds: capture.durationSeconds,
    steps: capture.session.steps,
    sampleRateHz: capture.sampleRateHz,
    modelWindowCount: inference?.windowCount ?? 0,
    walkWindowFraction: inference?.walkWindowFraction ?? 0,
    walkingEmbeddings: accepted ? walkingEmbeddings : [],
  };
}

export async function stopGaitVerification(): Promise<GaitVerification> {
  const capture = finishCapture();
  const activeProfile = await getActiveGaitProfile();
  let model: GaitModelScore | null = null;
  let modelError: string | null = null;
  try {
    model = await scoreGaitSession(capture.session.samples, activeProfile.profile);
  } catch (error) {
    modelError = error instanceof Error ? error.message : 'The gait model could not score this session.';
  }
  const sensorQualityOk = capture.durationSeconds >= MINIMUM_SECONDS
    && capture.session.steps >= MINIMUM_STEPS
    && capture.sampleRateHz >= MINIMUM_SAMPLE_RATE_HZ;
  const walkSignalsVerified = sensorQualityOk && (model?.walkWindowFraction ?? 0) >= 0.70;
  const verified = sensorQualityOk && Boolean(model?.accepted);
  let reason = activeProfile.source === 'runtime'
    ? 'On-device gait model verified the walk and your personal calibration.'
    : 'On-device gait model verified the walk and bundled owner profile.';
  if (capture.durationSeconds < MINIMUM_SECONDS) reason = `Walk for at least ${MINIMUM_SECONDS} seconds.`;
  else if (capture.sampleRateHz < MINIMUM_SAMPLE_RATE_HZ || !model) reason = modelError ?? 'Not enough synchronized sensor data was collected. Keep the app open and try again.';
  else if (capture.session.steps < MINIMUM_STEPS) reason = 'Too few physical steps were detected. Walk naturally with the phone in your pocket.';
  else if (model.walkWindowFraction < 0.70) reason = 'The on-device model did not detect continuous natural walking.';
  else if (model.identityWindowFraction < 0.70) reason = 'Walking was detected, but it did not match the enrolled owner gait profile.';
  return {
    verified,
    walkSignalsVerified,
    reason,
    durationSeconds: capture.durationSeconds,
    steps: capture.session.steps,
    sampleCount: capture.session.samples.length,
    sampleRateHz: capture.sampleRateHz,
    cadenceSpm: capture.cadenceSpm,
    accelerationVariationG: standardDeviation(capture.accelerationMagnitudesG),
    rotationEnergy: capture.rotationEnergy,
    heelStrikeCount: capture.heel.peaks.length,
    stepRegularity: capture.heel.regularity,
    impactRotationCoupling: capture.impactRotationCoupling,
    vibrationRatio: vibration(capture.accelerationMagnitudesG),
    displacementMeters: 0,
    pathMeters: 0,
    locationSampleCount: 0,
    baselineSessions: activeProfile.source === 'runtime' ? activeProfile.sessionCount : 1,
    baselineSimilarity: model?.identityWindowFraction ?? null,
    modelWindowCount: model?.windowCount ?? 0,
    modelWalkWindowFraction: model?.walkWindowFraction ?? 0,
    modelIdentityWindowFraction: model?.identityWindowFraction ?? 0,
    modelMeanIdentityDistance: model?.meanIdentityDistance ?? null,
    profileSource: activeProfile.source,
  };
}
