import type { Challenge, CreateChallengeInput, DemoState } from '../domain/models';
import { createDemoState } from './demoFixtures';

export type DemoAction =
  | { type: 'create'; input: CreateChallengeInput }
  | { type: 'join'; code: string }
  | { type: 'start' | 'addFriend' | 'demoHostStart' | 'addDay' | 'settle'; id: string }
  | { type: 'reset' };

export const STEP_GOAL_MIN = 1000;
export const STEP_GOAL_MAX = 50000;
export const REQUIRED_DAYS_MIN = 1;
export const REQUIRED_DAYS_MAX = 60;

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validStepGoal(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= STEP_GOAL_MIN && (value as number) <= STEP_GOAL_MAX;
}

function validRequiredDays(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= REQUIRED_DAYS_MIN && (value as number) <= REQUIRED_DAYS_MAX;
}

// Everyone who completes all required days gets their full deposit back.
// Pledges from unfinished participants go to charity. Nothing is partial.
export function settlePayouts(challenge: Challenge) {
  const payouts = challenge.participants.map((person) => {
    const finished = person.completedDays >= challenge.requiredDays;
    const totalMinor = finished ? challenge.pledgeMinor : 0;
    return { userId: person.userId, pledgeReturnedMinor: totalMinor, totalMinor };
  });
  const charityMinor = challenge.participants.length * challenge.pledgeMinor
    - payouts.reduce((sum, p) => sum + p.totalMinor, 0);
  return { payouts, charityMinor };
}

function finishIfComplete(challenge: Challenge, now: Date) {
  if (challenge.status === 'active' && challenge.participants.every((p) => p.completedDays >= challenge.requiredDays)) {
    challenge.status = 'settled';
    if (!challenge.endsAt || Date.parse(challenge.endsAt) > now.getTime()) challenge.endsAt = now.toISOString();
    Object.assign(challenge, settlePayouts(challenge));
  }
}

export function transition(previous: DemoState, action: DemoAction, now = new Date()): { state: DemoState; id?: string } {
  if (action.type === 'reset') return { state: createDemoState(now) };
  const state: DemoState = JSON.parse(JSON.stringify(previous));
  const me = state.currentUserId;
  if (action.type === 'create') {
    const { mode, dailyStepGoal, requiredDays, pledgeMinor, groupId } = action.input;
    requireRule(validStepGoal(dailyStepGoal), `Choose a daily step goal between ${STEP_GOAL_MIN.toLocaleString()} and ${STEP_GOAL_MAX.toLocaleString()}.`);
    requireRule(validRequiredDays(requiredDays), `Choose a duration between ${REQUIRED_DAYS_MIN} and ${REQUIRED_DAYS_MAX} days.`);
    requireRule([500, 1000, 2000].includes(pledgeMinor), 'Choose a $5, $10, or $20 pledge.');
    requireRule(!groupId || state.groups.some((g) => g.id === groupId && g.memberIds.includes(me)), 'That group is unavailable.');
    const solo = mode === 'solo';
    const number = state.challenges.length + 1;
    const id = `challenge-${now.getTime()}-${number}`;
    state.challenges.unshift({
      id, title: solo ? 'My step promise' : 'Our step promise', mode: solo ? 'solo' : 'party',
      dailyStepGoal, requiredDays, pledgeMinor, currency: 'CAD', hostId: me,
      groupId: solo ? null : groupId ?? null, status: solo ? 'active' : 'lobby',
      createdAt: now.toISOString(), startsAt: solo ? now.toISOString() : null,
      endsAt: solo ? new Date(now.getTime() + requiredDays * 86400000).toISOString() : null,
      inviteCode: `PLEDGE${number}`, participants: [{ userId: me, completedDays: 0 }], payouts: [],
    });
    return { state, id };
  }
  if (action.type === 'join') {
    const challenge = state.challenges.find((c) => c.inviteCode === action.code.trim().toUpperCase());
    requireRule(challenge, 'No pot found. Try the demo invite code STRIDE.');
    if (challenge.participants.some((p) => p.userId === me)) return { state, id: challenge.id };
    requireRule(challenge.status === 'lobby', 'This challenge has started. Joining is closed.');
    challenge.participants.push({ userId: me, completedDays: 0 });
    return { state, id: challenge.id };
  }
  const challenge = state.challenges.find((c) => c.id === action.id);
  requireRule(challenge, 'Challenge not found.');
  const member = challenge.participants.find((p) => p.userId === me);
  requireRule(member, 'Join this pot before taking part.');
  const isHost = challenge.hostId === me;
  switch (action.type) {
    case 'addFriend': {
      requireRule(challenge.status === 'lobby', 'Joining is closed.');
      const friend = state.users.find((u) => !challenge.participants.some((p) => p.userId === u.id));
      requireRule(friend, 'All demo friends have joined.');
      challenge.participants.push({ userId: friend.id, completedDays: 0 });
      break;
    }
    case 'start': case 'demoHostStart': {
      requireRule(action.type === 'demoHostStart' || isHost, 'Only the host can start the challenge.');
      requireRule(challenge.status === 'lobby', 'This challenge has already started.');
      requireRule(challenge.participants.length >= 2, 'Add at least one friend before starting.');
      challenge.status = 'active'; challenge.startsAt = now.toISOString();
      challenge.endsAt = new Date(now.getTime() + challenge.requiredDays * 86400000).toISOString();
      break;
    }
    case 'addDay': {
      requireRule(challenge.status === 'active', 'The challenge is no longer accepting activity.');
      requireRule(member.completedDays < challenge.requiredDays, 'Your goal is already complete.');
      member.completedDays++;
      state.runs.unshift({ id: `run-${now.getTime()}-${state.runs.length}`, challengeId: challenge.id, userId: me,
        steps: challenge.dailyStepGoal, completedAt: now.toISOString(), verification: 'verified', countsTowardGoal: true, source: 'demo' });
      finishIfComplete(challenge, now);
      break;
    }
    case 'settle': {
      if (challenge.status === 'settled') break;
      requireRule(challenge.status === 'active', 'Start the challenge first.');
      requireRule(isHost, 'Only the host can end the challenge early.');
      challenge.endsAt = now.toISOString(); challenge.status = 'settled';
      Object.assign(challenge, settlePayouts(challenge));
      break;
    }
  }
  return { state, id: challenge.id };
}
