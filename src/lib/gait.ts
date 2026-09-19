import { Accelerometer, DeviceMotion, Gyroscope } from 'expo-sensors';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { GaitAnalysis } from '../types';

type Subscription = { remove: () => void };

export type GaitSample = {
  tMs: number;
  sensorTimestampS: number;
  accel: [number, number, number];
  linearAccel: [number, number, number];
  gravity: [number, number, number];
  gyro: [number, number, number];
  orientation: [number, number, number];
};

export type GaitCapture = {
  sessionId: string;
  label: string;
  startedAt: string;
  durationMs: number;
  samples: GaitSample[];
  analysis: GaitAnalysis;
};

type ActiveCapture = {
  sessionId: string;
  label: string;
  startedAt: string;
  startedAtMs: number;
  samples: GaitSample[];
  subscriptions: Subscription[];
  gyro: [number, number, number];
};

let activeCapture: ActiveCapture | null = null;
const SAMPLE_INTERVAL_MS = 20; // Target 50 Hz; Android may choose a nearby supported rate.
const MAX_SAMPLES = 60_000; // ~20 minutes at 50 Hz, so an accidental long session stays bounded.

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const magnitude = ([x, y, z]: [number, number, number]) => Math.sqrt(x * x + y * y + z * z);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const stddev = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};

/**
 * Starts a phone-motion capture alongside the pedometer. DeviceMotion supplies
 * gravity-inclusive and linear acceleration; Gyroscope is retained as a separate
 * raw channel. The Expo managed workflow exposes Euler orientation, not a fused
 * quaternion, so the CSV names this fact rather than fabricating quaternion data.
 */
export async function startGaitCapture(label: string): Promise<void> {
  if (activeCapture) throw new Error('A gait capture is already running.');

  const [accelerometerAvailable, gyroscopeAvailable, motionAvailable] = await Promise.all([
    Accelerometer.isAvailableAsync(),
    Gyroscope.isAvailableAsync(),
    DeviceMotion.isAvailableAsync(),
  ]);
  if (!accelerometerAvailable || !gyroscopeAvailable || !motionAvailable) {
    throw new Error('This device needs accelerometer, gyroscope, and motion sensors to validate walking.');
  }

  // On Android this is normally already allowed. On iOS/web it may surface the
  // system motion prompt, which must happen in response to the Start button.
  const permission = await DeviceMotion.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Motion permission is required for gait validation.');

  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);
  DeviceMotion.setUpdateInterval(SAMPLE_INTERVAL_MS);

  const startedAtMs = Date.now();
  const capture: ActiveCapture = {
    sessionId: `gait_${startedAtMs}`,
    label: label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'unlabeled',
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    samples: [],
    subscriptions: [],
    gyro: [0, 0, 0],
  };

  capture.subscriptions.push(
    Gyroscope.addListener(({ x, y, z }) => {
      capture.gyro = [x, y, z];
    })
  );
  // Subscribe as an availability and raw-device-frame check. Rows are emitted
  // from DeviceMotion because it also supplies a gravity-independent channel.
  capture.subscriptions.push(Accelerometer.addListener(() => undefined));
  capture.subscriptions.push(
    DeviceMotion.addListener(reading => {
      if (capture.samples.length >= MAX_SAMPLES) return;
      const includingGravity = reading.accelerationIncludingGravity;
      const linear = reading.acceleration ?? { x: 0, y: 0, z: 0 };
      const gravity: [number, number, number] = [
        includingGravity.x - linear.x,
        includingGravity.y - linear.y,
        includingGravity.z - linear.z,
      ];
      capture.samples.push({
        tMs: Date.now() - capture.startedAtMs,
        sensorTimestampS: includingGravity.timestamp,
        accel: [includingGravity.x, includingGravity.y, includingGravity.z],
        linearAccel: [linear.x, linear.y, linear.z],
        gravity,
        gyro: capture.gyro,
        orientation: [reading.rotation.alpha, reading.rotation.beta, reading.rotation.gamma],
      });
    })
  );
  activeCapture = capture;
}

export function isGaitCaptureActive() {
  return activeCapture !== null;
}

export function cancelGaitCapture() {
  activeCapture?.subscriptions.forEach(subscription => subscription.remove());
  activeCapture = null;
}

/** Stops the raw stream and returns an explainable liveness/step-consistency result. */
export function stopGaitCapture(reportedSteps: number | null): GaitCapture {
  const capture = activeCapture;
  if (!capture) throw new Error('No gait capture is running.');
  capture.subscriptions.forEach(subscription => subscription.remove());
  activeCapture = null;

  const durationMs = Math.max(Date.now() - capture.startedAtMs, 1);
  return {
    sessionId: capture.sessionId,
    label: capture.label,
    startedAt: capture.startedAt,
    durationMs,
    samples: capture.samples,
    analysis: analyseGait(capture.samples, durationMs, reportedSteps),
  };
}

/**
 * Conservative, transparent MVP check. It looks for sustained periodic motion,
 * plausible cadence, and agreement with the hardware step counter. It makes
 * simple fabricated counters fail, but it is not presented as production fraud proof.
 */
export function analyseGait(samples: GaitSample[], durationMs: number, reportedSteps: number | null): GaitAnalysis {
  const durationS = durationMs / 1000;
  const sampleRateHz = samples.length / Math.max(durationS, 0.001);
  const linearMagnitude = samples.map(sample => magnitude(sample.linearAccel));
  const gyroMagnitude = samples.map(sample => magnitude(sample.gyro));
  const motionStd = stddev(linearMagnitude);
  const gyroEnergy = mean(gyroMagnitude.map(value => value * value));
  const baseline = mean(linearMagnitude);
  const threshold = baseline + motionStd * 0.45;
  const peaks: GaitSample[] = [];

  for (let i = 1; i < samples.length - 1; i += 1) {
    const current = linearMagnitude[i];
    if (current <= threshold || current < linearMagnitude[i - 1] || current < linearMagnitude[i + 1]) continue;
    const previousPeak = peaks[peaks.length - 1];
    // 0.28s prevents a single step impact from being counted twice.
    if (!previousPeak || samples[i].tMs - previousPeak.tMs >= 280) peaks.push(samples[i]);
  }

  const peakIntervals = peaks.slice(1).map((peak, index) => (peak.tMs - peaks[index].tMs) / 1000);
  const cadenceSpm = peaks.length * 60 / Math.max(durationS, 0.001);
  const intervalMean = mean(peakIntervals);
  const intervalCv = intervalMean ? stddev(peakIntervals) / intervalMean : 1;
  const periodicity = peakIntervals.length >= 3 ? clamp(1 - intervalCv * 2.5) : 0;
  const estimatedSteps = cadenceSpm * durationS / 60;
  const stepAgreement = reportedSteps === null
    ? 1
    : reportedSteps < 4 && estimatedSteps < 4
      ? 1
      : clamp(1 - Math.abs(reportedSteps - estimatedSteps) / Math.max(reportedSteps, estimatedSteps, 1));
  const enoughSignal = durationS >= 8 && samples.length >= 150 && sampleRateHz >= 20;
  const plausibleCadence = cadenceSpm >= 45 && cadenceSpm <= 220;
  const activeMotion = motionStd >= 0.35 && gyroEnergy >= 0.002;
  const confidence = clamp(
    (clamp(sampleRateHz / 45) + clamp(motionStd / 1.2) + periodicity + stepAgreement) / 4
  );
  const isVerified = enoughSignal && plausibleCadence && activeMotion && periodicity >= 0.4
    && (reportedSteps === null || stepAgreement >= 0.5);

  let reason = 'Motion and pedometer values are consistent.';
  if (!enoughSignal) reason = 'Collect at least 8 seconds of steady walking with the phone in a pocket.';
  else if (!plausibleCadence) reason = 'The motion cadence is outside the walking range.';
  else if (!activeMotion) reason = 'Not enough sustained body motion was observed.';
  else if (periodicity < 0.4) reason = 'The motion was not periodic enough to resemble walking.';
  else if (reportedSteps !== null && stepAgreement < 0.5) reason = 'The pedometer count does not agree with the observed gait rhythm.';

  return {
    isVerified,
    confidence,
    reason,
    durationS,
    sampleRateHz,
    cadenceSpm,
    periodicity,
    motionStd,
    gyroEnergy,
    estimatedSteps,
    reportedSteps,
    stepAgreement,
    sampleCount: samples.length,
  };
}

function csvCell(value: number) {
  return Number.isFinite(value) ? value.toFixed(7) : '';
}

/** Writes the raw session to the app Documents directory and opens the system share sheet. */
export async function shareGaitCsv(capture: GaitCapture): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('The app document directory is unavailable.');
  const header = 'session_id,label,t_ms,sensor_timestamp_s,accel_x_mps2,accel_y_mps2,accel_z_mps2,linear_accel_x_mps2,linear_accel_y_mps2,linear_accel_z_mps2,gravity_x_mps2,gravity_y_mps2,gravity_z_mps2,gyro_x_rads,gyro_y_rads,gyro_z_rads,orientation_alpha_deg,orientation_beta_deg,orientation_gamma_deg';
  const rows = capture.samples.map(sample => [
    capture.sessionId, capture.label, sample.tMs, sample.sensorTimestampS,
    ...sample.accel, ...sample.linearAccel, ...sample.gravity, ...sample.gyro, ...sample.orientation,
  ].map(value => typeof value === 'number' ? csvCell(value) : value).join(','));
  const uri = `${FileSystem.documentDirectory}${capture.sessionId}_${capture.label}.csv`;
  await FileSystem.writeAsStringAsync(uri, [header, ...rows].join('\n'));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export gait session CSV' });
  }
  return uri;
}
