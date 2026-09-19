# `src/store/` — app state & challenge engine

This folder holds the app's client-side state (zustand + AsyncStorage
persistence — no backend for the demo).

## What's here

| File | Purpose |
|---|---|
| `useAppStore.ts` | Existing user/deposit/workout store (Person 3). |
| `challengeEngine.ts` | Pure challenge logic — no side effects, no storage. |
| `useChallengeStore.ts` | Persisted zustand store wrapping the engine. |
| `*.test.ts` | Jest tests (`npm test`). |
| `README.md` | This file. |

## Challenge engine (`feature/challenge-engine`)

The savings-commitment challenge: a user deposits money, commits to a
daily step goal for 15–30 days, and forfeits one day's slice of the
deposit (`depositAmount / totalDays`) for each missed day. Hit every
day and the full deposit is refunded.

Shared types live in `src/types/challenge.ts` — import them as:

```ts
import { Challenge, DayRecord, ChallengeSummary } from '@/types/challenge';
```

- `Challenge` — one active/finished commitment, with a `DayRecord` per day.
- `DayRecord` — a single day's outcome (`pending` / `hit` / `missed`) and its stake.
- `ChallengeSummary` — derived rollup for UI (forfeited, refundable, streak, etc.).

## Using the store (`useChallengeStore.ts`)

State: `activeChallenge: Challenge | null`, `challengeHistory: Challenge[]`.
Both are persisted to AsyncStorage, so a challenge survives app restarts.

### Start a challenge (UI teammate)

```tsx
import { useChallengeStore } from '@/store/useChallengeStore';

function DepositScreen() {
  const startChallenge = useChallengeStore(s => s.startChallenge);

  const onConfirm = () => {
    // $50 deposit, 15 days, 5,000 steps/day.
    // Throws if a challenge is already active, or on bad input —
    // wrap in try/catch to show a message.
    startChallenge(50, 15, 5000);
  };
  // ...
}
```

### Read challenge state

```tsx
const challenge = useChallengeStore(s => s.activeChallenge);
const summary = useChallengeStore(s => s.getSummary)(); // or getState().getSummary()
// summary → { forfeitedAmount, refundableAmount, daysRemaining,
//             currentStreak, daysCompleted } or null
```

### Resolve a day (step-tracking teammate)

After computing a day's pedometer total, compare it to the challenge's
`dailyGoal.threshold` and record the result. Pass the real step count so
it's stored on the `DayRecord`.

```ts
import { useChallengeStore } from '@/store/useChallengeStore';

const challenge = useChallengeStore.getState().activeChallenge;
if (challenge) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const hit = stepsToday >= challenge.dailyGoal.threshold;
  useChallengeStore.getState().recordDayResult(date, hit ? 'hit' : 'missed', stepsToday);
}
```

When the last pending day resolves, the finished challenge is moved to
`challengeHistory` and `activeChallenge` becomes `null`.

### Demo helpers

- `resetDemo()` — wipes `activeChallenge` + `challengeHistory` (and the
  persisted copy). Call between demo runs.
- `devFastForward(days, results?)` — **dev-only**. Auto-resolves the next
  N pending days (scripted `results` or random hit/miss) so you can show a
  mid-challenge or near-complete state on stage. No-op in production builds.
