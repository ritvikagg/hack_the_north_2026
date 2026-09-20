import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../components/ui';
import { PledgeMinor } from '../domain/models';
import { STEP_GOAL_MAX, STEP_GOAL_MIN, REQUIRED_DAYS_MAX, REQUIRED_DAYS_MIN } from '../services/demoEngine';
import { colors, errorMessage, money, steps } from '../theme';
import { useDemo } from '../state/DemoProvider';

const inputStyle = { padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white, fontSize: 20 };

export default function CreateChallenge() {
  const params = useLocalSearchParams<{ groupId?: string; mode?: string }>();
  const { demo, dispatch, busy } = useDemo();
  const [stepGoal, setStepGoal] = useState('10000');
  const [dayCount, setDayCount] = useState('15');
  const [mode, setMode] = useState<'solo' | 'party'>(params.mode === 'solo' ? 'solo' : 'party');
  const [pledge, setPledge] = useState<PledgeMinor>(500);
  const [groupId, setGroupId] = useState<string | undefined>(params.groupId);
  const [error, setError] = useState<string | null>(null);
  const dailyStepGoal = Number(stepGoal);
  const requiredDays = Number(dayCount);
  const goalValid = Number.isInteger(dailyStepGoal) && dailyStepGoal >= STEP_GOAL_MIN && dailyStepGoal <= STEP_GOAL_MAX;
  const daysValid = Number.isInteger(requiredDays) && requiredDays >= REQUIRED_DAYS_MIN && requiredDays <= REQUIRED_DAYS_MAX;
  async function create() {
    try {
      setError(null);
      const id = await dispatch({ type: 'create', input: { mode, dailyStepGoal, requiredDays, pledgeMinor: pledge, groupId: mode === 'party' ? groupId : undefined } });
      router.replace({ pathname: '/challenge/[id]', params: { id: id! } });
    } catch (e) { setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader back title="Start something good." eyebrow="Your next challenge" subtitle="A daily step goal. A promise worth keeping." action={<Badge label="Simulated money" tone="neutral" />} />
    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
      <Button label="Solo" variant={mode === 'solo' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode('solo')} style={{ flex: 1 }} />
      <Button label="Party" variant={mode === 'party' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode('party')} style={{ flex: 1 }} />
    </View>
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>Your daily step goal</AppText>
    <TextInput accessibilityLabel="Daily step goal" value={stepGoal} onChangeText={setStepGoal} editable={!busy} keyboardType="number-pad" inputMode="numeric" maxLength={5} placeholder="10000" style={{ ...inputStyle, marginBottom: 6 }} />
    <AppText variant="caption" color={colors.muted} style={{ marginBottom: 22 }}>Between {steps(STEP_GOAL_MIN)} and {steps(STEP_GOAL_MAX)} per day.</AppText>
    <AppText style={{ fontWeight: '600', marginBottom: 12 }}>For how many days?</AppText>
    <TextInput accessibilityLabel="Number of days" value={dayCount} onChangeText={setDayCount} editable={!busy} keyboardType="number-pad" inputMode="numeric" maxLength={2} placeholder="15" style={{ ...inputStyle, marginBottom: 6 }} />
    <AppText variant="caption" color={colors.muted} style={{ marginBottom: 25 }}>{REQUIRED_DAYS_MIN}–{REQUIRED_DAYS_MAX} days. Days you miss do not count against you — the challenge stays open until you finish them all.</AppText>
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
      <AppText style={{ fontWeight: '600' }}>All or nothing, on your schedule.</AppText>
      <AppText variant="caption" color={colors.muted}>{mode === 'solo'
        ? 'Starts immediately. Hit your step goal on every required day — take as long as you need — and your full deposit comes back. End it early and the deposit goes to charity.'
        : 'Invite friends with your code, then start together. Everyone who finishes all their days gets their full pledge back. Unfinished pledges go to charity.'}</AppText>
    </Surface>
    <ErrorNotice message={error} />
    <Button label={(mode === 'solo' ? 'Start solo · ' : 'Create party · ') + money(pledge)} loading={busy} icon="sparkles-outline" disabled={!goalValid || !daysValid} onPress={() => void create()} />
    <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>No real money is collected or donated.</AppText>
  </Screen>;
}
