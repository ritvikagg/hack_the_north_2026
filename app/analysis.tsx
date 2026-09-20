import { useState } from 'react';
import { AppText, Button, ErrorNotice, PageHeader, Screen } from '@/components/ui';
import { GaitResult } from '@/components/GaitResult';
import { BackendGaitResult } from '@/components/BackendGaitResult';
import { useGaitScoring } from '@/lib/useGaitScoring';
import { GaitCapture, shareGaitCsv } from '@/lib/gait';
import { useMotionSession } from '@/lib/useMotionSession';
import { colors, errorMessage } from '@/theme';

export default function Analysis() {
  const session = useMotionSession(false);
  const backend = useGaitScoring();
  const [capture, setCapture] = useState<GaitCapture | null>(null);
  async function toggle() {
    if (session.tracking) { const result = session.stop(); if (result) { setCapture(result.capture); void backend.run(result.capture); } }
    else { setCapture(null); backend.reset(); await session.start(); }
  }
  async function share() {
    if (!capture) return;
    try { await shareGaitCsv(capture); } catch (e) { session.setError(errorMessage(e)); }
  }
  return <Screen contentStyle={{ gap: 16 }}>
    <PageHeader title="Find your rhythm." eyebrow="Walking analysis" back subtitle="Record raw phone motion with the phone in your pocket. Aim for 20–30 seconds of steady walking for the model check." />
    <AppText color={colors.muted}>This tool checks motion without comparing a step counter. It does not credit your challenge or wallet. Use Record a walk for that.</AppText>
    <ErrorNotice message={session.error} />
    {session.tracking && <AppText variant="number">{session.seconds}s</AppText>}
    <Button label={session.tracking ? 'Stop & analyze' : 'Start walking analysis'} loading={session.busy} onPress={() => void toggle()} />
    {capture && <BackendGaitResult score={backend.score} busy={backend.busy} error={backend.error} onRetry={() => void backend.run(capture)} />}
    {capture && <><GaitResult analysis={capture.analysis} /><Button label="Share raw CSV" icon="share-outline" variant="secondary" onPress={() => void share()} /><AppText variant="caption" color={colors.muted}>Includes acceleration, gravity, gyroscope and orientation samples from this session.</AppText></>}
  </Screen>;
}
