/// <reference types="jest" />
import {
  createChallenge,
  resolveDay,
  getChallengeSummary,
  isChallengeComplete,
} from '@/store/challengeEngine';
import { Challenge } from '@/types/challenge';

const START = '2026-09-19';

function resolveAll(challenge: Challenge, result: 'hit' | 'missed'): Challenge {
  return challenge.days.reduce(
    (c, d) => resolveDay(c, d.date, result),
    challenge
  );
}

describe('createChallenge', () => {
  it('creates totalDays pending days with sequential dates', () => {
    const c = createChallenge(150, 15, 5000, START);
    expect(c.days).toHaveLength(15);
    expect(c.days.every(d => d.status === 'pending')).toBe(true);
    expect(c.days[0].date).toBe(START);
    expect(c.days[14].date).toBe('2026-10-03');
    expect(c.startDate).toBe(START);
    expect(c.status).toBe('active');
    expect(c.dailyGoal).toEqual({ type: 'steps', threshold: 5000 });
    expect(c.depositAmount).toBe(150);
  });

  it('defaults startDate to today when omitted', () => {
    const c = createChallenge(150, 15, 5000);
    expect(c.startDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it('splits an evenly divisible deposit into equal stakes', () => {
    const c = createChallenge(150, 15, 5000, START);
    expect(c.days.every(d => d.stakeAmount === 10)).toBe(true);
  });

  it('puts remainder cents on the last day so stakes sum exactly', () => {
    const c = createChallenge(100, 30, 5000, START);
    // 10000c / 30 → 333c base, last day gets 10000 - 333*29 = 343c
    expect(c.days.slice(0, 29).every(d => d.stakeAmount === 3.33)).toBe(true);
    expect(c.days[29].stakeAmount).toBe(3.43);
    const sum = c.days.reduce((s, d) => s + Math.round(d.stakeAmount * 100), 0);
    expect(sum).toBe(10000);
  });

  it('sums exactly for awkward deposits (e.g. 29.99 over 15 days)', () => {
    const c = createChallenge(29.99, 15, 5000, START);
    // 2999c / 15 → 199c base, last day gets 2999 - 199*14 = 213c
    expect(c.days.slice(0, 14).every(d => d.stakeAmount === 1.99)).toBe(true);
    expect(c.days[14].stakeAmount).toBe(2.13);
    const sum = c.days.reduce((s, d) => s + Math.round(d.stakeAmount * 100), 0);
    expect(sum).toBe(2999);
  });

  it('accepts boundary totalDays values 15 and 30', () => {
    expect(createChallenge(15, 15, 1, START).days).toHaveLength(15);
    expect(createChallenge(30, 30, 1, START).days).toHaveLength(30);
  });

  it.each([14, 31, 15.5, 0, -10, NaN])(
    'rejects invalid totalDays %p',
    totalDays => {
      expect(() => createChallenge(100, totalDays, 5000, START)).toThrow(/totalDays/);
    }
  );

  it.each([0, -50, NaN, Infinity])(
    'rejects invalid depositAmount %p',
    deposit => {
      expect(() => createChallenge(deposit, 15, 5000, START)).toThrow(/depositAmount/);
    }
  );

  it.each([0, -1, NaN])('rejects invalid dailyThreshold %p', threshold => {
    expect(() => createChallenge(100, 15, threshold, START)).toThrow(/dailyThreshold/);
  });

  it.each(['not-a-date', '09/19/2026', '2026-02-30', '2026-13-01'])(
    'rejects invalid startDate %p',
    date => {
      expect(() => createChallenge(100, 15, 5000, date)).toThrow(/startDate/);
    }
  );
});

describe('resolveDay', () => {
  it('marks a day hit and records actualSteps without mutating the original', () => {
    const c = createChallenge(150, 15, 5000, START);
    const next = resolveDay(c, START, 'hit', 7231);

    expect(next).not.toBe(c);
    expect(next.days[0]).toMatchObject({ date: START, status: 'hit', actualSteps: 7231 });
    expect(next.days[1].status).toBe('pending');
    // original untouched
    expect(c.days[0].status).toBe('pending');
    expect(c.days[0].actualSteps).toBeUndefined();
    expect(next.status).toBe('active');
  });

  it('marks a day missed', () => {
    const c = createChallenge(150, 15, 5000, START);
    const next = resolveDay(c, START, 'missed');
    expect(next.days[0].status).toBe('missed');
    expect(next.days[0].actualSteps).toBeUndefined();
  });

  it('throws for a date outside the challenge', () => {
    const c = createChallenge(150, 15, 5000, START);
    expect(() => resolveDay(c, '2030-01-01', 'hit')).toThrow(/no day/);
  });

  it('throws for an invalid result', () => {
    const c = createChallenge(150, 15, 5000, START);
    // @ts-expect-error runtime validation of bad input
    expect(() => resolveDay(c, START, 'skipped')).toThrow(/result/);
  });

  it('completes once every day is resolved, even with misses mixed in', () => {
    let c = createChallenge(150, 15, 5000, START);
    c = resolveDay(c, c.days[0].date, 'missed');
    for (let i = 1; i < 14; i++) c = resolveDay(c, c.days[i].date, 'hit');
    expect(c.status).toBe('active');
    c = resolveDay(c, c.days[14].date, 'hit');
    expect(c.status).toBe('completed');
  });

  it('completes even when every day was missed', () => {
    const c = resolveAll(createChallenge(150, 15, 5000, START), 'missed');
    expect(c.status).toBe('completed');
  });
});

describe('getChallengeSummary', () => {
  it('returns zeros and full daysRemaining on a fresh challenge', () => {
    const s = getChallengeSummary(createChallenge(150, 15, 5000, START));
    expect(s).toEqual({
      forfeitedAmount: 0,
      refundableAmount: 0,
      daysRemaining: 15,
      currentStreak: 0,
      daysCompleted: 0,
    });
  });

  it('rolls up hits, misses, and streak', () => {
    let c = createChallenge(150, 15, 5000, START);
    c = resolveDay(c, c.days[0].date, 'hit');
    c = resolveDay(c, c.days[1].date, 'hit');
    c = resolveDay(c, c.days[2].date, 'missed');
    c = resolveDay(c, c.days[3].date, 'hit');

    const s = getChallengeSummary(c);
    expect(s.refundableAmount).toBe(30);
    expect(s.forfeitedAmount).toBe(10);
    expect(s.daysCompleted).toBe(4);
    expect(s.daysRemaining).toBe(11);
    expect(s.currentStreak).toBe(1);
  });

  it('reports a streak of consecutive hits ending at the last resolved day', () => {
    let c = createChallenge(150, 15, 5000, START);
    for (let i = 0; i < 5; i++) c = resolveDay(c, c.days[i].date, 'hit');
    expect(getChallengeSummary(c).currentStreak).toBe(5);

    c = resolveDay(c, c.days[5].date, 'missed');
    expect(getChallengeSummary(c).currentStreak).toBe(0);

    c = resolveDay(c, c.days[6].date, 'hit');
    c = resolveDay(c, c.days[7].date, 'hit');
    expect(getChallengeSummary(c).currentStreak).toBe(2);
  });

  it('forfeits and refunds exactly the deposit across a mixed run', () => {
    let c = createChallenge(100, 30, 5000, START);
    c = resolveDay(c, c.days[29].date, 'missed'); // last day holds the remainder
    c = c.days.slice(0, 29).reduce((acc, d) => resolveDay(acc, d.date, 'hit'), c);

    const s = getChallengeSummary(c);
    expect(s.forfeitedAmount).toBe(3.43);
    expect(s.refundableAmount).toBe(96.57);
    expect(Math.round((s.forfeitedAmount + s.refundableAmount) * 100)).toBe(10000);
    expect(s.daysRemaining).toBe(0);
    expect(s.daysCompleted).toBe(30);
  });
});

describe('isChallengeComplete', () => {
  it('is false on a fresh challenge and mid-run, true once all days resolve', () => {
    let c = createChallenge(150, 15, 5000, START);
    expect(isChallengeComplete(c)).toBe(false);

    c = resolveDay(c, c.days[0].date, 'hit');
    expect(isChallengeComplete(c)).toBe(false);

    c = resolveAll(c, 'hit');
    expect(isChallengeComplete(c)).toBe(true);
    expect(c.status).toBe('completed');
  });

  it('is true for an all-missed challenge', () => {
    const c = resolveAll(createChallenge(150, 15, 5000, START), 'missed');
    expect(isChallengeComplete(c)).toBe(true);
  });
});
