import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../components/ui';
import { Difficulty, PledgeMinor } from '../domain/models';
import { colors, errorMessage, money } from '../theme';
import { useDemo } from '../state/DemoProvider';

export default function CreateChallenge() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const { demo, dispatch, busy } = useDemo();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [pledge, setPledge] = useState<PledgeMinor>(500);
  const [groupId, setGroupId] = useState<string | undefined>(params.groupId);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      setError(null);
      const id = await dispatch({ type: 'create', input: { difficulty, pledgeMinor: pledge, groupId } });
      router.replace({ pathname: '/challenge/[id]', params: { id: id! } });
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader back title="Start something good." eyebrow="Host a challenge" subtitle="Pick the feeling. We'll generate the goal." action={<Badge label="Demo" tone="neutral" />} />
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>How far do you want to go?</AppText>
    <View style={{ gap: 10, marginBottom: 25 }}>
      {([{ value: 'easy', title: 'Easy', description: 'Find your rhythm.', icon: 'leaf-outline' }, { value: 'medium', title: 'Medium', description: 'Build a little momentum.', icon: 'sunny-outline' }, { value: 'hard', title: 'Hard', description: 'Give yourself a challenge.', icon: 'flash-outline' }] as const).map((choice) =>
        <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: difficulty === choice.value }} disabled={busy} onPress={() => setDifficulty(choice.value)}>
          <Surface style={{ padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: difficulty === choice.value ? colors.softGreen : colors.white, borderColor: difficulty === choice.value ? colors.forest : colors.line }}>
            <Icon name={choice.icon} /><View style={{ flex: 1 }}><AppText style={{ fontWeight: '600' }}>{choice.title}</AppText><AppText variant="caption" color={colors.muted}>{choice.description}</AppText></View>{difficulty === choice.value && <Icon name="checkmark-circle" />}
          </Surface>
        </Pressable>)}
    </View>
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>Everyone pledges the same amount</AppText>
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
      {([500, 1000, 2000] as const).map((amount) => <Pressable key={amount} accessibilityRole="radio" accessibilityLabel={money(amount) + ' CAD'} accessibilityState={{ checked: pledge === amount }} onPress={() => setPledge(amount)} disabled={busy}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 18, backgroundColor: pledge === amount ? colors.forest : colors.softGreen, borderRadius: 16 }}>
        <AppText style={{ fontWeight: '600', fontSize: 21 }} color={pledge === amount ? colors.cream : colors.ink}>{money(amount)}</AppText>
      </Pressable>)}
    </View>
    <AppText variant="caption" color={colors.muted}>CAD · simulated money only</AppText>
    <AppText style={{ fontWeight: '600', marginTop: 26, marginBottom: 12 }}>Who is this for?</AppText>
    <View style={{ gap: 8, marginBottom: 24 }}>
      {[{ id: undefined, name: 'A new circle of friends' }, ...demo.groups].map((group) => <Pressable key={group.id ?? 'standalone'} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: groupId === group.id }} onPress={() => setGroupId(group.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, minHeight: 48 }}>
        <Icon name={groupId === group.id ? 'radio-button-on' : 'radio-button-off'} size={22} /><AppText>{group.name}</AppText>
      </Pressable>)}
    </View>
    <Surface style={{ backgroundColor: colors.softGreen, marginBottom: 22, gap: 9 }}>
      <AppText style={{ fontWeight: '600' }}>Your challenge, generated fresh.</AppText>
      <AppText variant="caption" color={colors.muted}>The app generates your runs and distance from the difficulty. Friends join your lobby, then you start the seven-day window. A majority can replace the goal once before starting.</AppText>
    </Surface>
    <ErrorNotice message={error} />
    <Button label={'Generate & pledge ' + money(pledge)} loading={busy} icon="sparkles-outline" onPress={() => void create()} />
    <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>Creates your pot and adds your simulated pledge.</AppText>
  </Screen>;
}
