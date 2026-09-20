import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  bundledGaitProfile,
  isCompatibleRuntimeProfile,
  type ActiveGaitProfile,
  type RuntimeGaitProfile,
} from './gaitProfile';

const RUNTIME_GAIT_PROFILE_KEY = 'pledgefit:gait-profile:v1';

export async function getRuntimeGaitProfile(): Promise<RuntimeGaitProfile | null> {
  const serialized = await AsyncStorage.getItem(RUNTIME_GAIT_PROFILE_KEY);
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isCompatibleRuntimeProfile(parsed)) return parsed;
  } catch {
    // Invalid or outdated profiles fall back to the bundled profile.
  }
  await AsyncStorage.removeItem(RUNTIME_GAIT_PROFILE_KEY);
  return null;
}

export async function getActiveGaitProfile(): Promise<ActiveGaitProfile> {
  const runtime = await getRuntimeGaitProfile();
  if (runtime) {
    return {
      profile: runtime,
      source: 'runtime',
      sessionCount: runtime.sessionCount,
      windowCount: runtime.windowCount,
      createdAt: runtime.createdAt,
    };
  }
  return { profile: bundledGaitProfile, source: 'bundled', sessionCount: 0, windowCount: 0, createdAt: null };
}

export async function saveRuntimeGaitProfile(profile: RuntimeGaitProfile) {
  if (!isCompatibleRuntimeProfile(profile)) throw new Error('The new gait profile is not compatible with this model.');
  await AsyncStorage.setItem(RUNTIME_GAIT_PROFILE_KEY, JSON.stringify(profile));
}

export async function clearRuntimeGaitProfile() {
  await AsyncStorage.removeItem(RUNTIME_GAIT_PROFILE_KEY);
}
