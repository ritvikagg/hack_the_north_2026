// ─────────────────────────────────────────────────────────────────
// Seed data — realistic sample Challenge objects for UI development.
// Person 1: import these straight into screens to build against
// before the real store is wired in. Dates are computed relative to
// "today" at import time, so the seeds always look current (MIDWAY's
// next pending day is today, COMPLETED finished yesterday). Built via
// the real engine, so stake math is guaranteed consistent — pair with
// getChallengeSummary(seed) for the derived rollup the UI needs.
// ─────────────────────────────────────────────────────────────────
import { Challenge } from '@/types/challenge';
import { createChallenge, resolveDay } from './challengeEngine';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

// Same UTC day math as challengeEngine — duplicated here so this file
// stays importable without widening the engine's public API.
const daysAgo = (n: number): string => {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

type Outcome = { result: 'hit' | 'missed'; actualSteps: number };

function resolveInOrder(challenge: Challenge, outcomes: Outcome[]): Challenge {
  return outcomes.reduce(
    (c, o, i) => resolveDay(c, c.days[i].date, o.result, o.actualSteps),
    challenge
  );
}

/** Day 1 of 15 — $50 deposit, 5,000 steps/day, nothing resolved yet. */
export const SEED_CHALLENGE_FRESH: Challenge = createChallenge(50, 15, 5000);

/**
 * Day 10 of 20 — $100 deposit ($5/day), 7,500 steps/day. Started 9
 * days ago: 8 hits and 1 miss behind, today still pending.
 */
export const SEED_CHALLENGE_MIDWAY: Challenge = resolveInOrder(
  createChallenge(100, 20, 7500, daysAgo(9)),
  [
    { result: 'hit', actualSteps: 8230 },
    { result: 'hit', actualSteps: 9115 },
    { result: 'hit', actualSteps: 7642 },
    { result: 'missed', actualSteps: 4312 },
    { result: 'hit', actualSteps: 10204 },
    { result: 'hit', actualSteps: 7801 },
    { result: 'hit', actualSteps: 12456 },
    { result: 'hit', actualSteps: 8609 },
    { result: 'hit', actualSteps: 7953 },
  ]
);

/**
 * Finished yesterday — $45 deposit ($3/day), 10,000 steps/day. 14 hits
 * and 1 miss, so the summary shows a partial refund ($42 back, $3
 * forfeited). Use this one for the refund/history screens.
 */
export const SEED_CHALLENGE_COMPLETED: Challenge = resolveInOrder(
  createChallenge(45, 15, 10000, daysAgo(15)),
  [
    { result: 'hit', actualSteps: 11240 },
    { result: 'hit', actualSteps: 10483 },
    { result: 'hit', actualSteps: 13771 },
    { result: 'hit', actualSteps: 10012 },
    { result: 'hit', actualSteps: 12105 },
    { result: 'hit', actualSteps: 11876 },
    { result: 'missed', actualSteps: 6820 },
    { result: 'hit', actualSteps: 10932 },
    { result: 'hit', actualSteps: 13415 },
    { result: 'hit', actualSteps: 10208 },
    { result: 'hit', actualSteps: 11001 },
    { result: 'hit', actualSteps: 12547 },
    { result: 'hit', actualSteps: 10690 },
    { result: 'hit', actualSteps: 11358 },
    { result: 'hit', actualSteps: 10124 },
  ]
);

/** All seeds, in story order — handy for a challenge-list screen. */
export const SEED_CHALLENGES: Challenge[] = [
  SEED_CHALLENGE_FRESH,
  SEED_CHALLENGE_MIDWAY,
  SEED_CHALLENGE_COMPLETED,
];
