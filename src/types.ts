// ─────────────────────────────────────────────────────────────────
// Shared types — agree on these BEFORE splitting up to build.
// If you need to change one, shout in the group chat first;
// everyone else's code depends on these shapes.
// ─────────────────────────────────────────────────────────────────

/** The user's money/streak state. Owned by Person 3 (store). */
export interface UserState {
  id: string;
  depositBalance: number;   // total ever deposited (demo: fake, no real payment)
  lockedAmount: number;     // still locked, unlocks over time
  unlockedAmount: number;   // spendable / "earned back"
  streak: number;           // consecutive verified workouts
  lastWorkoutAt: string | null; // ISO timestamp
  createdAt: string;        // ISO timestamp
}

/** One recorded workout/step session. Produced by Person 2's pedometer layer. */
export interface WorkoutEvent {
  id: string;
  timestamp: string;        // ISO
  steps: number;
  source: 'pedometer' | 'debug-injected'; // debug-injected = the demo safety button
  verified: boolean;
  gait?: GaitAnalysis;
}

/** Explainable summary of a raw phone-IMU walking session. Not a medical assessment. */
export interface GaitAnalysis {
  isVerified: boolean;
  confidence: number;
  reason: string;
  durationS: number;
  sampleRateHz: number;
  cadenceSpm: number;
  periodicity: number;
  motionStd: number;
  gyroEnergy: number;
  estimatedSteps: number;
  reportedSteps: number | null;
  stepAgreement: number;
  sampleCount: number;
}

/** A step threshold that unlocks a % of the locked deposit. Owned by Person 2. */
export interface UnlockRule {
  id: string;
  label: string;            // e.g. "5,000 steps"
  stepThreshold: number;
  unlockPercent: number;    // 0–1, portion of *current locked balance*
}

/** Result of running a WorkoutEvent through the unlock rules. */
export interface UnlockResult {
  unlockedAmount: number;
  ruleApplied: UnlockRule | null;
  newStreak: number;
}

/** Stub partner reward — no real redemption, just UI + data for the demo. */
export interface RewardPartner {
  id: string;
  name: string;
  logoEmoji: string;        // swap for a real logo asset later
  creditCost: number;
  description: string;
}

/** Live pedometer status, consumed by Person 1's UI. */
export interface PedometerReading {
  steps: number;
  isAvailable: boolean;
  isTracking: boolean;
}
