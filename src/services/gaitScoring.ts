import type { GaitCapture } from '../lib/gait';
import { gaitCaptureToCsv } from '../lib/gaitCsv';
import { parseGaitScore } from '../domain/gaitScore';

// Expo Router resolves relative requests against Metro in Expo Go, including tunnels.
// A production native build requires the Router plugin's deployed server origin.
export async function scoreGaitCapture(capture: GaitCapture, signal?: AbortSignal) {
  const response = await fetch('/api/gait/score', {
    method: 'POST', headers: { 'Content-Type': 'text/csv' },
    body: gaitCaptureToCsv(capture), signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'The gait service could not score this recording.');
  return parseGaitScore(payload);
}
export async function checkGaitService(signal?: AbortSignal) {
  const response = await fetch('/api/gait/health', { signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== 'ok') throw new Error(typeof payload?.error === 'string' ? payload.error : 'Gait scoring is unavailable.');
  return String(payload.model);
}
