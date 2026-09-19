/// <reference types="jest" />
import {
  SEED_CHALLENGE_FRESH,
  SEED_CHALLENGE_MIDWAY,
  SEED_CHALLENGE_COMPLETED,
  SEED_CHALLENGES,
} from '@/store/seedData';
import { getChallengeSummary, isChallengeComplete } from '@/store/challengeEngine';

const today = () => new Date().toISOString().slice(0, 10);

describe('seed data', () => {
  it('fresh seed is an untouched day-1 challenge starting today', () => {
    expect(SEED_CHALLENGE_FRESH.status).toBe('active');
    expect(SEED_CHALLENGE_FRESH.startDate).toBe(today());
    expect(SEED_CHALLENGE_FRESH.days.every(d => d.status === 'pending')).toBe(true);
    expect(getChallengeSummary(SEED_CHALLENGE_FRESH).daysRemaining).toBe(
      SEED_CHALLENGE_FRESH.totalDays
    );
  });

  it('midway seed has hits plus one miss, with today still pending', () => {
    expect(SEED_CHALLENGE_MIDWAY.status).toBe('active');
    expect(SEED_CHALLENGE_MIDWAY.days.filter(d => d.status === 'missed')).toHaveLength(1);

    const s = getChallengeSummary(SEED_CHALLENGE_MIDWAY);
    expect(s.daysCompleted).toBe(9);
    expect(s.daysRemaining).toBe(11);
    expect(s.forfeitedAmount).toBe(5);

    const nextPending = SEED_CHALLENGE_MIDWAY.days.find(d => d.status === 'pending');
    expect(nextPending!.date).toBe(today());
  });

  it('completed seed is fully resolved with a partial refund', () => {
    expect(SEED_CHALLENGE_COMPLETED.status).toBe('completed');
    expect(isChallengeComplete(SEED_CHALLENGE_COMPLETED)).toBe(true);

    const s = getChallengeSummary(SEED_CHALLENGE_COMPLETED);
    expect(s.daysRemaining).toBe(0);
    expect(s.forfeitedAmount).toBe(3);
    expect(s.refundableAmount).toBe(42);
    expect(Math.round((s.forfeitedAmount + s.refundableAmount) * 100)).toBe(
      Math.round(SEED_CHALLENGE_COMPLETED.depositAmount * 100)
    );
  });

  it('exports all seeds in SEED_CHALLENGES', () => {
    expect(SEED_CHALLENGES).toEqual([
      SEED_CHALLENGE_FRESH,
      SEED_CHALLENGE_MIDWAY,
      SEED_CHALLENGE_COMPLETED,
    ]);
  });
});
