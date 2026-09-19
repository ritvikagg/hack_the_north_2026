// ─────────────────────────────────────────────────────────────────
// PERSON 2 owns this file.
// Simple stand-in for the deck's "AI verification" (P2/P3) — a
// threshold table. Good enough for a demo; label it "MVP version"
// on stage if asked.
// ─────────────────────────────────────────────────────────────────
import { UnlockRule, UnlockResult } from '../types';

export const UNLOCK_RULES: UnlockRule[] = [
  { id: 'tier1', label: '2,000 steps', stepThreshold: 2000, unlockPercent: 0.10 },
  { id: 'tier2', label: '5,000 steps', stepThreshold: 5000, unlockPercent: 0.30 },
  { id: 'tier3', label: '8,000 steps', stepThreshold: 8000, unlockPercent: 0.60 },
];

/** Given today's step count, figure out how much of the locked balance unlocks. */
export function evaluateUnlock(
  steps: number,
  lockedAmount: number,
  currentStreak: number
): UnlockResult {
  const ruleApplied = [...UNLOCK_RULES].reverse().find(r => steps >= r.stepThreshold) ?? null;

  const unlockedAmount = ruleApplied
    ? Math.round(lockedAmount * ruleApplied.unlockPercent * 100) / 100
    : 0;

  const newStreak = ruleApplied ? currentStreak + 1 : 0;

  return { unlockedAmount, ruleApplied, newStreak };
}
