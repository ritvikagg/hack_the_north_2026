# Pledgefit

Pledgefit turns individual or group fitness goals into friendly accountability challenges. Participants choose a daily step goal and a simulated CAD pledge; people who finish receive their pledge back, while unfinished pledges are allocated to charity in the demo.

This directory contains the Expo SDK 57 client. The app uses local Supabase for accounts, challenges, groups, and server-authorized challenge updates. Deposits and charity payouts are simulated; no payment is collected.

## What is included

- Email/password accounts, solo challenges, group challenges, invite codes, and server-owned settlement rules.
- A local Docker-backed Supabase development stack and SQL migrations in [`../supabase/`](../supabase/).
- Android-only, on-device gait verification. The bundled 25K-parameter ONNX model checks for walking and an active gait profile before the app records a challenge day.
- Optional personal gait enrollment: two separate four-minute walks create a profile stored only in that app installation. No GPS, raw sensor session, or gait profile is uploaded.
- A web preview for the product and backend flows. The web preview deliberately reports that gait verification needs the installed Android app.

## Prerequisites

- Node.js 22.13 or later. Expo SDK 57 targets Node 22.13+, React Native 0.86, and React 19.2.3. [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- Docker Desktop running, for the local Supabase stack.
- For Android gait verification: Android Studio SDK, a JDK compatible with the Android build (JDK 22 is known to work here), and an Android phone or emulator. A physical phone must have USB debugging enabled for `expo run:android`.

## Run the local backend

From the repository root, start the Docker-backed Supabase stack:

```bash
cd /c/work/project/git-repo/hack_the_north_2026
npx supabase start
```

The first start downloads Docker images and applies the migrations. Docker Desktop must remain running; the CLI returns once the stack is ready. Check its addresses and keys at any time with:

```bash
npx supabase status -o env
```

Create `frontend/.env` with the local API address and the `ANON_KEY` value shown by that status command:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
```

`frontend/.env` is ignored by Git. The app will not authenticate successfully with the placeholder key.

To stop the local backend later:

```bash
npx supabase stop
```

## Install dependencies

```bash
cd /c/work/project/git-repo/hack_the_north_2026/frontend
npm ci
```

In Windows PowerShell, use `npm.cmd ci` if script execution blocks `npm`.

## Run on the web

With Supabase running and `frontend/.env` configured:

```bash
npx.cmd expo start --web --clear
```

Open the local URL shown by Expo. This starts Expo only; it does not start Docker or Supabase.

The browser build supports signing in and using the challenge flows, but it intentionally cannot load `onnxruntime-react-native`. Selecting gait verification on web explains that the feature is available in the installed Android app.

## Run on an Android phone

Expo Go is fine for basic UI iteration, but it cannot include this app's native ONNX Runtime dependency. Build and install the native development app to test gait verification:

```bash
adb devices
npx expo run:android
```

After the first native build is installed, start Metro for later JavaScript-only updates:

```bash
npx expo start --dev-client --clear
```

Keep Docker/Supabase and Metro running. For a physical phone, keep the phone and computer on the same Wi-Fi network; the app rewrites the local Supabase host to the Metro host so the phone can reach it.

If Gradle cannot find Java, set `JAVA_HOME` to the installed JDK in the same terminal before the build. On Windows PowerShell, for example:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-22'
```

The generated `android/` directory is local build output and is intentionally ignored. Android-specific configuration lives in `app.json` and `plugins/withShortCmakePath.js`.

## Gait verification and calibration

From an active challenge, choose **Verify a real walk**:

1. Allow Android's **Physical activity** permission.
2. Keep the phone in the same pocket and walk naturally for at least 15 seconds while the screen is open.
3. Choose **Stop and check**. Only a verified walk enables **Record verified challenge day**.

The check requires adequate sample rate and step count, a sufficient fraction of walking model windows, and a matching active profile. It is an anti-cheat signal, not medical identification or a guarantee of identity.

Personal calibration is optional. Go to **You > Gait calibration (optional)** and complete two separate four-minute natural walks. Keep the phone in the same pocket; varying the route or pace slightly for the second walk is encouraged. The generated profile replaces the bundled profile for future checks and can be removed from the same screen.

## Tests and checks

```bash
npm test
npm run typecheck
npx expo export --platform web
```

`npm run test:integration` additionally requires local Supabase, a populated `frontend/.env`, and may create isolated QA accounts/challenges in the local database:

```bash
npm run test:integration
```

## Project layout

- `src/app/` - Expo Router screens.
- `src/state/DemoProvider.tsx` - authenticated Supabase-backed app state and RPC boundary.
- `src/services/backend.ts` - Supabase client and phone-friendly local-host handling.
- `src/services/gaitVerification.ts` - sensor capture, quality checks, and verification flow.
- `src/services/gaitModel.ts` - Android ONNX inference; `gaitModel.web.ts` is the intentional web-only unavailable-feature shim.
- `src/services/gaitProfile*.ts` - bundled and optional runtime enrollment profiles.
- `assets/models/` - bundled ONNX model and matching metadata.
- `../supabase/migrations/` - local database schema, RLS, and RPC functions.

## Demo boundaries

The backend enforces authenticated actions and owns challenge progress/settlement, but this remains a hackathon prototype. Money, pledges, payouts, and charity allocations are simulated. Gait scoring is local to the device and should be treated as supporting evidence, not a medical assessment or production-grade biometric authentication system.
