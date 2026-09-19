import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, AvatarStack, Badge, Button, ErrorNotice, PageHeader, Screen, Surface } from '../components/ui';
import { colors, errorMessage, goalText, money } from '../theme';
import { useDemo } from '../state/DemoProvider';

export default function JoinPot() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { demo, currentUser, busy, dispatch } = useDemo();
  const [code, setCode] = useState(params.code ?? '');
  const [selected, setSelected] = useState<string | null>(params.code?.toUpperCase() ?? null);
  const [error, setError] = useState<string | null>(null);
  const challenge = demo.challenges.find((c) => c.inviteCode === selected);
  const alreadyJoined = challenge?.participants.some((p) => p.userId === currentUser.id);
  function findPot(value = code) {
    const normalized = value.trim().toUpperCase();
    setCode(normalized); setSelected(normalized);
    setError(demo.challenges.some((c) => c.inviteCode === normalized) ? null : 'No pot found. Try the demo code STRIDE.');
  }
  async function join() {
    try {
      setError(null);
      const id = await dispatch({ type: 'join', code: selected! });
      router.replace({ pathname: '/challenge/[id]', params: { id: id! } });
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader back title="There's room for you." eyebrow="Join a pot" subtitle="A shared promise starts with an invitation." action={<Badge label="Demo" tone="neutral" />} />
    <AppText style={{ fontWeight: '600', marginBottom: 10 }}>Invite code</AppText>
    <TextInput accessibilityLabel="Invite code" value={code} onChangeText={(value) => { setCode(value); setSelected(null); setError(null); }} editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={24} placeholder="e.g. STRIDE" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={() => findPot()}
      style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 16, padding: 18, color: colors.ink, fontSize: 20, letterSpacing: 2, marginBottom: 12 }} />
    <Button label="Find pot" variant="secondary" icon="search-outline" disabled={busy || !code.trim()} onPress={() => findPot()} />
    {!selected && <View style={{ marginTop: 25, gap: 10 }}><AppText variant="caption" color={colors.muted}>Want to try joining as a participant?</AppText><Button label="Use demo invite: STRIDE" variant="ghost" onPress={() => findPot('STRIDE')} /></View>}
    <ErrorNotice message={error} />
    {challenge && <Surface style={{ marginTop: 24, gap: 16 }}>
      <Badge label={challenge.status === 'lobby' ? 'Open pot' : 'Already started'} tone={challenge.status === 'lobby' ? 'green' : 'peach'} />
      <AppText variant="title" style={{ fontSize: 30 }}>{challenge.title}.</AppText>
      <AppText color={colors.muted}>{goalText(challenge.requiredRuns, challenge.minimumDistanceMeters)}</AppText>
      <AvatarStack users={demo.users.filter((u) => challenge.participants.some((p) => p.userId === u.id))} />
      <AppText variant="caption" color={colors.muted}>Hosted by {demo.users.find((u) => u.id === challenge.hostId)?.name} · {challenge.participants.length} joined</AppText>
      <View style={{ flexDirection: 'row', gap: 25 }}><View><AppText variant="caption" color={colors.muted}>Your pledge</AppText><AppText variant="number" style={{ fontSize: 30 }}>{money(challenge.pledgeMinor)}</AppText></View><View><AppText variant="caption" color={colors.muted}>Pot {alreadyJoined ? 'now' : 'after you join'}</AppText><AppText variant="number" style={{ fontSize: 30 }}>{money((challenge.participants.length + (alreadyJoined ? 0 : 1)) * challenge.pledgeMinor)}</AppText></View></View>
      <AppText variant="caption" color={colors.muted}>Finish the goal to get your pledge back and share missed pledges. CAD, simulated only.</AppText>
      <Button label={alreadyJoined ? 'Open your challenge' : 'Join & pledge ' + money(challenge.pledgeMinor)} loading={busy} disabled={!alreadyJoined && challenge.status !== 'lobby'} onPress={() => void join()} />
    </Surface>}
  </Screen>;
}
