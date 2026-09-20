import { useEffect, useRef, useState } from 'react';
import { AppText, Badge, Button, ErrorNotice, PageHeader, Screen, Surface } from '@/components/ui';
import { checkGaitService } from '@/services/gaitScoring';
import { colors } from '@/theme';

export default function Backend() {
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  async function check() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(null); setModel(null);
    const timer = setTimeout(() => controller.abort(), 25_000);
    try { const value = await checkGaitService(controller.signal); if (request.current === controller) setModel(value); }
    catch (e) { if (request.current === controller) setError(controller.signal.aborted ? 'The connection check timed out.' : e instanceof Error ? e.message : 'Could not connect.'); }
    finally { clearTimeout(timer); if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <Screen contentStyle={{ gap: 16 }}><PageHeader title="Connected to your stride." eyebrow="Gait service" back />
    <Surface style={{ gap: 12 }}><Badge label={model ? 'Connected' : 'Connection not checked'} tone={model ? 'green' : 'neutral'} /><AppText>The Python model checks a completed motion recording and returns a walking-pattern score.</AppText>{model && <AppText variant="caption" color={colors.muted}>Model: {model}</AppText>}<ErrorNotice message={error} /><Button label="Check backend connection" loading={busy} onPress={() => void check()} /></Surface>
    <AppText color={colors.muted}>On the computer running Expo, start the service in a second terminal:</AppText><AppText selectable style={{ fontFamily: 'monospace' }}>npm run backend</AppText>
    <AppText color={colors.muted}>Then record a walk or use Walking analysis. Completing a recording sends its motion samples through Expo to the scoring service. Failed checks can be retried while the recording remains open.</AppText>
    <AppText variant="caption" color={colors.muted}>The model was trained on one participant and one device. Its result is a prototype quality signal, separate from phone verification and simulated payouts.</AppText>
  </Screen>;
}
