// ─────────────────────────────────────────────────────────────────
// PERSON 3 owns this file.
// Single source of truth for user + workout state, persisted locally
// (no backend needed for a hackathon demo).
// ─────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserState, WorkoutEvent } from '../types';

interface AppStore {
  user: UserState;
  workouts: WorkoutEvent[];
  addDeposit: (amount: number) => void;
  logWorkout: (event: WorkoutEvent, unlockAmount: number, newStreak: number) => void;
  reset: () => void;
}

const initialUser: UserState = {
  id: 'demo-user',
  depositBalance: 0,
  lockedAmount: 0,
  unlockedAmount: 0,
  streak: 0,
  lastWorkoutAt: null,
  createdAt: new Date().toISOString(),
};

export const useAppStore = create<AppStore>()(
  persist(
    set => ({
      user: initialUser,
      workouts: [],

      addDeposit: amount =>
        set(state => ({
          user: {
            ...state.user,
            depositBalance: state.user.depositBalance + amount,
            lockedAmount: state.user.lockedAmount + amount,
          },
        })),

      logWorkout: (event, unlockAmount, newStreak) =>
        set(state => ({
          workouts: [...state.workouts, event],
          user: {
            ...state.user,
            lockedAmount: Math.max(0, state.user.lockedAmount - unlockAmount),
            unlockedAmount: state.user.unlockedAmount + unlockAmount,
            streak: newStreak,
            lastWorkoutAt: event.timestamp,
          },
        })),

      reset: () => set({ user: initialUser, workouts: [] }),
    }),
    {
      name: 'unnamed-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
