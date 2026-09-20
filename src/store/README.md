# Persisted state and challenge engine

`useAppStore` owns phone workout history and the separate walking wallet. `useChallengeStore` owns the personal 15–30 day step pledge and completed history. Social pots use `src/state/DemoProvider.tsx`. These are local stores, not a server.

The root app waits for both Zustand stores to hydrate before rendering actionable screens. Read failures have a retry screen; write failures show a save warning and retain queued writes for retry. Keys from the original app are retained.

## Personal steps

Call `startChallenge(depositAmount, totalDays, dailyThreshold)` to create a pledge. Values are CAD dollars, whole days (15–30), and whole steps. The engine splits the deposit in cents, with remainder cents on the last day.

The workout screen creates a `WorkoutEvent` with a unique capture id, start/end times, source, gait analysis, and the active personal challenge id at the beginning of the recording. `useAppStore.logWorkout(event)` records it once and computes wallet unlocks internally. It no longer accepts caller-provided unlock amounts or streaks.

Then call `useChallengeStore.getState().syncWorkouts(useAppStore.getState().workouts)`. The runtime also replays reconciliation after hydration, on foregrounding, every 30 seconds, and after saved activity changes. This recovers if the process stops between the two store writes.

Only pedometer-sourced, gait-verified sessions matching the challenge id and a single UTC date count. Duplicate ids, old sessions, debug inputs and unverified sessions cannot earn credit. A pending day stays pending below its goal until UTC midnight; elapsed pending days resolve as missed. Reaching the goal resolves a hit. Completed pledges move into history once. Resolved outcomes cannot be rewritten.

`recordDayResult` remains the explicit low-level engine wrapper for scripted outcomes; the phone flow uses `syncWorkouts` to avoid marking an unfinished day missed prematurely. `devFastForward` is available only in development and is exposed under clearly marked demo controls in the step screen. `resetDemo` clears the personal challenge and history.

## Wallet and other features

The walking wallet applies only the highest matching `UNLOCK_RULES` tier to its own remaining balance once per unique validated session. Its money never comes from a social pot or daily pledge. `reset` clears wallet balances and workout history. The UI requires confirmation before resetting those stores together.

`seedData.ts` remains available for UI tests and fixtures, but the personal challenge UI reads the actual store. `DEMO.md` describes the original scripted engine demo; the root README covers the unified app's phone walkthrough.
