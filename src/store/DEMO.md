# Demo checklist — `feature/challenge-engine`

Goal: walk judges through a challenge ending **live** — the final day
resolves on stage and the refund screen appears.

Everything below calls `useChallengeStore` (see `README.md`). Expose
the calls behind a debug/dev-menu screen, or run them from a
`useEffect` before walking on. `devFastForward` is **dev-only** —
rehearse on a dev build, not a production bundle.

```ts
import { useChallengeStore } from '@/store/useChallengeStore';
const store = () => useChallengeStore.getState();
```

## Before you walk on stage

- [ ] **Reset.** Wipes the active challenge, history, and the persisted
      AsyncStorage copy (state survives reloads, so do this even after
      an app restart):
      `store().resetDemo()`
- [ ] **Start the challenge.** $150 deposit, 15 days, 5,000 steps/day —
      $10 at stake each day:
      `store().startChallenge(150, 15, 5000)`
- [ ] **Fast-forward to the final day.** Resolves days 1–14 (one
      scripted miss on day 5 so the forfeit mechanic is visible),
      leaving day 15 pending:

      ```ts
      store().devFastForward(14, [
        'hit', 'hit', 'hit', 'hit', 'missed',
        'hit', 'hit', 'hit', 'hit', 'hit',
        'hit', 'hit', 'hit', 'hit',
      ]);
      ```

- [ ] **Verify.** `store().getSummary()` → `daysRemaining: 1`,
      `forfeitedAmount: 10`, `refundableAmount: 130`. Open the
      last-day / "record today" screen and leave it there.

## Live on stage

- [ ] **Record the final day.** Read the remaining pending day's date
      and resolve it with the real step count:

      ```ts
      const day = store().activeChallenge!.days.find(d => d.status === 'pending')!;
      store().recordDayResult(day.date, 'hit', stepsToday);
      // or script a miss: recordDayResult(day.date, 'missed', stepsToday)
      ```

- [ ] **Refund screen.** The challenge auto-completes — `activeChallenge`
      becomes `null` and the finished challenge lands in
      `challengeHistory`:

      ```ts
      const finished = store().challengeHistory[store().challengeHistory.length - 1];
      // getChallengeSummary(finished) → refundableAmount: 140, forfeitedAmount: 10
      ```

## After each rehearsal

- [ ] `store().resetDemo()` and start from the top — `startChallenge`
      throws while a challenge is still active.

## If something goes wrong

- `devFastForward` logs a warning and does nothing → you're on a
  production build; run the demo on a dev build.
- "no active challenge" → `startChallenge` was skipped or state was
  reset; redo step 2.
- Wrong day count → `resetDemo()`, `startChallenge`, then fast-forward
  with `totalDays - 1` so exactly one day stays pending.
