import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserState, WorkoutEvent } from '../types';
import { evaluateUnlock } from '../lib/unlockRules';
import { eligibleWorkout } from '../lib/activity';
import { deviceStorage, hydrationFinished } from './storage';
import { GaitScore, parseGaitScore } from '../domain/gaitScore';

interface AppStore {
  user: UserState;
  workouts: WorkoutEvent[];
  addDeposit: (amount: number) => void;
  logWorkout: (event: WorkoutEvent) => void;
  attachBackendScore: (workoutId: string, score: GaitScore) => void;
  reset: () => void;
}
const initialUser = (): UserState => ({
  id: 'demo-user', depositBalance: 0, lockedAmount: 0, unlockedAmount: 0,
  streak: 0, lastWorkoutAt: null, createdAt: new Date().toISOString(),
});
const cents = (amount: number) => Math.round(amount * 100);
export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      user: initialUser(), workouts: [],
      addDeposit: amount => {
        if (!Number.isFinite(amount) || amount < 1 || cents(amount) > 1000000) throw new Error('Choose a deposit between $1 and $10,000.');
        set(state => ({ user: { ...state.user,
          depositBalance: (cents(state.user.depositBalance) + cents(amount)) / 100,
          lockedAmount: (cents(state.user.lockedAmount) + cents(amount)) / 100,
        } }));
      },
      logWorkout: event => {
        const { user, workouts } = get();
        if (workouts.some(workout => workout.id === event.id)) return;
        if (!Number.isSafeInteger(event.steps) || event.steps < 0 || !Number.isFinite(Date.parse(event.timestamp))) throw new Error('Invalid workout.');
        const verified = eligibleWorkout(event);
        const result = verified ? evaluateUnlock(event.steps, user.lockedAmount, user.streak)
          : { unlockedAmount: 0, newStreak: user.streak, ruleApplied: null };
        const saved = { ...event, verified, unlockedAmount: result.unlockedAmount, ruleLabel: result.ruleApplied?.label };
        set({
          workouts: [...workouts, saved],
          user: { ...user,
            lockedAmount: (cents(user.lockedAmount) - cents(result.unlockedAmount)) / 100,
            unlockedAmount: (cents(user.unlockedAmount) + cents(result.unlockedAmount)) / 100,
            streak: result.newStreak, lastWorkoutAt: event.timestamp,
          },
        });
      },
      reset: () => set({ user: initialUser(), workouts: [] }),
      attachBackendScore: (workoutId, value) => {
        const score = parseGaitScore(value);
        set(state => ({ workouts: state.workouts.map(workout => workout.id === workoutId ? { ...workout, backendScore: score } : workout) }));
      },
    }),
    { name: 'unnamed-app-storage', storage: createJSONStorage(() => deviceStorage), onRehydrateStorage: () => (state, error) => hydrationFinished(state, error),
      partialize: state => ({ user: state.user, workouts: state.workouts }) }
  )
);
