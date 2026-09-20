# pledgefit

One Expo SDK 57 app for Android and iOS. Run it from the repository root; `frontend/` is no longer a second application.

## Connected gait backend

The incoming `gait identification` commit adds the trained model, 23 captured sessions, Python inference/API, and standalone Android collector. Both **Record a walk** and **Walking analysis** now send the captured CSV to that API through Expo. Results show the model probability, decision, feature values, and limitations; workout history preserves successful model scores.

Start the backend in one terminal and Expo in another:

```powershell
python -m pip install -r requirements.txt
npm.cmd run backend
```

```powershell
npx.cmd expo start --clear
```

The launcher searches `.python`, `.venv`, then system Python; `PLEDGEFIT_PYTHON` can override the executable. On this development machine a portable Python/NumPy runtime is installed in the ignored `.python` folder because the system Python shortcut is broken. Other machines should install Python 3.10+ and the requirements. To test the Python endpoint: `python service/test_gait_scoring.py`.

The Python API remains at `127.0.0.1:8787`. Expo exposes `/api/gait/health` and `/api/gait/score` to the phone and forwards them locally, so you do not need to put your laptop IP or localhost into the app. The connection also follows the Expo tunnel when using `--tunnel`. **You → Gait service connection** checks readiness. `GAIT_SERVICE_URL` is an optional server-side override; a production native build requires a deployed Expo server and configured Router origin.

The model is a single-participant prototype, so its score is shown separately and does not grant/revoke pledge credit. Existing phone validation still governs the simulated wallet and personal step pledge. Network failures leave phone recordings intact and expose a retry button while the result screen is open. New CSV exports include `t_ns` in nanoseconds, matching the backend/native collector schema. No raw motion is added to workout history; only the returned compact score is persisted.

The native collector remains in `native-collector/` for separate Android data collection; it is not bundled into Expo Go. Training is available through `scripts/train_gait_baseline.py`, with model/report artifacts under `models/` and `reports/`.

## Run on your phone

```powershell
npm install
npx expo start --clear
```

Open the QR code in an SDK 57 compatible Expo Go. Stop any older Metro server first so your phone loads this project. If LAN access fails, use `npx expo start --tunnel`.

## What is connected

- Home / Groups / You: interactive local social pots, hosting, joining (STRIDE), voting, generated weekly goals, and simulated payouts.
- Home → Personal step pledge: the existing daily challenge engine, deposit, 15–30 day duration, configurable step goal, daily stake ledger, streak, completion, and history.
- Home → Record a walk: hardware pedometer plus your teammate's accelerometer/gyroscope gait validation. Validated sessions accumulate toward the personal daily goal.
- You → Recorded walks: saved phone activity and validation details.
- You → Walking analysis: raw motion capture and CSV sharing without challenge credit.
- You → Walking wallet: the original percentage-unlock engine, its own simulated deposit balance, and sample rewards. Rewards are previews; there is no redemption implementation.

Social pots, pledges, and wallet balances remain local to one device. A Python gait-scoring backend is now connected through Expo API routes. Authentication, real payments, and cross-phone pot synchronization are not implemented. Running pots remain simulated because phone walking validation does not measure run distance. See [integration notes](docs/integration.md) for the complete feature map and future service boundaries.

## Phone demo

1. Enter as Ryan. Join STRIDE, vote, and use the clearly labeled social demo controls to simulate the host or friends.
2. Host a pot, add a demo friend, start the week, simulate runs, and view the split payout.
3. Start a personal step pledge. For a short live phone demonstration, enter a small goal such as 20 steps. The money remains simulated.
4. Record a walk, grant physical activity/motion permission, put the phone in your pocket, and walk steadily for at least 8 seconds. Finish the recording and review the result.
5. Rejected or injected sessions remain in history but never credit steps or unlock money.
6. To demonstrate a full 15-day settlement, expand the personal pledge's dev controls, skip to the final day, then simulate that day's result. Simulated future outcomes are not real activity.
7. You has separate reset controls for social fixtures and phone activity; both require an explicit confirmation in the app.

Keep the app in the foreground while recording. Leaving it stops and discards the unfinished session. Android's Expo pedometer supplies live session deltas, not a full-day history. The existing engine uses UTC dates; the step screen displays the local reset time. Sessions crossing UTC midnight are not credited to either day's pledge. Motion captures are bounded at 60,000 samples (about 20 minutes); longer captures can fail the existing validator, so finish recordings within 20 minutes and accumulate multiple walks for a daily goal.

## Develop and verify

```powershell
npm run typecheck
npm test
npx expo install --check
npx expo export --platform all
```

- `app/`: the single Expo Router route tree.
- `src/components/`, `src/theme.ts`: shared cream/green UI.
- `src/lib/`: device sensors, walking analysis, activity reconciliation.
- `src/store/`: persisted activity/wallet and personal challenge stores.
- `src/state/`, `src/services/`, `src/domain/`: local social-pot provider and pure demo engine.
- `tests/`: social-pot tests; domain/store integration tests sit beside source.

The root lockfile combines both projects. AsyncStorage is pinned to Expo Go's SDK 57 bundled version (2.2.0). Existing storage keys are retained for local data continuity. Raw CSV captures stay in memory until exported; history stores only the compact analysis.
