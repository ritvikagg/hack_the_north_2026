/// <reference types="jest" />
import { useAppStore } from './useAppStore';
import { useChallengeStore } from './useChallengeStore';
import { createChallenge } from './challengeEngine';
import { makeWorkout, reconcileStepChallenge, stepsForDay } from '../lib/activity';
import type { GaitAnalysis } from '../types';
import { deviceStorage, retryStorage, useStorageStatus } from './storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));
const gait: GaitAnalysis = {
  isVerified: true, confidence: .9, reason: 'Consistent', durationS: 1200, sampleRateHz: 50,
  cadenceSpm: 100, periodicity: .9, motionStd: 1, gyroEnergy: .1,
  estimatedSteps: 2000, reportedSteps: 2000, stepAgreement: 1, sampleCount: 60000,
};
const event = (id: string, steps: number, challengeId = 'personal', debug = false) => makeWorkout({
  id, steps, challengeId, debug, gait,
  startedAt: '2026-09-19T10:00:00Z', timestamp: '2026-09-19T10:20:00Z',
});
beforeEach(() => { useAppStore.getState().reset(); useChallengeStore.getState().resetDemo(); });

test('real sessions accumulate into a daily hit; debug, rejected and duplicate sessions do not', () => {
  const challenge = { ...createChallenge(30, 15, 4000, '2026-09-19'), id: 'personal' };
  const first = event('a', 2000);
  const rejected = { ...event('rejected', 9000), gait: { ...gait, isVerified: false } };
  const list = [first, first, event('debug', 8000, 'personal', true), rejected, event('wrong-challenge', 8000, 'other')];
  expect(stepsForDay(challenge, list, '2026-09-19')).toBe(2000);
  let next = reconcileStepChallenge(challenge, list, new Date('2026-09-19T11:00:00Z'));
  expect(next.days[0]).toMatchObject({ status: 'pending', actualSteps: 2000 });
  next = reconcileStepChallenge(next, [...list, event('b', 2000)], new Date('2026-09-19T12:00:00Z'));
  expect(next.days[0]).toMatchObject({ status: 'hit', actualSteps: 4000 });
  expect(challenge.days[0].status).toBe('pending');
});

test('recovery resolves elapsed days, leaves future days pending and never reassigns cross-midnight activity', () => {
  const challenge = { ...createChallenge(30, 15, 2000, '2026-09-19'), id: 'personal' };
  const crossing = { ...event('crossing', 4000), startedAt: '2026-09-18T23:59:00Z' };
  const next = reconcileStepChallenge(challenge, [crossing], new Date('2026-09-20T01:00:00Z'));
  expect(next.days[0]).toMatchObject({ status: 'missed', actualSteps: 0 });
  expect(next.days[1].status).toBe('pending');
  expect(next.days[2].actualSteps).toBeUndefined();
});

test('workout logging applies unlock rules once, conserves cents, and ignores debug credit', () => {
  const store = () => useAppStore.getState();
  store().addDeposit(50);
  store().logWorkout(event('a', 2000));
  store().logWorkout(event('a', 2000));
  expect(store().workouts).toHaveLength(1);
  expect(store().user.lockedAmount).toBe(45);
  expect(store().user.unlockedAmount).toBe(5);
  store().logWorkout(event('debug', 8000, 'personal', true));
  expect(store().workouts[1].verified).toBe(false);
  expect(store().user.unlockedAmount).toBe(5);
  expect(store().user.lockedAmount + store().user.unlockedAmount).toBe(50);
  expect(() => store().addDeposit(-1)).toThrow();
});

test('a short verified walk is activity even below the first money tier', () => {
  useAppStore.getState().logWorkout(event('short', 25));
  expect(useAppStore.getState().workouts[0]).toMatchObject({ verified: true, unlockedAmount: 0 });
});

test('backend model scores persist without awarding money twice or rewriting phone verification', () => {
  const store = () => useAppStore.getState();
  store().addDeposit(50); store().logWorkout(event('scored', 2000));
  const before = store().user;
  const score = { model_type: 'prototype', positive_class: 'genuine' as const, genuine_probability: .2, decision: 'altered_gait' as const, feature_values: { duration_s: 20 }, limitations: [] };
  store().attachBackendScore('scored', score);
  store().attachBackendScore('scored', score);
  expect(store().workouts).toHaveLength(1);
  expect(store().workouts[0].backendScore?.decision).toBe('altered_gait');
  expect(store().workouts[0].verified).toBe(true);
  expect(store().user).toEqual(before);
});

test('stored workouts replay after restart and completed daily pledges move to history once', () => {
  const challenge = { ...createChallenge(30, 15, 2000, '2026-09-19'), id: 'personal' };
  useChallengeStore.setState({ activeChallenge: challenge, challengeHistory: [] });
  useAppStore.getState().logWorkout(event('a', 2000));
  const workouts = useAppStore.getState().workouts;
  useChallengeStore.getState().syncWorkouts(workouts, new Date('2026-10-04T10:00:00Z'));
  expect(useChallengeStore.getState().activeChallenge).toBeNull();
  expect(useChallengeStore.getState().challengeHistory[0].days[0].status).toBe('hit');
  expect(useChallengeStore.getState().challengeHistory[0].days.slice(1).every(d => d.status === 'missed')).toBe(true);
  useChallengeStore.getState().syncWorkouts(workouts, new Date('2026-10-04T10:00:00Z'));
  expect(useChallengeStore.getState().challengeHistory).toHaveLength(1);
});

test('persisted activity and balances hydrate together', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  useAppStore.getState().addDeposit(50);
  useAppStore.getState().logWorkout(event('saved', 2000));
  const snapshot = { user: useAppStore.getState().user, workouts: useAppStore.getState().workouts };
  storage.getItem.mockResolvedValueOnce(JSON.stringify({ state: snapshot, version: 0 }));
  useAppStore.getState().reset();
  await useAppStore.persist.rehydrate();
  expect(useAppStore.getState().workouts[0].id).toBe('saved');
  expect(useAppStore.getState().user.unlockedAmount).toBe(5);
});

test('a failed write is visible and can be retried without losing the queued state', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  await deviceStorage.setItem('integration-test', 'saved-value');
  expect(useStorageStatus.getState().error).toMatch(/not saved/);
  await retryStorage();
  expect(storage.setItem).toHaveBeenLastCalledWith('integration-test', 'saved-value');
  expect(useStorageStatus.getState().error).toBeNull();
});

test('a malformed saved state surfaces a loading error rather than an endless spinner', async () => {
  const storage = require('@react-native-async-storage/async-storage').default;
  storage.getItem.mockResolvedValueOnce('{bad json');
  await useAppStore.persist.rehydrate();
  expect(useStorageStatus.getState().readFailed).toBe(true);
  useStorageStatus.setState({ readFailed: false, error: null });
});
