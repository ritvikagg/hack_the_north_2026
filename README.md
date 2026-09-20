# Unnamed — hackathon MVP starter (Android)

## Run the current party demo

This repository contains two separate Expo apps. The root app is the original
scaffold (its deposit screen is still a placeholder). The more complete
Pledgefit party demo lives in `frontend/`.

From this repository root in PowerShell:

```powershell
npm.cmd --prefix frontend ci
npm.cmd run demo
```

The demo uses port **8082**, so it can run alongside the root scaffold on 8081.
Open http://localhost:8082 for the browser demo, or scan the terminal QR code
with Expo Go on a phone on the same Wi-Fi. Docker runs Supabase separately;
starting Docker does not start Expo. This frontend uses local simulated data
and does not require Docker or Supabase.

See `reports/hackathon-readiness-2026-09-20.md` for tested flows and remaining
product gaps, including solo mode and charity payouts.

Hour 0–1 output: scaffold, shared types, design tokens, and stub screens so
all three of you can build in parallel starting hour 1.

## 1. Create the Expo project (whoever's machine, then push to GitHub)

```bash
npx create-expo-app@latest unnamed-app
cd unnamed-app
```

This bundles Expo Router by default. Confirm the SDK version it created
matches across all three machines (`cat package.json | grep '"expo"'`) —
mismatched SDKs between teammates is the #1 cause of "works on my machine."

## 2. Drop these files in

Copy this whole `app/` and `src/` folder into the project root, overwriting
the default `app/index.tsx`.

## 3. Install dependencies

```bash
npx expo install expo-sensors expo-router react-native-safe-area-context react-native-screens
npm install zustand @react-native-async-storage/async-storage
```

## 4. Android step-counter permission

`expo-sensors`' Pedometer needs the runtime `ACTIVITY_RECOGNITION`
permission on Android (API 29+). Declare it in `app.json`:

```json
{
  "expo": {
    "android": {
      "permissions": ["android.permission.ACTIVITY_RECOGNITION"]
    }
  }
}
```

`Pedometer.requestPermissionsAsync()` (already wired up in
`src/lib/pedometer.ts`) triggers the actual runtime prompt at runtime.

## 5. Run it

```bash
npx expo start
```

Scan the QR with Expo Go on an Android phone — fastest for a hackathon,
no native build needed. Or run an Android Emulator and use its
**Extended Controls → Virtual sensors** panel to feed it fake step data,
which is handy for rehearsing without walking around.

Physical Android devices vary a lot in step-counter hardware/driver
quality across OEMs (Samsung vs. Pixel vs. budget phones behave
differently), so test on the actual device you'll demo with if you can —
and treat Person 2's `injectDebugSteps()` in `src/lib/pedometer.ts` as
your fallback if it misbehaves on stage.

## Who owns what (matches the plan)

| File | Owner |
|---|---|
| `app/index.tsx`, `app/deposit.tsx`, `app/dashboard.tsx` | Person 1 |
| `src/theme.ts` (feel free to refine) | Person 1 |
| `src/lib/pedometer.ts`, `src/lib/unlockRules.ts` | Person 2 |
| `app/workout.tsx` (UI+data shared) | Person 1 + 2 |
| `src/store/useAppStore.ts`, `src/data/rewardPartners.ts` | Person 3 |
| `src/types.ts` | Everyone — don't change without a heads-up in chat |

## First sync checkpoint (~hour 6)

Wire dashboard → real store data, workout screen → real pedometer +
unlock rules. Fix whatever's mismatched in `types.ts` now, not at hour 20.

## Consolidated gait tooling

This is the single repository for the Expo app, gait collector, dataset, and scoring prototype:

- `native-collector/` â€” standalone Android collector used to record high-rate gait CSVs, including screen-off recording support.
- `data/raw/gait_sessions/` â€” the 23 original collected session CSVs.
- `scripts/train_gait_baseline.py` â€” reproducibly trains the prototype from the raw sessions.
- `models/gait_baseline.json` â€” the current trained model artifact.
- `service/gait_scoring_api.py` â€” local scoring API for the backend.

### Run the gait scoring API

From this repository root in Git Bash or PowerShell:

```bash
python service/gait_scoring_api.py
```

Do not escape underscores in the command. The API exposes `GET http://127.0.0.1:8787/health` and accepts a completed CSV as a raw `text/csv` request body at `POST http://127.0.0.1:8787/score`.

The Expo app also launches from this root:

```bash
npx.cmd expo start --android
```

The scoring API is local-only. The backend should call it server-side and use its `genuine_probability` as one gait-quality signal, not as a medical or identity decision.
