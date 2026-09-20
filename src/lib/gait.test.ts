/// <reference types="jest" />
import { analyseGait, GaitSample } from './gait';

jest.mock('expo-sensors', () => ({ Accelerometer: {}, DeviceMotion: {}, Gyroscope: {} }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-sharing', () => ({}));

const samples = (moving: boolean): GaitSample[] => Array.from({ length: 1000 }, (_, index) => {
  const tMs = index * 20;
  return {
    tMs, sensorTimestampS: tMs / 1000,
    accel: [0, 0, 9.81], linearAccel: [moving ? 2 + Math.sin(2 * Math.PI * 2 * tMs / 1000) : 0, 0, 0],
    gravity: [0, 0, 9.81], gyro: moving ? [.2, .1, 0] : [0, 0, 0], orientation: [0, 0, 0],
  };
});
test('steady periodic walking with a matching hardware count is accepted', () => {
  expect(analyseGait(samples(true), 20000, 40).isVerified).toBe(true);
});
test('stationary, short and inconsistent-count signals cannot validate a workout', () => {
  expect(analyseGait(samples(false), 20000, 40).isVerified).toBe(false);
  expect(analyseGait(samples(true).slice(0, 100), 2000, 4).isVerified).toBe(false);
  expect(analyseGait(samples(true), 20000, 8000).isVerified).toBe(false);
});
