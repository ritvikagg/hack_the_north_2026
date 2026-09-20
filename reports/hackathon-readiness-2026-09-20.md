# Hackathon readiness — September 20, 2026

## Outcome

The frontend party simulation can be demonstrated. It is not yet the complete
solo + party charity product described in the brief. Keep money simulated.

## Startup diagnosis and fixes

- Root and `frontend/` are independent Expo apps. The root has an unfinished
  deposit screen; the frontend contains the usable party experience.
- A root Expo process was already listening on 8081. Starting another app on
  that port in a noninteractive terminal exits after asking for another port.
- Frontend dependencies were absent. Installed its committed lockfile.
- Started frontend Metro on 8082; confirmed browser rendering and interaction.
- Added `npm.cmd run demo` at the root to start frontend explicitly on 8082.
- Root TypeScript was including frontend files and mixing their route types.
  Excluded the independent frontend project and added a root typecheck script.
- Expo's compatibility check found root AsyncStorage 3.1.1 where 2.2.0 is
  expected. Aligned it to 2.2.0 and updated the lockfile.
- Core Docker Supabase services are healthy. Its logging/vector container is
  restarting; this did not block the database tests or local frontend demo.
- React Native DevTools reported a download/cache error and used its fallback;
  Metro and all platform bundles still succeeded.

## Remaining findings, ordered by demo impact

1. **No usable solo flow.** `app/deposit.tsx` renders a TODO and offers no
   deposit action. `frontend/src/app/create.tsx` creates party challenges only,
   and its engine requires at least two participants to start. The root solo
   challenge engine exists and has tests, but is not wired into these screens.

2. **Charity payouts are missing and settlement policies disagree.**
   `frontend/src/services/demoEngine.ts: settlePayouts` distributes the full
   pot among finishers; it records no charity allocation. In the browser test,
   a $15 pot paid $15 to the sole finisher, including a $10 bonus. The database
   settlement instead chooses one top-step winner and applies a house cut to
   forfeited pledges only. Neither implements a charity percentage of the
   entire party pot. The solo engine calculates forfeiture without a charity
   transfer flow. Decide the percentage and participant distribution before
   aligning the demo and backend; these rules were not changed during QA.

3. **Walking verification does not enforce the advertised distance.**
   `recordGaitRun` increments the completed-run count while saving
   `distanceMeters: 0`. The sensor check accepts sufficiently consistent short
   walks (minimum 12 seconds), while challenges advertise kilometre minimums.
   The UI labels the save action as a demo run, but this is still a shortcut,
   not proof the fitness goal was achieved.

4. **Friends are simulated on one device.** The frontend provider persists
   local data using AsyncStorage; it does not call the root Supabase party
   functions. Sharing a generated invite does not synchronize another phone.
   Use the seeded STRIDE invite and demo friend controls during the pitch.

5. **Everyone failing refunds everyone.** Confirmed a two-person $20 pot
   returned $10 to each participant after zero activity. This is implemented
   intentionally in the current tests and UI, but conflicts with a general
   promise that missed goals lose money. Clarify this exception or change it.

6. **Gait onboarding documentation is stale.** Frontend README says to walk
   ten seconds, while the actual UI requires two enrolled baseline walks
   first and suggests fifteen seconds. Rehearse the phone flow before a live
   sensor demonstration.

## Verification completed

- Root: 60/60 tests passed, including solo challenge calculations and party
  client helpers. Repeated after the storage dependency change.
- Frontend: 8/8 domain tests passed.
- Local Supabase: 13/13 settlement tests passed; transactional fixtures roll back.
- Both projects: TypeScript checks passed independently.
- Frontend Expo dependency compatibility: passed.
- Frontend export: Android, iOS and web bundles succeeded.
- Browser: invalid invite error; STRIDE lookup and join; correct $15 pot;
  majority goal replacement; simulated host start; two simulated runs;
  goal completion disables further runs; $15 winner settlement; results
  survive reload; create a $10 pledge; cannot start alone; add friend;
  host start; all-fail refunds; desktop sensor-unavailable error without crash.

## Limits and demo instructions

Native phone execution, real pedometer accuracy, device permissions, network
access from a phone, and background activity were not tested. Export success
proves bundling, not physical-device behavior. Payments, charity transfers,
authentication and cross-device play are not implemented by this frontend.
Browser QA created simulated party data; no money was moved.

Start from the repository root with `npm.cmd run demo` and use port 8082.
For a reliable pitch, use demo controls to add friends, simulate runs and
fast-forward results. The highest-priority follow-up is making solo mode and
the charity allocation visible, even if those remain simulated.
