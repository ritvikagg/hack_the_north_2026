import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../components/ui';
import { Difficulty, PledgeMinor } from '../domain/models';
import { colors, errorMessage, money } from '../theme';
import { useDemo } from '../state/DemoProvider';

export default function CreateChallenge() {
  const params = useLocalSearchParams<{ groupId?: string; mode?: string }>();
  const { demo, dispatch, busy } = useDemo();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [mode, setMode] = useState<'solo' | 'party'>(params.mode === 'solo' ? 'solo' : 'party');
  const [pledge, setPledge] = useState<PledgeMinor>(500);
  const [groupId, setGroupId] = useState<string | undefined>(params.groupId);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      setError(null);
      const id = await dispatch({ type: 'create', input: { mode, difficulty, pledgeMinor: pledge, groupId: mode === 'party' ? groupId : undefined } });
      router.replace({ pathname: '/challenge/[id]', params: { id: id! } });
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader back title="Start something good." eyebrow="Your next challenge" subtitle="Seven days. A promise worth keeping." action={<Badge label="Simulated money" tone="neutral" />} />
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
      <Button label="Solo" variant={mode === 'solo' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode('solo')} style={{ flex: 1 }} />
      <Button label="Party" variant={mode === 'party' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode('party')} style={{ flex: 1 }} />
    </View>
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>How far do you want to go?</AppText>
    <View style={{ gap: 10, marginBottom: 25 }}>
      {([{ value: 'easy', title: 'Easy', description: 'Find your rhythm.', icon: 'leaf-outline' }, { value: 'medium', title: 'Medium', description: 'Build a little momentum.', icon: 'sunny-outline' }, { value: 'hard', title: 'Hard', description: 'Give yourself a challenge.', icon: 'flash-outline' }] as const).map((choice) =>
        <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: difficulty === choice.value }} disabled={busy} onPress={() => setDifficulty(choice.value)}>
          <Surface style={{ padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: difficulty === choice.value ? colors.softGreen : colors.white, borderColor: difficulty === choice.value ? colors.forest : colors.line }}>
            <Icon name={choice.icon} /><View style={{ flex: 1 }}><AppText style={{ fontWeight: '600' }}>{choice.title}</AppText><AppText variant="caption" color={colors.muted}>{choice.description}</AppText></View>{difficulty === choice.value && <Icon name="checkmark-circle" />}
          </Surface>
        </Pressable>)}
    </View>
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>{mode === 'solo' ? 'Your deposit' : 'Everyone pledges the same amount'}</AppText>
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
      {([500, 1000, 2000] as const).map((amount) => <Pressable key={amount} accessibilityRole="radio" accessibilityLabel={money(amount) + ' CAD'} accessibilityState={{ checked: pledge === amount }} onPress={() => setPledge(amount)} disabled={busy}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 18, backgroundColor: pledge === amount ? colors.forest : colors.softGreen, borderRadius: 16 }}>
        <AppText style={{ fontWeight: '600', fontSize: 21 }} color={pledge === amount ? colors.cream : colors.ink}>{money(amount)}</AppText>
      </Pressable>)}
    </View>
    <AppText variant="caption" color={colors.muted}>CAD · simulated money only</AppText>
    {mode === 'party' && <><AppText style={{ fontWeight: '600', marginTop: 26, marginBottom: 12 }}>Who is this for?</AppText>
    <View style={{ gap: 8, marginBottom: 24 }}>
      {[{ id: undefined, name: 'A new circle of friends' }, ...demo.groups].map((group) => <Pressable key={group.id ?? 'standalone'} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: groupId === group.id }} onPress={() => setGroupId(group.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, minHeight: 48 }}>
        <Icon name={groupId === group.id ? 'radio-button-on' : 'radio-button-off'} size={22} /><AppText>{group.name}</AppText>
      </Pressable>)}
    </View></>}
    <Surface style={{ backgroundColor: colors.softGreen, marginVertical: 22, gap: 9 }}>
      <AppText style={{ fontWeight: '600' }}>Your challenge, generated fresh.</AppText>
      <AppText variant="caption" color={colors.muted}>{mode === 'solo' ? 'Starts immediately. Earn back your deposit in proportion to the runs you finish. The unearned portion goes to charity at the end of the week.' : 'Invite friends with your code, then start together. 10% of the total pot goes to charity; finishers split the remaining 90%. If nobody finishes, the whole pot goes to charity. A majority can replace the goal once before starting.'}</AppText>
    </Surface>
    <ErrorNotice message={error} />
    <Button label={(mode === 'solo' ? 'Start solo · ' : 'Create party · ') + money(pledge)} loading={busy} icon="sparkles-outline" onPress={() => void create()} />
    <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>No real money is collected or donated.</AppText>
  </Screen>;
}
