import { Asset } from 'expo-asset';
import * as ort from 'onnxruntime-react-native';
import { buildModelInputs, type GaitModelMetadata, type SensorSample } from './gaitModelPreprocessing';
import { bundledGaitProfile, scoreEmbeddingBatch, type GaitIdentityProfile } from './gaitProfile';

const metadata = require('../../assets/models/gait_authenticator.metadata.json') as GaitModelMetadata;
const modelModule = require('../../assets/models/gait_authenticator.onnx');
let sessionPromise: Promise<ort.InferenceSession> | null = null;

export type GaitModelScore = {
  accepted: boolean;
  windowCount: number;
  walkWindowFraction: number;
  identityWindowFraction: number;
  meanIdentityDistance: number;
  threshold: number;
};

export type GaitModelInference = {
  embeddings: number[][];
  walkingWindows: boolean[];
  windowCount: number;
  walkWindowFraction: number;
};

async function createSession() {
  const asset = Asset.fromModule(modelModule);
  await asset.downloadAsync();
  const path = asset.localUri ?? asset.uri;
  if (!path) throw new Error('The bundled gait model could not be loaded.');
  return ort.InferenceSession.create(path);
}

export function prepareGaitModel() {
  sessionPromise ??= createSession().catch((error) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

export async function inferGaitSession(samples: readonly SensorSample[]): Promise<GaitModelInference> {
  const inputs = buildModelInputs(samples, metadata);
  if (!inputs.windowCount) throw new Error(`Collect at least ${metadata.window_seconds} seconds of sensor data.`);
  const session = await prepareGaitModel();
  const outputs = await session.run({
    raw: new ort.Tensor('float32', inputs.raw, [inputs.windowCount, 8, metadata.sample_rate_hz * metadata.window_seconds]),
    features: new ort.Tensor('float32', inputs.features, [inputs.windowCount, 30]),
  }, ['embedding', 'activity_logits']);
  const embedding = outputs.embedding.data as Float32Array;
  const activity = outputs.activity_logits.data as Float32Array;
  const activityCount = metadata.activities.length;
  const walkIndex = metadata.activities.indexOf('walk');
  if (walkIndex < 0) throw new Error('The bundled gait model has no walking activity label.');
  const embeddings: number[][] = [];
  const walkingWindows: boolean[] = [];
  for (let windowIndex = 0; windowIndex < inputs.windowCount; windowIndex += 1) {
    let predictedActivity = 0;
    for (let activityIndex = 1; activityIndex < activityCount; activityIndex += 1) {
      if (activity[windowIndex * activityCount + activityIndex] > activity[windowIndex * activityCount + predictedActivity]) predictedActivity = activityIndex;
    }
    walkingWindows.push(predictedActivity === walkIndex);
    const windowEmbedding: number[] = [];
    for (let embeddingIndex = 0; embeddingIndex < bundledGaitProfile.center.length; embeddingIndex += 1) {
      windowEmbedding.push(embedding[windowIndex * bundledGaitProfile.center.length + embeddingIndex]);
    }
    embeddings.push(windowEmbedding);
  }
  return {
    embeddings,
    walkingWindows,
    windowCount: inputs.windowCount,
    walkWindowFraction: walkingWindows.filter(Boolean).length / inputs.windowCount,
  };
}

export function scoreGaitInference(inference: GaitModelInference, profile: GaitIdentityProfile): GaitModelScore {
  const identity = scoreEmbeddingBatch(inference.embeddings, profile);
  return {
    accepted: inference.windowCount >= profile.minimum_windows
      && inference.walkWindowFraction >= metadata.activity_required_walk_fraction
      && identity.matchingFraction >= profile.required_window_fraction,
    windowCount: inference.windowCount,
    walkWindowFraction: inference.walkWindowFraction,
    identityWindowFraction: identity.matchingFraction,
    meanIdentityDistance: identity.meanDistance,
    threshold: profile.accept_distance,
  };
}

export async function scoreGaitSession(
  samples: readonly SensorSample[],
  profile: GaitIdentityProfile = bundledGaitProfile,
): Promise<GaitModelScore> {
  const minimumSeconds = metadata.window_seconds + (profile.minimum_windows - 1) * metadata.stride_seconds;
  const inference = await inferGaitSession(samples);
  if (inference.windowCount < profile.minimum_windows) throw new Error(`Collect at least ${minimumSeconds} seconds of sensor data.`);
  return scoreGaitInference(inference, profile);
}
