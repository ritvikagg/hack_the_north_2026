// ─────────────────────────────────────────────────────────────────
// Challenge engine types — savings-commitment challenge.
// A user deposits money, commits to a daily step goal for
// totalDays days (15–30). Missing a day forfeits that day's
// stakeAmount; hitting every day refunds the full deposit.
// Shared contract — change only with a heads-up in group chat.
// ─────────────────────────────────────────────────────────────────

export interface DayRecord {
  date: string; // ISO date, e.g. "2026-09-19"
  status: 'pending' | 'hit' | 'missed';
  stakeAmount: number; // depositAmount / totalDays
  actualSteps?: number;
}

export interface Challenge {
  id: string;
  depositAmount: number;
  totalDays: number;
  dailyGoal: { type: 'steps'; threshold: number };
  startDate: string; // ISO date
  days: DayRecord[];
  status: 'active' | 'completed' | 'abandoned';
}

export interface ChallengeSummary {
  forfeitedAmount: number;
  refundableAmount: number;
  daysRemaining: number;
  currentStreak: number;
  daysCompleted: number;
}
