import type { GaitAnalysis, WorkoutEvent } from '../types';
import type { Challenge } from '../types/challenge';
import { resolveDay } from '../store/challengeEngine';

export const utcDate = (date = new Date()) => date.toISOString().slice(0, 10);

export function makeWorkout(input: {
  id: string; startedAt: string; timestamp: string; steps: number;
  debug: boolean; gait: GaitAnalysis; challengeId?: string;
}): WorkoutEvent {
  const steps = Number.isFinite(input.steps) ? Math.max(0, Math.floor(input.steps)) : 0;
  return {
    id: input.id, startedAt: input.startedAt, timestamp: input.timestamp, steps,
    challengeId: input.challengeId, source: input.debug ? 'debug-injected' : 'pedometer',
    verified: !input.debug && steps > 0 && input.gait.isVerified,
    gait: input.gait,
  };
}

export function eligibleWorkout(event: WorkoutEvent) {
  return event.source === 'pedometer' && event.verified && event.gait?.isVerified === true
    && Number.isSafeInteger(event.steps) && event.steps > 0;
}

export function stepsForDay(challenge: Challenge, workouts: WorkoutEvent[], date: string) {
  const seen = new Set<string>();
  return workouts.reduce((sum, event) => {
    if (seen.has(event.id)) return sum;
    seen.add(event.id);
    // No historical or cross-midnight sessions are reassigned to a new pledge.
    if (!eligibleWorkout(event) || event.challengeId !== challenge.id || !event.startedAt
      || event.startedAt.slice(0, 10) !== date || event.timestamp.slice(0, 10) !== date) return sum;
    return sum + event.steps;
  }, 0);
}

/** Replay persisted workouts, so a restart between store writes cannot lose credit. */
export function reconcileStepChallenge(challenge: Challenge, workouts: WorkoutEvent[], now = new Date()) {
  const today = utcDate(now);
  let next = challenge;
  for (const day of challenge.days) {
    if (day.status !== 'pending' || day.date > today) continue;
    const steps = stepsForDay(challenge, workouts, day.date);
    if (steps >= challenge.dailyGoal.threshold) next = resolveDay(next, day.date, 'hit', steps);
    else if (day.date < today) next = resolveDay(next, day.date, 'missed', steps);
    else if (day.actualSteps !== steps) {
      next = { ...next, days: next.days.map(d => d.date === day.date ? { ...d, actualSteps: steps } : d) };
    }
  }
  return next;
}
