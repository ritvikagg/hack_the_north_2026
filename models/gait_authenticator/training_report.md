# Gait authenticator training report

- Owner: `owner`
- Subjects: jack, owner, ritvik, ryan
- Training windows: 494
- Validation windows: 388
- Parameters: 25,152
- Profile mode: `small_cohort`

## Held-out session metrics

- Accuracy: 7/7
- False rejects: 0/1
- False accepts (other people walking): 0/3
- Accepted spoof sessions: 0/3

| Recording | Subject | Activity | Walk fraction | Identity fraction | Decision | Expected |
|---|---|---|---:|---:|---|---|
| jack_walk_2 | jack | walk | 1.000 | 0.000 | reject | reject |
| owner_phone_shake_2 | owner | phone_shake | 0.000 | 0.000 | reject | reject |
| owner_seated_legs_2 | owner | seated_legs | 0.077 | 0.000 | reject | reject |
| owner_walk_3 | owner | walk | 1.000 | 0.932 | accept | accept |
| owner_walk_in_place_2 | owner | walk_in_place | 0.067 | 0.000 | reject | reject |
| ritvik_walk_2 | ritvik | walk | 1.000 | 0.000 | reject | reject |
| ryan_walk_2 | ryan | walk | 1.000 | 0.013 | reject | reject |

## Important limitation

These held-out results contain only one owner walk and 3 other people. They verify that the pipeline runs and separates this small collection; they are not a reliable population-level FAR/FRR estimate.
