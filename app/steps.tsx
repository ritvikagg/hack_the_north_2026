import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Badge, Button, Divider, ErrorNotice, PageHeader, Screen, Surface } from '@/components/ui';
import { useChallengeStore } from '@/store/useChallengeStore';
import { getChallengeSummary } from '@/store/challengeEngine';
import { utcDate } from '@/lib/activity';
import type { Challenge } from '@/types/challenge';
import { colors, errorMessage, money } from '@/theme';

const dollars = (amount: number) => money(Math.round(amount * 100));
export default function Steps() {
  const active = useChallengeStore(s => s.activeChallenge);
  const history = useChallengeStore(s => s.challengeHistory);
  const [amount, setAmount] = useState('30');
  const [days, setDays] = useState('15');
  const [threshold, setThreshold] = useState('5000');
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  function start() {
    try { setError(null); useChallengeStore.getState().startChallenge(Number(amount), Number(days), Number(threshold)); }
    catch (e) { setError(errorMessage(e)); }
  }
  function simulate(count: number, result: 'hit' | 'missed') {
    try { setError(null); useChallengeStore.getState().devFastForward(count, Array(count).fill(result)); }
    catch (e) { setError(errorMessage(e)); }
  }
  const today = active?.days.find(day => day.date === utcDate());
  const pending = active?.days.filter(day => day.status === 'pending').length ?? 0;
  return <Screen>
    <PageHeader title="One day at a time." eyebrow="Personal step pledge" back subtitle="A daily promise to yourself, measured by walks recorded on your phone." />
    <ErrorNotice message={error} />
    <AppText variant="caption" color={colors.muted} style={{ marginBottom: 18 }}>Separate from shared running pots. Each day earns back its share of your simulated deposit when you reach the step goal. Missed days forfeit their share.</AppText>
    {active ? <>
      <Surface dark style={{ gap: 12 }}>
        <Badge label={today?.status === 'hit' ? 'Today’s goal met' : 'Your daily goal'} />
        <AppText variant="number" color={colors.cream}>{(today?.actualSteps ?? 0).toLocaleString()}</AppText>
        <AppText color={colors.lime}>of {active.dailyGoal.threshold.toLocaleString()} verified steps today</AppText>
        <AppText variant="caption" color={colors.cream}>Only recorded, validated sessions count. Days reset at midnight UTC ({new Date(utcDate() + 'T00:00:00Z').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on this phone).</AppText>
      </Surface>
      <Button label="Record a walk" icon="walk-outline" style={{ marginTop: 16 }} onPress={() => router.push('/workout')} />
      <Summary challenge={active} />
      <Divider /><AppText style={{ fontWeight: '600', marginBottom: 10 }}>Your days</AppText>
      {active.days.map((day, index) => <View key={day.date} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 }}>
        <View style={{ flex: 1 }}><AppText>Day {index + 1} · {day.date}</AppText><AppText variant="caption" color={colors.muted}>{dollars(day.stakeAmount)} stake{day.actualSteps !== undefined ? ' · ' + day.actualSteps.toLocaleString() + ' steps' : ''}</AppText></View>
        <Badge label={day.status === 'hit' ? 'Goal met' : day.status === 'missed' ? 'Missed' : 'Upcoming'} tone={day.status === 'hit' ? 'green' : day.status === 'missed' ? 'peach' : 'neutral'} />
      </View>)}
      {__DEV__ && <><Divider /><Button label={showDemo ? 'Hide demo controls' : 'Demo: fast-forward days'} variant="ghost" onPress={() => setShowDemo(!showDemo)} />
        {showDemo && <View style={{ gap: 10 }}><AppText variant="caption" color={colors.muted}>These controls simulate outcomes, including future days. They do not create verified workouts.</AppText>
          <Button label="Simulate next day: goal met" variant="secondary" onPress={() => simulate(1, 'hit')} />
          <Button label="Simulate next day: missed" variant="secondary" onPress={() => simulate(1, 'missed')} />
          <Button label="Skip to the final day" variant="secondary" disabled={pending <= 1} onPress={() => simulate(pending - 1, 'hit')} />
        </View>}</>}
    </> : <>
      {history.length > 0 && <Surface style={{ gap: 10, marginBottom: 24, backgroundColor: colors.softGreen }}><AppText variant="title">You made it through.</AppText><AppText>Your last pledge is complete. {dollars(getChallengeSummary(history.at(-1)!).refundableAmount)} is refundable.</AppText><AppText variant="caption" color={colors.muted}>Simulated settlement · no money is transferred.</AppText></Surface>}
      <Surface style={{ gap: 16 }}>
        <AppText style={{ fontWeight: '600', fontSize: 20 }}>Start your step pledge</AppText>
        <NumberField label="Deposit · CAD (simulated)" value={amount} onChange={setAmount} decimal />
        <NumberField label="Length · 15–30 days" value={days} onChange={setDays} />
        <NumberField label="Verified steps each day" value={threshold} onChange={setThreshold} />
        <AppText variant="caption" color={colors.muted}>Starts today. Keep pledgefit open while recording a walk; it cannot read a full day’s background steps on Android.</AppText>
        <Button label="Commit simulated deposit" onPress={start} />
      </Surface>
    </>}
    <Divider /><Button label="Your recorded walks" variant="secondary" onPress={() => router.push('/activity')} />
    {history.length > 0 && <><Divider /><AppText variant="title" style={{ fontSize: 28 }}>Past step pledges</AppText>{[...history].reverse().map(challenge => <Summary key={challenge.id} challenge={challenge} />)}</>}
  </Screen>;
}

function NumberField({ label, value, onChange, decimal = false }: { label: string; value: string; onChange: (value: string) => void; decimal?: boolean }) {
  return <View style={{ gap: 8 }}><AppText variant="caption" color={colors.muted}>{label}</AppText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} maxLength={8} style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, color: colors.ink, fontSize: 18 }} /></View>;
}
function Summary({ challenge }: { challenge: Challenge }) {
  const summary = getChallengeSummary(challenge);
  const locked = challenge.days.filter(day => day.status === 'pending').reduce((sum, day) => sum + Math.round(day.stakeAmount * 100), 0);
  return <Surface style={{ gap: 10, marginTop: 16 }}>
    <AppText style={{ fontWeight: '600' }}>{challenge.startDate} · {challenge.totalDays} days</AppText>
    {[
      ['Deposited', dollars(challenge.depositAmount)], ['Pending', money(locked)],
      ['Refundable', dollars(summary.refundableAmount)], ['Forfeited', dollars(summary.forfeitedAmount)],
      ['Days resolved', summary.daysCompleted + ' / ' + challenge.totalDays], ['Current streak', summary.currentStreak + ' days'],
    ].map(([label, value]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><AppText color={colors.muted}>{label}</AppText><AppText>{value}</AppText></View>)}
    <AppText variant="caption" color={colors.muted}>CAD · simulated pledge ledger</AppText>
  </Surface>;
}
