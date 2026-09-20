import { bundledGaitProfile, type GaitIdentityProfile } from './gaitProfile';
import type { SensorSample } from './gaitModelPreprocessing';

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

const unsupported = () => new Error('Gait verification is available in the installed Android app, not the web preview.');

export async function prepareGaitModel(): Promise<never> {
  throw unsupported();
}

export async function inferGaitSession(_samples: readonly SensorSample[]): Promise<GaitModelInference> {
  throw unsupported();
}

export function scoreGaitInference(_inference: GaitModelInference, _profile: GaitIdentityProfile): GaitModelScore {
  throw unsupported();
}

export async function scoreGaitSession(
  _samples: readonly SensorSample[],
  _profile: GaitIdentityProfile = bundledGaitProfile,
): Promise<GaitModelScore> {
  throw unsupported();
}
