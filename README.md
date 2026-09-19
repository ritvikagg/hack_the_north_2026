# Unnamed — hackathon MVP starter (Android)

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
