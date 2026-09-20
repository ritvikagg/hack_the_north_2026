import type { Challenge, CreateChallengeInput, DemoState, Difficulty } from '../domain/models';
import { createDemoState } from './demoFixtures';

export type DemoAction =
  | { type: 'create'; input: CreateChallengeInput }
  | { type: 'join'; code: string }
  | { type: 'vote' | 'start' | 'addFriend' | 'friendVote' | 'demoHostStart' | 'addRun' | 'settle'; id: string }
  | { type: 'recordGaitRun'; id: string; gait: { steps: number; sampleCount: number; cadenceSpm: number; reason: string; durationSeconds: number } }
  | { type: 'reset' };

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Demo generation bands, not fixed difficulty-to-goal presets.
// The production service can replace this generator without changing screens.
export function generateGoal(difficulty: Difficulty, random = Math.random, previous?: Challenge) {
  const bands = { easy: [2, 3, 1000, 2000], medium: [3, 4, 2000, 3500], hard: [4, 5, 3500, 5000] } as const;
  const [minRuns, maxRuns, minMeters, maxMeters] = bands[difficulty];
  const pick = (min: number, max: number) => min + Math.floor(Math.min(.999999, Math.max(0, random())) * (max - min + 1));
  const requiredRuns = pick(minRuns, maxRuns);
  let minimumDistanceMeters = pick(minMeters / 250, maxMeters / 250) * 250;
  if (previous?.requiredRuns === requiredRuns && previous.minimumDistanceMeters === minimumDistanceMeters) {
    minimumDistanceMeters = minimumDistanceMeters >= maxMeters ? minMeters : minimumDistanceMeters + 250;
  }
  const names = ['A little momentum', 'Find your rhythm', 'The scenic route', 'The next stride', 'Good company, good miles'];
  return { title: names[pick(0, names.length - 1)], requiredRuns, minimumDistanceMeters };
}

export function settlePayouts(challenge: Challenge) {
  const winners = challenge.participants.filter((p) => p.verifiedRuns >= challenge.requiredRuns);
  const missedPot = (challenge.participants.length - winners.length) * challenge.pledgeMinor;
  const base = winners.length ? Math.floor(missedPot / winners.length) : 0;
  let remainder = winners.length ? missedPot % winners.length : 0;
  return challenge.participants.map((person) => {
    const wins = person.verifiedRuns >= challenge.requiredRuns;
    const pledgeReturnedMinor = wins || !winners.length ? challenge.pledgeMinor : 0;
    // Demo tie-break: remaining cents follow participant order; server owns this later.
    const bonusMinor = wins ? base + (remainder-- > 0 ? 1 : 0) : 0;
    return { userId: person.userId, pledgeReturnedMinor, bonusMinor, totalMinor: pledgeReturnedMinor + bonusMinor };
  });
}

export function transition(previous: DemoState, action: DemoAction, now = new Date(), random = Math.random): { state: DemoState; id?: string } {
  if (action.type === 'reset') return { state: createDemoState(now) };
  const state: DemoState = JSON.parse(JSON.stringify(previous));
  const me = state.currentUserId;
  if (action.type === 'create') {
    const { difficulty, pledgeMinor, groupId } = action.input;
    requireRule(['easy', 'medium', 'hard'].includes(difficulty), 'Choose a difficulty.');
    requireRule([500, 1000, 2000].includes(pledgeMinor), 'Choose a $5, $10, or $20 pledge.');
    requireRule(!groupId || state.groups.some((g) => g.id === groupId && g.memberIds.includes(me)), 'That group is unavailable.');
    const number = state.challenges.length + 1;
    const id = `challenge-${now.getTime()}-${number}`;
    state.challenges.unshift({ id, ...generateGoal(difficulty, random), difficulty, pledgeMinor, currency: 'CAD', hostId: me,
      groupId: groupId ?? null, status: 'lobby', createdAt: now.toISOString(), startsAt: null, endsAt: null,
      inviteCode: `PLEDGE${number}`, participants: [{ userId: me, verifiedRuns: 0 }], replacementUsed: false, replacementVotes: [], payouts: [] });
    return { state, id };
  }
  if (action.type === 'join') {
    const challenge = state.challenges.find((c) => c.inviteCode === action.code.trim().toUpperCase());
    requireRule(challenge, 'No pot found. Try the demo invite code STRIDE.');
    if (challenge.participants.some((p) => p.userId === me)) return { state, id: challenge.id };
    requireRule(challenge.status === 'lobby', 'This challenge has started. Joining is closed.');
    challenge.participants.push({ userId: me, verifiedRuns: 0 });
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
      challenge.participants.push({ userId: friend.id, verifiedRuns: 0 });
      break;
    }
    case 'vote': case 'friendVote': {
      requireRule(challenge.status === 'lobby' && !challenge.replacementUsed, 'A replacement is no longer available.');
      const voterId = action.type === 'vote' ? me : challenge.participants.find((p) => p.userId !== me && !challenge.replacementVotes.includes(p.userId))?.userId;
      requireRule(voterId, 'All demo friends have already voted.');
      if (!challenge.replacementVotes.includes(voterId)) challenge.replacementVotes.push(voterId);
      if (challenge.replacementVotes.length > challenge.participants.length / 2) {
        Object.assign(challenge, generateGoal(challenge.difficulty, random, challenge));
        challenge.replacementUsed = true;
      }
      break;
    }
    case 'start': case 'demoHostStart': {
      requireRule(action.type === 'demoHostStart' || isHost, 'Only the host can start the challenge.');
      requireRule(challenge.status === 'lobby', 'This challenge has already started.');
      requireRule(challenge.participants.length >= 2, 'Add at least one friend before starting.');
      challenge.status = 'active'; challenge.startsAt = now.toISOString();
      challenge.endsAt = new Date(now.getTime() + 7 * 86400000).toISOString();
      break;
    }
    case 'addRun': {
      requireRule(challenge.status === 'active' && new Date(challenge.endsAt!).getTime() > now.getTime(), 'The challenge is no longer accepting runs.');
      requireRule(member.verifiedRuns < challenge.requiredRuns, 'Your goal is already complete.');
      member.verifiedRuns++;
      state.runs.unshift({ id: `run-${now.getTime()}-${state.runs.length}`, challengeId: challenge.id, userId: me,
        distanceMeters: challenge.minimumDistanceMeters + 100, durationSeconds: Math.round(challenge.minimumDistanceMeters * .42),
        completedAt: now.toISOString(), verification: 'verified', countsTowardGoal: true, source: 'demo' });
      break;
    }
    case 'recordGaitRun': {
      requireRule(challenge.status === 'active' && new Date(challenge.endsAt!).getTime() > now.getTime(), 'The challenge is no longer accepting runs.');
      requireRule(member.verifiedRuns < challenge.requiredRuns, 'Your goal is already complete.');
      member.verifiedRuns++;
      state.runs.unshift({ id: `run-${now.getTime()}-${state.runs.length}`, challengeId: challenge.id, userId: me,
        distanceMeters: 0, durationSeconds: Math.max(1, Math.round(action.gait.durationSeconds)), completedAt: now.toISOString(),
        verification: 'verified', countsTowardGoal: true, source: 'gait_sensor',
        gait: { steps: action.gait.steps, sampleCount: action.gait.sampleCount, cadenceSpm: action.gait.cadenceSpm, reason: action.gait.reason } });
      break;
    }
    case 'settle': {
      if (challenge.status === 'settled') break;
      requireRule(challenge.status === 'active', 'Start the challenge first.');
      challenge.endsAt = now.toISOString(); challenge.status = 'settled'; challenge.payouts = settlePayouts(challenge);
      break;
    }
  }
  return { state, id: challenge.id };
}
