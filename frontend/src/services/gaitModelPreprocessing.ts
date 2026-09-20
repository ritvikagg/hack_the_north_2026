export type Vector3 = readonly [number, number, number];

export type SensorSample = {
  timestampSeconds: number;
  accelerationMps2: Vector3;
  rotationRads: Vector3;
};

export type GaitModelMetadata = {
  activities: string[];
  sample_rate_hz: number;
  window_seconds: number;
  stride_seconds: number;
  raw_mean: number[];
  raw_scale: number[];
  feature_mean: number[];
  feature_scale: number[];
  activity_required_walk_fraction: number;
  profile: {
    center: number[];
    scale: number[];
    accept_distance: number;
    required_window_fraction: number;
    minimum_windows: number;
  };
};

export type ModelInputs = {
  raw: Float32Array;
  features: Float32Array;
  windowCount: number;
};

const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const magnitude = (value: Vector3) => Math.hypot(value[0], value[1], value[2]);
const dot = (left: Vector3, right: Vector3) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

function standardDeviation(values: readonly number[]) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function percentile(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function percentileStats(values: readonly number[]) {
  return [
    average(values),
    standardDeviation(values),
    percentile(values, 0.10),
    percentile(values, 0.90),
    Math.sqrt(average(values.map((value) => value * value))),
  ];
}

function interpolate(left: Vector3, right: Vector3, ratio: number): Vector3 {
  return [
    left[0] + (right[0] - left[0]) * ratio,
    left[1] + (right[1] - left[1]) * ratio,
    left[2] + (right[2] - left[2]) * ratio,
  ];
}

export function resampleSensorData(samples: readonly SensorSample[], sampleRateHz: number) {
  const clean = samples
    .filter((sample) => Number.isFinite(sample.timestampSeconds)
      && [...sample.accelerationMps2, ...sample.rotationRads].every(Number.isFinite))
    .sort((left, right) => left.timestampSeconds - right.timestampSeconds)
    .filter((sample, index, all) => index === 0 || sample.timestampSeconds > all[index - 1].timestampSeconds);
  if (clean.length < 2) return { acceleration: [] as Vector3[], rotation: [] as Vector3[] };
  const acceleration: Vector3[] = [];
  const rotation: Vector3[] = [];
  const start = clean[0].timestampSeconds;
  const end = clean[clean.length - 1].timestampSeconds;
  const interval = 1 / sampleRateHz;
  let leftIndex = 0;
  for (let gridIndex = 0; start + gridIndex * interval < end; gridIndex += 1) {
    const timestamp = start + gridIndex * interval;
    while (leftIndex + 1 < clean.length - 1 && clean[leftIndex + 1].timestampSeconds < timestamp) leftIndex += 1;
    const left = clean[leftIndex];
    const right = clean[leftIndex + 1];
    const span = Math.max(right.timestampSeconds - left.timestampSeconds, Number.EPSILON);
    const ratio = Math.max(0, Math.min(1, (timestamp - left.timestampSeconds) / span));
    acceleration.push(interpolate(left.accelerationMps2, right.accelerationMps2, ratio));
    rotation.push(interpolate(left.rotationRads, right.rotationRads, ratio));
  }
  return { acceleration, rotation };
}

function spectralFeatures(verticalAcceleration: readonly number[], sampleRateHz: number) {
  const length = verticalAcceleration.length;
  const centered = verticalAcceleration.map((value) => value - average(verticalAcceleration));
  const power: number[] = [];
  for (let frequencyIndex = 0; frequencyIndex <= Math.floor(length / 2); frequencyIndex += 1) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < length; index += 1) {
      const hanning = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(length - 1, 1));
      const angle = (-2 * Math.PI * frequencyIndex * index) / length;
      const value = verticalAcceleration[index] * hanning;
      real += value * Math.cos(angle);
      imaginary += value * Math.sin(angle);
    }
    power.push(real * real + imaginary * imaginary);
  }
  const bandIndices = power.map((_, index) => index)
    .filter((index) => index * sampleRateHz / length >= 0.7 && index * sampleRateHz / length <= 3.0);
  const bandPower = bandIndices.map((index) => power[index]);
  const bandSum = bandPower.reduce((sum, value) => sum + value, 0);
  const totalPower = power.reduce((sum, value) => sum + value, 0);
  const strongestBandIndex = bandPower.reduce((best, value, index) => value > bandPower[best] ? index : best, 0);
  const dominantHz = bandPower.length && bandSum > 0 ? bandIndices[strongestBandIndex] * sampleRateHz / length : 0;
  const normalizedBand = bandPower.map((value) => value / Math.max(bandSum, 1e-9));
  const entropy = -normalizedBand.reduce((sum, value) => sum + value * Math.log(value + 1e-12), 0)
    / Math.max(Math.log(Math.max(normalizedBand.length, 2)), 1);
  const autocorrelationZero = centered.reduce((sum, value) => sum + value * value, 0);
  let maximumLagCorrelation = -Infinity;
  for (let lag = Math.floor(sampleRateHz / 3); lag < Math.floor(sampleRateHz / 0.7); lag += 1) {
    let correlation = 0;
    for (let index = 0; index < centered.length - lag; index += 1) correlation += centered[index] * centered[index + lag];
    maximumLagCorrelation = Math.max(maximumLagCorrelation, correlation);
  }
  const periodicity = Number.isFinite(maximumLagCorrelation)
    ? maximumLagCorrelation / Math.max(autocorrelationZero, 1e-9)
    : 0;
  return [
    dominantHz * 60,
    entropy,
    periodicity,
    bandSum / Math.max(totalPower, 1e-9),
    (bandPower.length ? Math.max(...bandPower) : 0) / Math.max(bandSum, 1e-9),
  ];
}

export function transformWindow(acceleration: readonly Vector3[], rotation: readonly Vector3[], sampleRateHz: number) {
  const gravity: Vector3 = [
    average(acceleration.map((value) => value[0])),
    average(acceleration.map((value) => value[1])),
    average(acceleration.map((value) => value[2])),
  ];
  const gravityMagnitude = Math.max(magnitude(gravity), 1e-6);
  const gravityUnit: Vector3 = [gravity[0] / gravityMagnitude, gravity[1] / gravityMagnitude, gravity[2] / gravityMagnitude];
  const accelerationMagnitude = acceleration.map(magnitude);
  const rotationMagnitude = rotation.map(magnitude);
  const verticalAcceleration = acceleration.map((value) => dot(value, gravityUnit) - gravityMagnitude);
  const horizontalAcceleration = acceleration.map((value) => {
    const projection = dot(value, gravityUnit);
    return Math.hypot(
      value[0] - projection * gravityUnit[0],
      value[1] - projection * gravityUnit[1],
      value[2] - projection * gravityUnit[2],
    );
  });
  const verticalRotation = rotation.map((value) => dot(value, gravityUnit));
  const horizontalRotation = rotation.map((value, index) => {
    const projection = verticalRotation[index];
    return Math.hypot(
      value[0] - projection * gravityUnit[0],
      value[1] - projection * gravityUnit[1],
      value[2] - projection * gravityUnit[2],
    );
  });
  const jerk = accelerationMagnitude.map((value, index) => index === 0 ? 0 : (value - accelerationMagnitude[index - 1]) * sampleRateHz);
  const coupling = verticalAcceleration.map((value, index) => Math.abs(value) * rotationMagnitude[index]);
  const centeredAccelerationMagnitude = accelerationMagnitude.map((value) => value - average(accelerationMagnitude));
  const centeredHorizontalAcceleration = horizontalAcceleration.map((value) => value - average(horizontalAcceleration));
  const rawChannels = [
    centeredAccelerationMagnitude,
    verticalAcceleration,
    centeredHorizontalAcceleration,
    rotationMagnitude,
    verticalRotation,
    horizontalRotation,
    jerk,
    coupling,
  ];
  const features = [
    ...percentileStats(accelerationMagnitude),
    ...percentileStats(rotationMagnitude),
    ...percentileStats(verticalAcceleration),
    ...percentileStats(jerk),
    ...spectralFeatures(verticalAcceleration, sampleRateHz),
    ...percentileStats(coupling),
  ];
  return { rawChannels, features };
}

export function buildModelInputs(samples: readonly SensorSample[], metadata: GaitModelMetadata): ModelInputs {
  const sampleRateHz = metadata.sample_rate_hz;
  const windowSize = Math.round(sampleRateHz * metadata.window_seconds);
  const strideSize = Math.round(sampleRateHz * metadata.stride_seconds);
  const resampled = resampleSensorData(samples, sampleRateHz);
  const windows: ReturnType<typeof transformWindow>[] = [];
  for (let start = 0; start + windowSize <= resampled.acceleration.length; start += strideSize) {
    windows.push(transformWindow(
      resampled.acceleration.slice(start, start + windowSize),
      resampled.rotation.slice(start, start + windowSize),
      sampleRateHz,
    ));
  }
  const raw = new Float32Array(windows.length * 8 * windowSize);
  const features = new Float32Array(windows.length * 30);
  windows.forEach((window, windowIndex) => {
    window.rawChannels.forEach((channel, channelIndex) => channel.forEach((value, sampleIndex) => {
      raw[windowIndex * 8 * windowSize + channelIndex * windowSize + sampleIndex]
        = (value - metadata.raw_mean[channelIndex]) / metadata.raw_scale[channelIndex];
    }));
    window.features.forEach((value, featureIndex) => {
      features[windowIndex * 30 + featureIndex]
        = (value - metadata.feature_mean[featureIndex]) / metadata.feature_scale[featureIndex];
    });
  });
  return { raw, features, windowCount: windows.length };
}
