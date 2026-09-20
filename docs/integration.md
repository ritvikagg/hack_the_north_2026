# Integration map

## Incoming main: gait identification

The Python model is now connected. Client recordings use `gaitCaptureToCsv` for both sharing and scoring, including the required `t_ns` column. The Expo API route proxy forwards `/api/gait/{health,score}` to the localhost Python service. Set `GAIT_SERVICE_URL` only on the server if that service moves. Web output is now `server` so API routes are included in builds.

The recording screens show asynchronous model results, finite validated probabilities, feature values and limitations, with timeout/offline retry states. Recorded workouts persist the model score independently of local motion verification and money. A returned altered-gait classification does not retrospectively confiscate a simulated payout. Debug counts do not request model-based workout credit.

Backend CSV validation now rejects missing timestamps, malformed/non-finite readings and insufficient captures instead of emitting invalid JSON scores. Optional startup sensor blanks from the native collector remain supported. Tests cover all 23 existing collected sessions, Expo-format nanosecond timestamps, the HTTP API, the Expo proxy, and client result parsing.

The imported commit also includes a separate Kotlin collector, training scripts, raw datasets and model reports. These remain in their original folders. There is still no shared pot server, authentication, payment processing, or distance verification.

The repository contained two independent Expo applications and three independent financial models. The root app now hosts the designed pledgefit screens and phone-validation tools. The duplicate frontend source/config/dependencies were consolidated into the root; its README is a redirect for teammates.

| Capability | Source of truth | Screen / status |
| --- | --- | --- |
| Host/join pots, generated goals, voting, seven-day start | Local social demo engine | Home, Groups, challenge detail; functional on one device |
| Finishers recover pledges and split missed pledges | Local social demo engine | Simulated results; all-miss refund preserved |
| Live pedometer permission and step deltas | expo-sensors / pedometer.ts | Record a walk; physical phone required |
| Raw motion analysis and gait validation | gait.ts | Record a walk and Walking analysis |
| CSV export | gait.ts / expo-sharing | Explicit share action after recording |
| Workout history | useAppStore | You → Recorded walks |
| Personal daily commitment | useChallengeStore / challengeEngine | Personal step pledge; configured 15–30 days |
| Daily stake, misses, refundable balance, streak | challengeEngine | Personal pledge summary, day list, completed history |
| Wallet deposit and percentage unlock tiers | useAppStore / unlockRules | Walking wallet; separate simulated balance |
| Reward partner data | rewardPartners.ts | Preview cards; redemption unavailable |
| Reset and scripted day outcomes | Existing store actions | Confirmed reset in You; development controls in step pledge |
| Remote verification of run distance | Absent | Social run progress stays explicitly simulated |
| Gait model score | Python API through Expo server routes | Recording / analysis results and workout history |
| Authentication, cross-device invitations, shared pot state, payment rails | Absent | Not represented as connected services |

## Integration changes

- One root package, lockfile, Expo config, theme and route tree. Legacy /dashboard and /deposit links redirect into the unified app.
- AsyncStorage 2.2.0 matches Expo SDK 57's bundled native module. The root's prior 3.x installation did not match Expo Go.
- Phone and analysis sessions share lifecycle handling: permission errors, repeat-start guards, route/background cancellation, cleanup, and explicit debug marking.
- A valid short walk is verified independently of the 2,000-step money tier. Injected counts cannot be treated as hardware steps.
- Wallet updates and workout insertion are one store mutation, with idempotency by capture id. The store computes its own monetary result.
- Personal daily progress replays recorded workouts, credits only matching validated sessions, resolves elapsed days and moves completed pledges into history.
- Hydration gates prevent startup writes over saved data. Storage failures are visible with retry controls.
- No step-to-distance conversion is used to claim a verified run. Personal pledge funds, social pot funds and wallet funds are never combined.

## Service boundaries for a future backend

Replace the social provider's persistence/dispatch behind its current screen API with authenticated server operations. Move pot membership, votes, start times, verified run ingestion and settlement to that server. Invite codes are currently device-local, not transferable shared state.

Treat WorkoutEvent and GaitAnalysis as uploaded evidence rather than trusted payment authorization. A future service should verify evidence, own idempotency and timestamps, and return authoritative progress and settlement. The present gait check is a local walking heuristic, not production anti-fraud validation.

The daily engine uses UTC calendar dates. Any switch to local-day rules requires an explicit timezone contract and migration. Existing recordings are associated with the personal pledge active when recording began. A walk spanning UTC midnight remains in history but earns no daily stake credit.

## Verification

Run root type checking, Jest engine/store/activity/gait tests, social engine tests, Expo dependency alignment, and an Android/iOS/web export. Physical permission prompts, hardware sensor behavior and Android's share sheet still require a device walkthrough. The existing gait capture retains at most 60,000 samples; finish sessions within roughly 20 minutes. Longer captures can fail sample-rate/step-agreement checks.

Official API reference: [Expo SDK 57 Pedometer](https://docs.expo.dev/versions/v57.0.0/sdk/pedometer/).
