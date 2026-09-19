import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Avatar, Badge, Button, Divider, ErrorNotice, PageHeader, Screen, Surface } from '../../components/ui';
import { colors, distance, errorMessage, money } from '../../theme';
import { useDemo } from '../../state/DemoProvider';

export default function You() {
  const { currentUser, demo, dispatch, busy } = useDemo();
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runs = demo.runs.filter((run) => run.userId === currentUser.id);
  const earned = demo.challenges.flatMap((c) => c.payouts).filter((p) => p.userId === currentUser.id).reduce((sum, p) => sum + p.bonusMinor, 0);
  async function reset() {
    try { setError(null); await dispatch({ type: 'reset' }); setConfirmReset(false); router.replace('/'); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <Screen><PageHeader title="Look at you go." eyebrow="You" action={<Badge label="Demo profile" tone="neutral" />} />
    <View style={{ alignItems: 'center', gap: 10, marginVertical: 15 }}><Avatar user={currentUser} size={90} /><AppText variant="title" style={{ fontSize: 32 }}>{currentUser.name}</AppText><AppText color={colors.muted}>Making a little progress, together.</AppText></View>
    <Surface style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-around' }}><View style={{ alignItems: 'center' }}><AppText variant="number">{runs.length}</AppText><AppText variant="caption" color={colors.muted}>Verified runs</AppText></View><View style={{ width: 1, backgroundColor: colors.line }} /><View style={{ alignItems: 'center' }}><AppText variant="number" style={{ fontSize: 32 }}>{distance(runs.reduce((sum, run) => sum + run.distanceMeters, 0))}</AppText><AppText variant="caption" color={colors.muted}>Across your demo</AppText></View></Surface>
    <Surface style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><AppText style={{ fontWeight: '600' }}>Bonus earned</AppText><AppText variant="caption" color={colors.muted}>Simulated · excludes returned pledges</AppText></View><AppText style={{ fontWeight: '600', fontSize: 24 }}>{money(earned)}</AppText></Surface>
    <Divider /><Button label="Your challenges & pledges" variant="secondary" icon="footsteps-outline" onPress={() => router.navigate('/home')} />
    <Button label="How pledgefit works" variant="ghost" icon="leaf-outline" onPress={() => router.push('/how-it-works')} />
    <Divider /><AppText variant="caption" color={colors.muted} style={{ textAlign: 'center', marginBottom: 16 }}>Demo changes are saved on this device. Activity and money are simulated.</AppText>
    <ErrorNotice message={error} />
    {confirmReset ? <Surface style={{ gap: 12 }}><AppText style={{ fontWeight: '600' }}>Reset the demo?</AppText><AppText variant="caption" color={colors.muted}>This removes your created pots and restores the sample challenges.</AppText><Button label="Reset demo" loading={busy} onPress={() => void reset()} /><Button label="Keep my demo" variant="ghost" disabled={busy} onPress={() => setConfirmReset(false)} /></Surface> : <Button label="Reset demo" variant="secondary" icon="refresh-outline" onPress={() => setConfirmReset(true)} />}
    <Button label="Back to welcome" variant="ghost" onPress={() => router.replace('/')} />
  </Screen>;
}
