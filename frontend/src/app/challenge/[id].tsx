import { useState } from 'react';
import { Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Avatar, Badge, Button, Divider, ErrorNotice, PageHeader, ProgressDots, Screen, Surface } from '../../components/ui';
import { colors, distance, errorMessage, goalText, money, timeLeft } from '../../theme';
import { useDemo } from '../../state/DemoProvider';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { demo, currentUser, userById, challengeById, dispatch, busy, storageError } = useDemo();
  const c = challengeById(id);
  const [error, setError] = useState<string | null>(null);
  const [finish, setFinish] = useState(false);
  async function perform(type: 'vote' | 'start' | 'addRun' | 'settle') {
    setError(null);
    try { await dispatch({ type, id }); setFinish(false); } catch (e) { setError(errorMessage(e)); }
  }
  if (!c) return <Screen><PageHeader title="Loading your challenge" back /><ErrorNotice message={storageError} /><AppText>If this challenge is unavailable, return home and refresh.</AppText></Screen>;
  const solo = c.mode === 'solo';
  const me = c.participants.find((p) => p.userId === currentUser.id);
  const host = c.hostId === currentUser.id;
  const lobby = c.status === 'lobby';
  const settled = c.status === 'settled';
  const completed = me?.verifiedRuns ?? 0;
  const goalMet = completed >= c.requiredRuns;
  const pot = c.participants.length * c.pledgeMinor;
  const payout = c.payouts.find((p) => p.userId === currentUser.id);
  const expired = !!c.endsAt && Date.parse(c.endsAt) <= Date.now();
  const runs = demo.runs.filter((r) => r.challengeId === id);
  return <Screen>
    <PageHeader back eyebrow={solo ? 'Solo challenge' : 'Party challenge'} title={c.title} action={<Badge label={settled ? 'Complete' : lobby ? 'Lobby' : 'Active'} />} />
    <AppText color={colors.muted}>{goalText(c.requiredRuns, c.minimumDistanceMeters)}</AppText>
    <AppText variant="caption" style={{ marginBottom: 20 }}>{settled ? 'Challenge complete' : timeLeft(c.endsAt)}</AppText>
    <ErrorNotice message={error ?? storageError} onDismiss={() => setError(null)} />
    <Surface dark style={{ gap: 12 }}>
      <AppText variant="title" color={colors.cream}>{settled ? (goalMet ? 'Promise kept.' : 'Every step mattered.') : lobby ? 'Bring your people.' : 'One run at a time.'}</AppText>
      {settled ? <><AppText variant="number" color={colors.lime}>{money(payout?.totalMinor ?? 0)}</AppText><AppText color={colors.cream}>Your simulated return</AppText></> : lobby ? <AppText color={colors.cream}>Friends join using your invite code. The host starts your seven-day challenge.</AppText> : <><AppText variant="number" color={colors.cream}>{completed} / {c.requiredRuns}</AppText><ProgressDots completed={completed} total={c.requiredRuns} dark /><AppText color={colors.lime}>{goalMet ? 'Goal complete. Ready for the results.' : 'runs completed'}</AppText></>}
    </Surface>
    <Surface style={{ marginTop: 16, gap: 12 }}>
      <AppText>Your {solo ? 'deposit' : 'pledge'}: {money(c.pledgeMinor)}</AppText>
      {!solo && <AppText>Total pot: {money(pot)}</AppText>}
      {settled ? <>
        <AppText>Pledge returned: {money(payout?.pledgeReturnedMinor ?? 0)}</AppText>
        {!solo && <AppText>Bonus earned: {money(payout?.bonusMinor ?? 0)}</AppText>}
        <AppText style={{ fontWeight: '600' }}>To charity{solo ? '' : ' from this party'}: {money(c.charityMinor ?? 0)}</AppText>
      </> : solo ? <>
        <AppText>Earned so far: {money(Math.floor(c.pledgeMinor * Math.min(completed, c.requiredRuns) / c.requiredRuns))}</AppText>
        <AppText variant="caption" color={colors.muted}>Earn back a share for each completed run. Any unearned deposit goes to charity when the week ends.</AppText>
      </> : <AppText variant="caption" color={colors.muted}>10% of the total pot goes to charity. Finishers split the remaining 90%. If nobody finishes, the whole pot goes to charity.</AppText>}
      <AppText variant="caption" color={colors.muted}>CAD · Simulated money. No payment or donation is transferred.</AppText>
    </Surface>
    {!solo && <><Divider /><AppText style={{ fontSize: 20, fontWeight: '600' }}>In it together</AppText>
      {c.participants.map((p) => <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
        <Avatar user={userById(p.userId)} /><View style={{ flex: 1 }}><AppText>{userById(p.userId)?.name ?? 'Friend'}{p.userId === currentUser.id ? ' · You' : ''}</AppText>{p.userId === c.hostId && <AppText variant="caption">Host</AppText>}</View>
        <AppText>{settled ? money(c.payouts.find((x) => x.userId === p.userId)?.totalMinor ?? 0) : lobby ? 'Joined' : `${p.verifiedRuns} / ${c.requiredRuns}`}</AppText>
      </View>)}
    </>}
    {lobby && !me && <Button label="Join this party" onPress={() => router.push({ pathname: '/join', params: { code: c.inviteCode } })} />}
    {lobby && me && <>
      <Surface style={{ marginVertical: 20, gap: 12 }}><AppText variant="label">INVITE CODE</AppText><AppText selectable style={{ fontSize: 27, letterSpacing: 2 }}>{c.inviteCode}</AppText>
        <Button label="Share invite" variant="secondary" onPress={() => void Share.share({ message: `Join my Pledgefit party with code ${c.inviteCode}. Open the app on the same local server.` }).catch((e) => setError(errorMessage(e)))} />
        <AppText variant="caption" color={colors.muted}>Your friends sign in on their own phones and enter this code. Keep all phones on the same Wi-Fi.</AppText>
      </Surface>
      <AppText style={{ marginBottom: 12 }}>{c.replacementUsed ? 'Your group has used its goal replacement.' : `${c.replacementVotes.length} of ${Math.floor(c.participants.length / 2) + 1} votes needed to replace the goal.`}</AppText>
      {!c.replacementUsed && <Button label={c.replacementVotes.includes(currentUser.id) ? 'Your vote is in' : 'Vote to replace goal'} variant="secondary" disabled={busy || c.replacementVotes.includes(currentUser.id)} onPress={() => void perform('vote')} />}
      {host ? <Button label="Start the seven-day challenge" style={{ marginTop: 16 }} disabled={busy || c.participants.length < 2} onPress={() => void perform('start')} /> : <AppText style={{ marginTop: 16 }}>Waiting for the host to start.</AppText>}
      {host && c.participants.length < 2 && <AppText variant="caption">At least one friend must join before you can start.</AppText>}
    </>}
    {!lobby && me && <><Divider /><AppText style={{ fontSize: 20, fontWeight: '600' }}>Your activity</AppText>
      {!runs.length && <AppText color={colors.muted} style={{ marginTop: 10 }}>No runs recorded yet.</AppText>}
      {runs.map((run) => <View key={run.id} style={{ paddingVertical: 12 }}><AppText>{distance(run.distanceMeters)} · {Math.round(run.durationSeconds / 60)} min</AppText><AppText variant="caption" color={colors.muted}>{new Date(run.completedAt).toLocaleDateString()} · Simulated run</AppText></View>)}
    </>}
    {me && !lobby && !settled && <>
      <Divider /><Button label="Verify a real walk · coming soon" variant="secondary" disabled onPress={() => {}} />
      <Surface style={{ marginTop: 18, gap: 12 }}>
        <Badge label="Hackathon controls" tone="peach" /><AppText>Test the full challenge without walking. Only your own progress changes.</AppText>
        <Button label="Simulate a completed run" disabled={busy || goalMet || expired} onPress={() => void perform('addRun')} />
        {(host || expired) && (!finish ? <Button label="Fast-forward to results" variant="secondary" disabled={busy} onPress={() => setFinish(true)} /> : <>
          <AppText>End this {solo ? 'solo challenge' : 'party for everyone'} now? Current progress determines the final return and charity allocation.</AppText>
          <Button label="Confirm and settle" loading={busy} onPress={() => void perform('settle')} /><Button label="Keep going" variant="ghost" disabled={busy} onPress={() => setFinish(false)} />
        </>)}
      </Surface>
    </>}
    <Divider />{settled && <Button label="Start another challenge" onPress={() => router.push({ pathname: '/create', params: { mode: solo ? 'solo' : 'party' } })} />}
    <Button label="How payouts work" variant="ghost" onPress={() => router.push('/how-it-works')} />
  </Screen>;
}
