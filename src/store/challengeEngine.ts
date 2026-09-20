// ─────────────────────────────────────────────────────────────────
// Challenge engine — pure functions over the Challenge contract in
// src/types/challenge.ts. No side effects, no async, no storage.
//
// Money is handled in integer cents internally so stakes always sum
// exactly to depositAmount; the remainder cents land on the last day.
// ─────────────────────────────────────────────────────────────────
import { Challenge, ChallengeSummary, DayRecord } from '@/types/challenge';

const MIN_DAYS = 15;
const MAX_DAYS = 30;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toCents = (amount: number): number => Math.round(amount * 100);

const todayIso = (): string => new Date().toISOString().slice(0, 10);

function isValidIsoDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

// Day arithmetic in UTC so DST can never shift a date.
function addDays(isoDate: string, offset: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function createChallenge(
  depositAmount: number,
  totalDays: number,
  dailyThreshold: number,
  startDate?: string
): Challenge {
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    throw new Error(`depositAmount must be a positive number, got ${depositAmount}`);
  }
  if (!Number.isInteger(totalDays) || totalDays < MIN_DAYS || totalDays > MAX_DAYS) {
    throw new Error(`totalDays must be an integer between ${MIN_DAYS} and ${MAX_DAYS}, got ${totalDays}`);
  }
  if (!Number.isFinite(dailyThreshold) || dailyThreshold <= 0) {
    throw new Error(`dailyThreshold must be a positive number, got ${dailyThreshold}`);
  }

  const start = startDate ?? todayIso();
  if (!isValidIsoDate(start)) {
    throw new Error(`startDate must be a valid ISO date (YYYY-MM-DD), got "${startDate}"`);
  }

  const totalCents = toCents(depositAmount);
  const baseCents = Math.floor(totalCents / totalDays);
  const lastDayCents = totalCents - baseCents * (totalDays - 1);

  const days: DayRecord[] = Array.from({ length: totalDays }, (_, i) => ({
    date: addDays(start, i),
    status: 'pending',
    stakeAmount: (i === totalDays - 1 ? lastDayCents : baseCents) / 100,
  }));

  return {
    id: `challenge-${start}-${totalDays}d-${totalCents}c`,
    depositAmount: totalCents / 100,
    totalDays,
    dailyGoal: { type: 'steps', threshold: dailyThreshold },
    startDate: start,
    days,
    status: 'active',
  };
}

export function resolveDay(
  challenge: Challenge,
  date: string,
  result: 'hit' | 'missed',
  actualSteps?: number
): Challenge {
  if (result !== 'hit' && result !== 'missed') {
    throw new Error(`result must be 'hit' or 'missed', got "${result}"`);
  }
  const index = challenge.days.findIndex(d => d.date === date);
  if (index === -1) {
    throw new Error(`challenge ${challenge.id} has no day with date "${date}"`);
  }

  const days = challenge.days.map((d, i) =>
    i === index
      ? { ...d, status: result, ...(actualSteps !== undefined ? { actualSteps } : {}) }
      : d
  );
  const allResolved = days.every(d => d.status !== 'pending');

  return {
    ...challenge,
    days,
    status: allResolved ? 'completed' : challenge.status,
  };
}

export function getChallengeSummary(challenge: Challenge): ChallengeSummary {
  let forfeitedCents = 0;
  let refundableCents = 0;
  let daysRemaining = 0;

  for (const day of challenge.days) {
    if (day.status === 'missed') forfeitedCents += toCents(day.stakeAmount);
    else if (day.status === 'hit') refundableCents += toCents(day.stakeAmount);
    else daysRemaining += 1;
  }

  // Streak counts back from the most recent resolved day; pending days
  // after it (not yet played) are skipped, a 'missed' ends the streak.
  let i = challenge.days.length - 1;
  while (i >= 0 && challenge.days[i].status === 'pending') i -= 1;
  let currentStreak = 0;
  while (i >= 0 && challenge.days[i].status === 'hit') {
    currentStreak += 1;
    i -= 1;
  }

  return {
    forfeitedAmount: forfeitedCents / 100,
    refundableAmount: refundableCents / 100,
    daysRemaining,
    currentStreak,
    daysCompleted: challenge.days.length - daysRemaining,
  };
}

export function isChallengeComplete(challenge: Challenge): boolean {
  return challenge.days.length > 0 && challenge.days.every(d => d.status !== 'pending');
}
