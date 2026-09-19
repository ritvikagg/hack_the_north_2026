# Gait baseline report

- Sessions: 23 (17 genuine, 6 altered-gait)
- Validation: leave-one-session-out logistic-regression baseline
- Accuracy: 91.3%
- Errors: 2 altered-gait false positives; 0 genuine-session false negatives

## Important limitation

This is an exploratory, single-person baseline. It demonstrates an end-to-end pipeline but must not be presented as a clinically valid gait assessment or robust anti-cheat system.

The model uses acceleration/gyroscope magnitudes, cadence, and spectral periodicity so it is less sensitive to phone orientation than raw XYZ values.

## Misclassified held-out sessions

- gait_20260919_222931_andrew_abnormal_rightleg_rightpocket_1.csv (altered_gait -> genuine, 0.58)
- gait_20260919_223152_andrew_abnormal_leftleg_rightpocket_3.csv (altered_gait -> genuine, 0.97)
