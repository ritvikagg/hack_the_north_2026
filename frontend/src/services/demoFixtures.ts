import type { Challenge, DemoState, Run } from '../domain/models';

const DAY = 24 * 60 * 60 * 1000;

/** Entirely simulated data. Dates are relative so a fresh demo is always playable. */
export function createDemoState(now = new Date()): DemoState {
  const timestamp = (offset: number) => new Date(now.getTime() + offset * DAY).toISOString();
  const active: Challenge = {
    id: 'weekly-stride', title: 'The weekly stride', mode: 'party',
    dailyStepGoal: 10000, requiredDays: 15, pledgeMinor: 500, currency: 'CAD',
    hostId: 'you', groupId: 'sunday-people', status: 'active',
    createdAt: timestamp(-5), startsAt: timestamp(-4), endsAt: timestamp(11),
    inviteCode: 'WEEKLY',
    participants: [
      { userId: 'you', completedDays: 2 }, { userId: 'maya', completedDays: 3 },
      { userId: 'josh', completedDays: 1 }, { userId: 'emma', completedDays: 0 },
    ],
    payouts: [],
  };
  const lobby: Challenge = {
    id: 'scenic-lobby', title: 'A little momentum', mode: 'party',
    dailyStepGoal: 7500, requiredDays: 10, pledgeMinor: 500, currency: 'CAD',
    hostId: 'maya', groupId: 'sunday-people', status: 'lobby', createdAt: timestamp(-1),
    startsAt: null, endsAt: null, inviteCode: 'STRIDE',
    participants: [{ userId: 'maya', completedDays: 0 }, { userId: 'josh', completedDays: 0 }],
    payouts: [],
  };
  const runs: Run[] = active.participants.flatMap((participant) =>
    Array.from({ length: participant.completedDays }, (_, index) => ({
      id: `sample-${participant.userId}-${index}`, challengeId: active.id,
      userId: participant.userId, steps: active.dailyStepGoal + index * 250,
      completedAt: timestamp(-3 + index),
      verification: 'verified' as const, countsTowardGoal: true,
    })),
  );
  return {
    version: 1, hasEntered: false, currentUserId: 'you',
    users: [
      { id: 'you', name: 'Ryan', initials: 'R', color: '#DDEAA4' },
      { id: 'maya', name: 'Maya', initials: 'M', color: '#F1CFBA' },
      { id: 'josh', name: 'Josh', initials: 'J', color: '#C9DCE2' },
      { id: 'emma', name: 'Emma', initials: 'E', color: '#DDD0E9' },
    ],
    challenges: [active, lobby],
    groups: [{
      id: 'sunday-people', name: 'Sunday people',
      description: 'Good company. A little momentum.',
      memberIds: ['you', 'maya', 'josh', 'emma'], inviteCode: 'SUNDAY', color: '#E7EDD5',
    }],
    runs,
  };
}
