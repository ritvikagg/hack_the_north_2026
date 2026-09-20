# Personalized gait authenticator

This directory contains the model definition and training pipeline. The first
personalized model was trained from the 2026-09-20 collection and is stored in
`models/gait_authenticator/`. It is separate from the older heuristic
`models/gait_baseline.json`.

## Latest training run

- 15 eligible recordings collected from the owner and three other people. The
  two Pranav recordings are intentionally excluded from the manifest.
- 494 training windows and 388 held-out validation windows.
- 25,152 parameters; the unquantized weights are about 108 KB.
- Held-out sessions: 1/1 owner walk accepted, 3/3 other-person walks rejected,
  and 3/3 spoof activities rejected.

See `models/gait_authenticator/training_report.md` for the session-level results.
This is a pipeline validation, not a population-level accuracy claim: only
three other people and one held-out owner walk were available.

## Architecture

- Input: 5-second, 50 Hz overlapping accelerometer/gyroscope windows.
- Orientation-resistant temporal channels: acceleration magnitude, gravity-axis
  acceleration, horizontal acceleration, gyro magnitude, gravity-axis rotation,
  horizontal rotation, jerk, and acceleration/rotation coupling.
- Temporal branch: three depthwise-separable 1D convolution blocks.
- Feature branch: 30 time-, frequency-, periodicity-, and coupling-domain features.
- Fusion: a 64-value embedding with activity and training-time identity heads.
- Enrollment: a robust diagonal-Mahalanobis profile over the owner's embeddings.
- Session decision: at least five windows, with at least 70% inside the profile.

## Accepted calibration layouts

The manifest groups data by `recording_id`. Windows from one recording are never
split across training and validation.

1. **Owner only:** uses the engineered feature embedding and a robust one-class
   profile. This runs, but identity confidence is provisional because no impostor
   has been observed.
2. **Owner plus one other person:** trains the identity branch and calibrates the
   profile with available impostor windows. It is useful for a demo but may learn
   differences specific to that one friend.
3. **Owner plus 5-10 people:** trains a shared identity embedding and calibrates
   against a broader impostor cohort. This is the intended configuration.

One long owner walk is accepted in place of 20-30 short files. A 10-minute walk
produces hundreds of overlapping windows. It does **not** provide cross-day,
shoe, pace, route, or pocket-placement diversity, so the generated metadata
retains that limitation and independent validation still requires another
recording.

## Data manifest

Copy `data/gait_auth_manifest.example.csv` to `data/gait_auth_manifest.csv`.
Every row contains:

- `path`: CSV path relative to the manifest file, or an absolute path.
- `subject_id`: stable pseudonymous person identifier.
- `activity`: `walk`, `seated_legs`, `walk_in_place`, or `phone_shake`.
- `recording_id`: unique ID shared by windows from one uninterrupted recording.

Spoof recordings can come from the owner; they train the activity head but not
the walking identity profile.

## Training command

```bash
python -m pip install -r requirements-gait-model.txt
python scripts/train_gait_authenticator.py \
  --manifest data/gait_auth_manifest.csv \
  --subject owner
```

This writes `models/gait_authenticator/network.pt`, `metadata.json`, and
`training_report.md`. Complete recordings are held out, and the report uses
session-level false accepts and false rejects rather than window-level accuracy.

## Mobile inference

Export the trained checkpoint after every retraining run:

```bash
python scripts/export_gait_authenticator_onnx.py
```

The exporter writes the ONNX network and its enrollment metadata to
`frontend/assets/models/`, checks ONNX Runtime output against PyTorch on real
recordings, and regenerates the Python-to-TypeScript preprocessing fixture.
The Android app then performs the complete decision locally: it resamples the
accelerometer and gyroscope streams to 50 Hz, creates 5-second overlapping
windows, computes the same 30 features used during training, and evaluates both
the walking activity head and the owner's enrolled embedding profile. No gait
samples or location data are sent over the network.

Android needs both `ACTIVITY_RECOGNITION` and
`HIGH_SAMPLING_RATE_SENSORS`. The latter is declared in `frontend/app.json`;
without it Expo Sensors registers recent Android devices at the normal sensor
rate (about 5 Hz), which is too low for this model.

Run the cross-language preprocessing test and the frontend checks with:

```bash
cd frontend
npm run typecheck
npm test
```

Because ONNX Runtime is a native dependency, Expo Go cannot run this feature.
Regenerate and build the native Android project after a clean checkout or a
native dependency change:

```bash
cd frontend
npx expo prebuild --platform android --no-install
printf 'sdk.dir=C:\\\\Users\\\\micha\\\\AppData\\\\Local\\\\Android\\\\Sdk\n' > android/local.properties
cd android
./gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
```

The generated APK is `frontend/android/app/build/outputs/apk/release/app-release.apk`.
The model and runtime are bundled into that APK, so inference works offline and
with the phone unplugged. The current Expo sensor implementation still requires
the verification screen to remain open while samples are collected.

## Optional on-device enrollment

The app can replace the bundled owner profile with a profile calibrated on the
current phone. Open **You → Gait calibration (optional)** and complete two
separate four-minute walks. Each walk must contain real pedometer steps, at
least 15 Hz synchronized sensor data, at least 100 model windows, and at least
70% windows classified as natural walking. The second walk should vary the
route or pace slightly while keeping the phone in the same pocket.
The calibration screen keeps the display awake while recording so Android's
automatic screen timeout does not suspend Expo sensor updates.

After both walks pass, the app fits the same robust median/MAD one-class profile
used by the Python pipeline and stores it in AsyncStorage. Raw samples and
embeddings are not uploaded. Verification automatically prefers this local
profile; removing it from the calibration screen immediately restores the
bundled profile. Calibration is optional and an incomplete or rejected attempt
does not replace the currently active profile.
