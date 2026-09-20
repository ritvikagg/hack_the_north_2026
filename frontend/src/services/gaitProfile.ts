import type { GaitModelMetadata } from './gaitModelPreprocessing';

const metadata = require('../../assets/models/gait_authenticator.metadata.json') as GaitModelMetadata & {
  trained: string;
  parameter_count: number;
  profile: GaitIdentityProfile & { subject_id?: string; mode?: string; warning?: string | null };
};

export const GAIT_PROFILE_SCHEMA_VERSION = 1;
export const GAIT_MODEL_ID = `${metadata.trained}:${metadata.parameter_count}:${metadata.profile.center.length}`;

export type GaitIdentityProfile = {
  center: number[];
  scale: number[];
  accept_distance: number;
  required_window_fraction: number;
  minimum_windows: number;
};

export type RuntimeGaitProfile = GaitIdentityProfile & {
  schemaVersion: number;
  modelId: string;
  source: 'runtime';
  createdAt: string;
  sessionCount: number;
  windowCount: number;
};

export type ActiveGaitProfile = {
  profile: GaitIdentityProfile;
  source: 'bundled' | 'runtime';
  sessionCount: number;
  windowCount: number;
  createdAt: string | null;
};

export const bundledGaitProfile: GaitIdentityProfile = {
  center: [...metadata.profile.center],
  scale: [...metadata.profile.scale],
  accept_distance: metadata.profile.accept_distance,
  required_window_fraction: metadata.profile.required_window_fraction,
  minimum_windows: metadata.profile.minimum_windows,
};

const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

function quantile(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

const median = (values: readonly number[]) => quantile(values, 0.5);

export function embeddingDistance(embedding: readonly number[], profile: GaitIdentityProfile) {
  if (embedding.length !== profile.center.length || profile.scale.length !== profile.center.length) {
    throw new Error('The gait profile does not match this model.');
  }
  return Math.sqrt(average(embedding.map((value, index) => {
    const normalized = (value - profile.center[index]) / profile.scale[index];
    return normalized * normalized;
  })));
}

export function scoreEmbeddingBatch(embeddings: readonly (readonly number[])[], profile: GaitIdentityProfile) {
  const distances = embeddings.map((embedding) => embeddingDistance(embedding, profile));
  const matchingCount = distances.filter((distance) => distance <= profile.accept_distance).length;
  return {
    distances,
    matchingFraction: matchingCount / Math.max(distances.length, 1),
    meanDistance: average(distances),
  };
}

export function fitRuntimeGaitProfile(
  embeddings: readonly (readonly number[])[],
  sessionCount: number,
): RuntimeGaitProfile {
  if (sessionCount < 2) throw new Error('Complete two separate calibration walks.');
  if (embeddings.length < 100) throw new Error('Not enough walking windows were collected for calibration.');
  const dimensions = embeddings[0]?.length ?? 0;
  if (!dimensions || embeddings.some((embedding) => embedding.length !== dimensions
    || embedding.some((value) => !Number.isFinite(value)))) {
    throw new Error('Calibration produced invalid gait embeddings.');
  }
  const center = Array.from({ length: dimensions }, (_, index) => median(embeddings.map((embedding) => embedding[index])));
  const scale = Array.from({ length: dimensions }, (_, index) => Math.max(
    median(embeddings.map((embedding) => Math.abs(embedding[index] - center[index]))) * 1.4826,
    0.10,
  ));
  const provisional: GaitIdentityProfile = {
    center,
    scale,
    accept_distance: Number.POSITIVE_INFINITY,
    required_window_fraction: 0.70,
    minimum_windows: metadata.profile.minimum_windows,
  };
  const distances = embeddings.map((embedding) => embeddingDistance(embedding, provisional));
  const acceptDistance = quantile(distances, 0.95) * 1.15;
  if (!Number.isFinite(acceptDistance) || acceptDistance <= 0) {
    throw new Error('Calibration did not contain enough natural gait variation.');
  }
  return {
    ...provisional,
    accept_distance: acceptDistance,
    schemaVersion: GAIT_PROFILE_SCHEMA_VERSION,
    modelId: GAIT_MODEL_ID,
    source: 'runtime',
    createdAt: new Date().toISOString(),
    sessionCount,
    windowCount: embeddings.length,
  };
}

export function isCompatibleRuntimeProfile(value: unknown): value is RuntimeGaitProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<RuntimeGaitProfile>;
  return profile.schemaVersion === GAIT_PROFILE_SCHEMA_VERSION
    && profile.modelId === GAIT_MODEL_ID
    && profile.source === 'runtime'
    && typeof profile.createdAt === 'string'
    && typeof profile.sessionCount === 'number' && profile.sessionCount >= 2
    && typeof profile.windowCount === 'number' && profile.windowCount >= 100
    && Array.isArray(profile.center) && profile.center.length === bundledGaitProfile.center.length
    && profile.center.every(Number.isFinite)
    && Array.isArray(profile.scale) && profile.scale.length === profile.center.length
    && profile.scale.every((scale) => Number.isFinite(scale) && scale > 0)
    && typeof profile.accept_distance === 'number' && Number.isFinite(profile.accept_distance) && profile.accept_distance > 0
    && typeof profile.required_window_fraction === 'number'
    && typeof profile.minimum_windows === 'number';
}
