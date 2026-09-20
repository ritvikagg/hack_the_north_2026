/// <reference types="jest" />
import { gaitCaptureToCsv } from '../lib/gaitCsv';
import { parseGaitScore } from '../domain/gaitScore';
import { scoreGaitCapture } from './gaitScoring';
import type { GaitCapture } from '../lib/gait';

const score = { model_type: 'session_level_l2_logistic_regression', positive_class: 'genuine', genuine_probability: .8, decision: 'genuine', feature_values: { duration_s: 20, cadence_bpm: 110 }, limitations: ['Single participant'] };
const capture = {
  sessionId: 'test', label: 'quoted,"label', samples: [{ tMs: 20, sensorTimestampS: .02,
    accel: [0, 0, 9.81], linearAccel: [0, 0, 0], gravity: [0, 0, 9.81], gyro: [1, 2, 3], orientation: [0, 0, 0],
  }],
} as GaitCapture;
afterEach(() => jest.restoreAllMocks());
test('CSV supplies exact nanosecond timestamps and backend sensor columns', () => {
  const csv = gaitCaptureToCsv(capture);
  expect(csv.split('\n')[0]).toContain('t_ns,t_ms,sensor_timestamp_s,accel_x_mps2');
  expect(csv.split('\n')[1]).toContain('"quoted,""label",20000000,20,0.02,0,0,9.81');
});
test('scoring posts CSV to the Expo proxy and checks the result', async () => {
  const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(score));
  await expect(scoreGaitCapture(capture)).resolves.toMatchObject({ decision: 'genuine' });
  expect(fetcher).toHaveBeenCalledWith('/api/gait/score', expect.objectContaining({ method: 'POST', body: gaitCaptureToCsv(capture), headers: { 'Content-Type': 'text/csv' } }));
});
test('offline, malformed and contradictory results never become backend scores', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'Offline' }, { status: 503 }));
  await expect(scoreGaitCapture(capture)).rejects.toThrow('Offline');
  expect(() => parseGaitScore({ ...score, genuine_probability: NaN })).toThrow();
  expect(() => parseGaitScore({ ...score, decision: 'altered_gait' })).toThrow();
  expect(() => parseGaitScore({ ...score, feature_values: { duration_s: Infinity } })).toThrow();
});
