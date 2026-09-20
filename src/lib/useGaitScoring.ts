import { useEffect, useRef, useState } from 'react';
import type { GaitCapture } from './gait';
import type { GaitScore } from '../domain/gaitScore';
import { scoreGaitCapture } from '../services/gaitScoring';

export function useGaitScoring() {
  const [score, setScore] = useState<GaitScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  function reset() { request.current?.abort(); request.current = null; setScore(null); setError(null); setBusy(false); }
  async function run(capture: GaitCapture, onScore?: (value: GaitScore) => void) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setScore(null);
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const value = await scoreGaitCapture(capture, controller.signal);
      if (request.current !== controller) return;
      onScore?.(value); setScore(value);
    } catch (e) {
      if (request.current === controller) setError(controller.signal.aborted ? 'The backend check timed out. Your phone recording is still available; retry the score.' : e instanceof Error ? e.message : 'Could not reach gait scoring.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }
  return { score, error, busy, run, reset };
}
