// ─────────────────────────────────────────────────────────────────
// Challenge store — zustand + AsyncStorage persistence (no backend
// for the demo). Thin wrapper over the pure functions in
// challengeEngine.ts: all challenge logic (stake math, completion,
// summaries) lives there, this file only owns state + persistence.
// ─────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { deviceStorage, hydrationFinished } from './storage';
import type { WorkoutEvent } from '../types';
import { reconcileStepChallenge } from '../lib/activity';
import { Challenge, ChallengeSummary } from '@/types/challenge';
import {
  createChallenge,
  resolveDay,
  getChallengeSummary,
  isChallengeComplete,
} from './challengeEngine';

type DayResult = 'hit' | 'missed';

// __DEV__ is defined by the React Native runtime; in jest/node fall
// back to NODE_ENV so the dev helper stays callable in tests.
declare const __DEV__: boolean;
const isDev = (): boolean =>
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

interface ChallengeStore {
  activeChallenge: Challenge | null;
  challengeHistory: Challenge[];

  startChallenge: (depositAmount: number, totalDays: number, dailyThreshold: number) => void;
  recordDayResult: (date: string, result: DayResult, actualSteps?: number) => void;
  getSummary: () => ChallengeSummary | null;
  resetDemo: () => void;
  syncWorkouts: (workouts: WorkoutEvent[], now?: Date) => void;
  devFastForward: (days: number, results?: DayResult[]) => void;
}

export const useChallengeStore = create<ChallengeStore>()(
  persist(
    (set, get) => ({
      activeChallenge: null,
      challengeHistory: [],

      startChallenge: (depositAmount, totalDays, dailyThreshold) => {
        if (get().activeChallenge) {
          throw new Error(
            'a challenge is already active — finish or resetDemo() before starting a new one'
          );
        }
        const challenge = createChallenge(depositAmount, totalDays, dailyThreshold);
        challenge.id += `-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set({ activeChallenge: challenge });
      },

      syncWorkouts: (workouts, now = new Date()) => {
        const { activeChallenge, challengeHistory } = get();
        if (!activeChallenge) return;
        const next = reconcileStepChallenge(activeChallenge, workouts, now);
        if (next === activeChallenge) return;
        if (isChallengeComplete(next)) set({ activeChallenge: null, challengeHistory: [...challengeHistory, next] });
        else set({ activeChallenge: next });
      },

      recordDayResult: (date, result, actualSteps) => {
        const { activeChallenge, challengeHistory } = get();
        if (!activeChallenge) {
          throw new Error('no active challenge — call startChallenge() first');
        }
        const next = resolveDay(activeChallenge, date, result, actualSteps);
        if (isChallengeComplete(next)) {
          set({ activeChallenge: null, challengeHistory: [...challengeHistory, next] });
        } else {
          set({ activeChallenge: next });
        }
      },

      getSummary: () => {
        const active = get().activeChallenge;
        return active ? getChallengeSummary(active) : null;
      },

      // DEMO RESET — call this between hackathon demo runs to wipe the
      // active challenge and history (also clears persisted storage).
      resetDemo: () => set({ activeChallenge: null, challengeHistory: [] }),

      // ── DEV-ONLY ─────────────────────────────────────────────────
      // Demo helper: auto-resolves the next `days` pending days so we
      // can show a mid-challenge or near-complete state on stage
      // without waiting real days. Pass `results` to script the
      // outcomes, or omit for random hit/miss. No-op outside dev.
      devFastForward: (days, results) => {
        if (!Number.isInteger(days) || days < 1) throw new Error('Choose a positive whole number of days.');
        if (!isDev()) {
          console.warn('[useChallengeStore] devFastForward is dev-only — ignoring call.');
          return;
        }
        const { activeChallenge, challengeHistory } = get();
        if (!activeChallenge) {
          throw new Error('no active challenge — call startChallenge() first');
        }

        const pending = activeChallenge.days.filter(d => d.status === 'pending');
        const count = Math.min(days, pending.length);
        let next = activeChallenge;
        for (let i = 0; i < count; i++) {
          const result = results?.[i] ?? (Math.random() < 0.5 ? 'hit' : 'missed');
          next = resolveDay(next, pending[i].date, result);
        }

        if (isChallengeComplete(next)) {
          set({ activeChallenge: null, challengeHistory: [...challengeHistory, next] });
        } else {
          set({ activeChallenge: next });
        }
      },
    }),
    {
      name: 'unnamed-app-challenge-store',
      onRehydrateStorage: () => (state, error) => hydrationFinished(state, error),
      storage: createJSONStorage(() => deviceStorage),
      partialize: state => ({
        activeChallenge: state.activeChallenge,
        challengeHistory: state.challengeHistory,
      }),
    }
  )
);
