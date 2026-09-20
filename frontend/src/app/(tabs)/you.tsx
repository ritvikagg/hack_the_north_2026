import { useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AppText, Avatar, Badge, Button, Divider, ErrorNotice, PageHeader, Screen, Surface } from '../../components/ui';
import { colors, errorMessage, money, steps } from '../../theme';
import { useDemo } from '../../state/DemoProvider';
export default function You() {
  const { currentUser, demo, session, signOut } = useDemo();
  const [error, setError] = useState<string | null>(null); const [leaving, setLeaving] = useState(false);
  const payouts = demo.challenges.flatMap((c) => c.payouts).filter((p) => p.userId === currentUser.id);
  async function leave() { setLeaving(true); try { await signOut(); } catch(e) { setError(errorMessage(e)); } finally { setLeaving(false); } }
  return <Screen><PageHeader title="Look at you go." eyebrow="Your account" action={<Badge label="Hackathon preview" />} />
    <View style={{ alignItems: 'center', gap: 10, marginVertical: 15 }}><Avatar user={currentUser} size={90} /><AppText variant="title">{currentUser.name}</AppText><AppText color={colors.muted}>{session?.user.email}</AppText></View>
    <Surface style={{ marginTop: 20, gap: 12 }}><AppText>{demo.runs.length} goal days recorded · {steps(demo.runs.reduce((s,r) => s+r.steps,0))} total</AppText><AppText>Returned to you: {money(payouts.reduce((s,p) => s+p.totalMinor,0))}</AppText><AppText variant="caption" color={colors.muted}>All balances, activity and donations shown here are simulated. Your account and shared challenges are saved on the server.</AppText></Surface>
    <Divider /><Button label="Your challenges" onPress={() => router.navigate('/home')} />
    <Button label="Gait calibration (optional)" variant="secondary" icon="person-outline" onPress={() => router.push('/gait-enrollment' as Href)} />
    <Button label="How it works" variant="ghost" onPress={() => router.push('/how-it-works')} />
    <Divider /><ErrorNotice message={error} /><Button label="Sign out" variant="secondary" loading={leaving} onPress={() => void leave()} />
  </Screen>;
}
