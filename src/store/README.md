# `src/store/` — app state & challenge engine

This folder holds the app's client-side state (zustand + AsyncStorage
persistence — no backend for the demo).

## What's here

| File | Purpose |
|---|---|
| `useAppStore.ts` | Existing user/deposit/workout store (Person 3). |
| `README.md` | This file. |

## Challenge engine (in progress — `feature/challenge-engine`)

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

Only types are defined so far. The store slice / reducers that produce
and update a `Challenge` will land in this folder — build against the
types, not against any concrete store API yet.
