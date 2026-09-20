# pledgefit mobile

One Expo SDK 57 / React Native app for Android and iOS. No backend credentials are needed for the local demo.

## Start on your phone

Use Node.js 22.13 or newer (an active LTS release is recommended).

```sh
npm ci
npm start
```

On Windows PowerShell, use `npm.cmd ci` and `npm.cmd start` if PowerShell blocks npm scripts.

- Install Expo Go on Android or iOS.
- Keep the phone and computer on the same Wi-Fi network.
- Android: open Expo Go and scan the terminal QR code.
- iPhone: scan the QR code with the Camera app, then open Expo Go.
- To refresh a running demo, press `r` in the Expo terminal.
- `npm run android` opens a configured Android emulator; an emulator is optional.

## Demo walkthrough

**Verify a walk with gait signals**

1. Open an active challenge and select **Verify a walk**.
2. Allow Android's **Physical activity** permission, keep the app open, and walk naturally for at least 10 seconds with the phone in your pocket.
3. Tap **Stop and check**. The demo counts the run only when step, acceleration, and gyroscope signals agree.

This is a foreground prototype check. It does not measure distance, diagnose gait, or identify a person. For raw, screen-off CSV collection, use `../native-collector/` from the repository root.

**Join a pot**

1. Tap **Let's get moving**, then **Join a pot**.
2. Use code **STRIDE**, or tap **Use demo invite: STRIDE**.
3. Review the goal and shared stake, then **Join & pledge $5**.
4. Your membership and pledge now appear in the pot.
5. Vote to replace the goal, or open **Demo controls** and simulate the host starting.

**Be the host**

1. On Home, tap **Host a challenge**.
2. Choose a difficulty and $5 / $10 / $20 CAD. Optionally choose your existing group.
3. Tap **Generate & pledge**. The app generates a goal from the difficulty; you cannot set the run count or distance manually.
4. Open **Demo controls → Add a demo friend**. Repeat to fill the pot.
5. Try the replacement vote. Demo controls can simulate a friend's vote.
6. Tap **Start the seven-day challenge**.
7. Use **Simulate a verified run** to progress and **Fast-forward to results** to preview settlement.

**Reset**

Go to **You → Reset demo** to restore the initial sample pots. Confirm before resetting.

Changes persist locally using AsyncStorage. These are fake pots on one device, not a multiplayer backend. A generated invite code works on that same device; STRIDE is included in every fresh demo. Sharing a code does not synchronize two phones. No real payment, activity verification, authentication, or external account connection is performed.

## Move this app to another repository

This directory is self-contained. Put it in an empty directory such as `<team-repo>/frontend/` or `<team-repo>/mobile/`.

Keep:

- `src/`, `assets/`, `tests/`
- `package.json` and `package-lock.json`
- `app.json`, `tsconfig.json`, `.gitignore`
- `README.md`, `AGENTS.md`, `LICENSE`

Do not copy `node_modules/`, `.expo/`, `dist/`, `expo-env.d.ts`, or a `.git/` directory. Do not copy secrets or local environment files.

Then run `npm ci` and `npm start` from the copied app directory. Commit it using the destination repository's Git history. You do not have to recreate the app with create-expo-app, rewrite source files, or change its relative imports.

If the destination is already a React Native app, use a new subdirectory first instead of overwriting its configuration. If it is an npm/pnpm/Yarn workspace, its workspace configuration may need to include the new directory.

## Tests and builds

```sh
npm test
npm run typecheck
npx expo export --platform all
```

The tests cover joining, duplicate joins, hosting, generated goals, majority voting, run progress, settlement conservation, and resets.

## Backend integration

- `src/domain/models.ts`: shared data shapes; money is integer CAD cents.
- `src/services/demoFixtures.ts`: initial fake users, pots, and runs.
- `src/services/demoEngine.ts`: pure local transitions and replaceable goal generator.
- `src/state/DemoProvider.tsx`: shared state and persistent async action boundary.
- `src/app/`: Expo Router screens.
- `src/components/ui.tsx`, `src/theme.ts`: shared visuals.

Replace the provider's local transition/persistence call with the eventual API adapter. The server must own generated goals, authorization, accepted pledges, deadlines, votes, verified activity, and final settlement. Demo-only commands (add friend, simulate host/vote/run, fast-forward) must remain separate from real API operations.

For this prototype, generation randomly combines run counts and distances within difficulty bands; these bands are demonstration settings, not final training recommendations. Odd-cent remainders go to finishers in participant order in the local demo. The final backend policy remains to be agreed.
