/// <reference types="jest" />
import { useChallengeStore } from '@/store/useChallengeStore';

// In-memory AsyncStorage stand-in — the real module pulls in
// react-native, which isn't available under the node test env.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      clear: () => {
        store.clear();
        return Promise.resolve();
      },
    },
  };
});

const store = () => useChallengeStore.getState();

beforeEach(() => {
  useChallengeStore.getState().resetDemo();
  jest.restoreAllMocks();
});

describe('startChallenge', () => {
  it('creates an active challenge via the engine', () => {
    store().startChallenge(150, 15, 5000);
    const c = store().activeChallenge;
    expect(c).not.toBeNull();
    expect(c!.days).toHaveLength(15);
    expect(c!.status).toBe('active');
    expect(c!.dailyGoal.threshold).toBe(5000);
    expect(store().challengeHistory).toEqual([]);
  });

  it('throws when a challenge is already active', () => {
    store().startChallenge(150, 15, 5000);
    expect(() => store().startChallenge(50, 15, 5000)).toThrow(/already active/);
  });

  it('propagates engine validation errors', () => {
    expect(() => store().startChallenge(0, 15, 5000)).toThrow(/depositAmount/);
    expect(store().activeChallenge).toBeNull();
  });
});

describe('recordDayResult', () => {
  it('throws with no active challenge', () => {
    expect(() => store().recordDayResult('2026-09-19', 'hit')).toThrow(/no active challenge/);
  });

  it('resolves a day on the active challenge and records steps', () => {
    store().startChallenge(150, 15, 5000);
    const date = store().activeChallenge!.days[0].date;
    store().recordDayResult(date, 'hit', 7231);

    const day = store().activeChallenge!.days[0];
    expect(day.status).toBe('hit');
    expect(day.actualSteps).toBe(7231);
    expect(store().activeChallenge!.status).toBe('active');
  });

  it('moves a completed challenge into history and clears activeChallenge', () => {
    store().startChallenge(150, 15, 5000);
    for (const day of store().activeChallenge!.days) {
      store().recordDayResult(day.date, 'hit');
    }
    expect(store().activeChallenge).toBeNull();
    expect(store().challengeHistory).toHaveLength(1);
    expect(store().challengeHistory[0].status).toBe('completed');
  });
});

describe('getSummary', () => {
  it('returns null with no active challenge', () => {
    expect(store().getSummary()).toBeNull();
  });

  it('returns the engine summary mid-challenge', () => {
    store().startChallenge(150, 15, 5000);
    const days = store().activeChallenge!.days;
    store().recordDayResult(days[0].date, 'hit');
    store().recordDayResult(days[1].date, 'missed');

    expect(store().getSummary()).toEqual({
      forfeitedAmount: 10,
      refundableAmount: 10,
      daysRemaining: 13,
      currentStreak: 0,
      daysCompleted: 2,
    });
  });
});

describe('resetDemo', () => {
  it('clears active challenge and history', () => {
    store().startChallenge(150, 15, 5000);
    store().devFastForward(15, Array(15).fill('hit'));
    expect(store().challengeHistory).toHaveLength(1);

    store().resetDemo();
    expect(store().activeChallenge).toBeNull();
    expect(store().challengeHistory).toEqual([]);
  });
});

describe('devFastForward', () => {
  it('resolves the next N pending days in order', () => {
    store().startChallenge(150, 15, 5000);
    store().devFastForward(3, ['hit', 'missed', 'hit']);

    const days = store().activeChallenge!.days;
    expect(days[0].status).toBe('hit');
    expect(days[1].status).toBe('missed');
    expect(days[2].status).toBe('hit');
    expect(days[3].status).toBe('pending');
  });

  it('fills unspecified results randomly', () => {
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0.9); // < 0.5 → hit, else missed
    store().startChallenge(150, 15, 5000);
    store().devFastForward(2);
    const days = store().activeChallenge!.days;
    expect(days[0].status).toBe('missed');
    expect(days[1].status).toBe('missed');
    rand.mockRestore();
  });

  it('caps at the remaining pending days and completes into history', () => {
    store().startChallenge(150, 15, 5000);
    store().devFastForward(99, Array(15).fill('hit'));

    expect(store().activeChallenge).toBeNull();
    expect(store().challengeHistory).toHaveLength(1);
    expect(store().challengeHistory[0].days.every(d => d.status === 'hit')).toBe(true);
  });

  it('throws with no active challenge', () => {
    expect(() => store().devFastForward(5)).toThrow(/no active challenge/);
  });
});
