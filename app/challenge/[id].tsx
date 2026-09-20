import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Avatar, Badge, Button, Divider, EmptyState, ErrorNotice, Icon, PageHeader, ProgressDots, Screen, Surface } from '@/components/ui';
import { colors, distance, errorMessage, goalText, money, timeLeft } from '@/theme';
import { useDemo } from '@/state/DemoProvider';
import { DemoAction } from '@/services/demoEngine';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { demo, currentUser, userById, challengeById, dispatch, busy } = useDemo();
  const challenge = challengeById(id);
  const [showRuns, setShowRuns] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function perform(action: DemoAction) {
    setError(null);
    try { await dispatch(action); } catch (e) { setError(errorMessage(e)); }
  }
  if (!challenge) return <Screen><PageHeader title="Challenge not found" back /><EmptyState title="Let's head home." message="This challenge isn't in the current demo." action={<Button label="Go to Home" onPress={() => router.replace('/home')} />} /></Screen>;
  const me = challenge.participants.find((p) => p.userId === currentUser.id);
  const host = challenge.hostId === currentUser.id;
  const lobby = challenge.status === 'lobby';
  const settled = challenge.status === 'settled';
  const goalMet = (me?.verifiedRuns ?? 0) >= challenge.requiredRuns;
  const payout = challenge.payouts.find((p) => p.userId === currentUser.id);
  const runs = demo.runs.filter((r) => r.challengeId === id && r.userId === currentUser.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const remaining = Math.max(0, challenge.requiredRuns - (me?.verifiedRuns ?? 0));
  const everyoneMissed = challenge.participants.every((p) => p.verifiedRuns < challenge.requiredRuns);
  const votesNeeded = Math.floor(challenge.participants.length / 2) + 1;
  return <Screen>
    <PageHeader back eyebrow={challenge.difficulty + ' · App generated'} title={challenge.title + '.'} action={<Badge label={host ? 'You host' : 'Demo'} tone="neutral" />} />
    <View style={{ gap: 8, marginBottom: 22 }}>
      <AppText color={colors.muted}>{goalText(challenge.requiredRuns, challenge.minimumDistanceMeters)}</AppText>
      <AppText variant="caption">{settled ? 'Challenge complete' : timeLeft(challenge.endsAt)}</AppText>
    </View>
    <ErrorNotice message={error} onDismiss={() => setError(null)} />
    <Surface dark>
      {settled ? <>
        <Icon name={goalMet ? 'sparkles-outline' : 'leaf-outline'} color={colors.lime} size={34} />
        <AppText color={colors.cream} variant="title" style={{ fontSize: 30, marginVertical: 12 }}>{goalMet ? 'You showed up.' : everyoneMissed ? 'A fresh start.' : 'Next week is yours.'}</AppText>
        <AppText color="#D2DDCE">{everyoneMissed ? 'Nobody met the goal, so everyone gets their pledge back.' : goalMet ? 'Your pledge is back, plus your share of missed pledges.' : 'Your pledge went to the friends who met the goal.'}</AppText>
        {payout && <><AppText color={colors.lime} variant="number" style={{ marginTop: 15 }}>{money(payout.totalMinor)}</AppText><AppText color="#D2DDCE" variant="caption">Simulated payout · CAD</AppText></>}
      </> : lobby ? <>
        <AppText color="#D2DDCE" variant="caption">Your lobby</AppText>
        <AppText color={colors.cream} variant="title" style={{ fontSize: 30, marginVertical: 12 }}>Good company first.</AppText>
        <AppText color="#D2DDCE">{host ? 'Bring your friends in, then start your seven-day challenge.' : 'The host starts the week when the group is ready.'}</AppText>
      </> : <>
        <AppText color="#D2DDCE" variant="caption">Your progress</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 7 }}><AppText variant="number" color={colors.cream}>{me?.verifiedRuns ?? 0} / {challenge.requiredRuns}</AppText><AppText color="#D2DDCE" variant="caption">runs complete</AppText></View>
        <ProgressDots completed={me?.verifiedRuns ?? 0} total={challenge.requiredRuns} dark />
        <AppText color={colors.lime} variant="caption">{goalMet ? "Goal met. You're in the finishers' circle." : remaining + (remaining === 1 ? ' run to go. You’ve got this.' : ' runs to go. Keep showing up.')}</AppText>
      </>}
    </Surface>
    {settled && payout ? <Surface style={{ marginTop: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><AppText color={colors.muted}>Pledge returned</AppText><AppText>{money(payout.pledgeReturnedMinor)}</AppText></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><AppText color={colors.muted}>Bonus earned</AppText><AppText>{money(payout.bonusMinor)}</AppText></View>
    </Surface> : <View style={{ flexDirection: 'row', marginVertical: 23 }}>
      <View style={{ flex: 1, borderRightWidth: 1, borderColor: colors.line }}><AppText variant="caption" color={colors.muted}>{me ? 'Your pledge' : 'Pledge per person'}</AppText><AppText variant="number" style={{ fontSize: 31 }}>{money(challenge.pledgeMinor)}</AppText><AppText variant="caption" color={colors.muted}>CAD · simulated</AppText></View>
      <View style={{ flex: 1, paddingLeft: 22 }}><AppText variant="caption" color={colors.muted}>Shared pot</AppText><AppText variant="number" style={{ fontSize: 31 }}>{money(challenge.pledgeMinor * challenge.participants.length)}</AppText><AppText variant="caption" color={colors.muted}>{challenge.participants.length} friends together</AppText></View>
    </View>}
    {lobby && !me && <Button label={'Join & pledge ' + money(challenge.pledgeMinor)} loading={busy} onPress={() => void perform({ type: 'join', code: challenge.inviteCode })} />}
    <Divider /><AppText style={{ fontSize: 18, fontWeight: '600', marginBottom: 14 }}>In it together</AppText>
    {challenge.participants.map((person) => <View key={person.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 }}>
      <Avatar user={userById(person.userId)} /><View style={{ flex: 1 }}><AppText style={{ fontWeight: '500' }}>{userById(person.userId)?.name}{person.userId === currentUser.id ? ' · You' : ''}</AppText>{person.userId === challenge.hostId && <AppText variant="caption" color={colors.muted}>Host</AppText>}</View>
      {settled ? <AppText style={{ fontWeight: '600' }}>{money(challenge.payouts.find((p) => p.userId === person.userId)?.totalMinor ?? 0)}</AppText>
        : lobby ? <Badge label="Joined" /> : person.verifiedRuns >= challenge.requiredRuns ? <Badge label="Goal met" /> : <AppText variant="caption" color={colors.muted}>{person.verifiedRuns} / {challenge.requiredRuns} runs</AppText>}
    </View>)}
    {lobby && me && <>
      <Divider />
      <Surface style={{ gap: 12 }}>
        <AppText variant="label" color={colors.muted}>INVITE CODE</AppText><AppText style={{ fontSize: 26, letterSpacing: 3, fontWeight: '600' }} selectable>{challenge.inviteCode}</AppText>
        <Button label="Share demo invite" variant="secondary" icon="share-outline" onPress={() => { void Share.share({ message: 'Join my pledgefit demo pot with code ' + challenge.inviteCode + '. This is a local demo; this code works on the device that created the pot.' }).catch((e) => setError(errorMessage(e))); }} />
        <AppText variant="caption" color={colors.muted}>Demo pots are saved on this device. Use the demo controls below to add friends.</AppText>
      </Surface>
      <Surface style={{ marginTop: 16, gap: 12 }}>
        <AppText style={{ fontWeight: '600' }}>{challenge.replacementUsed ? 'A new goal, together.' : 'Want a different challenge?'}</AppText>
        <AppText variant="caption" color={colors.muted}>{challenge.replacementUsed ? 'Your group used its one replacement. This is your final goal.' : challenge.replacementVotes.length + ' of ' + votesNeeded + ' votes needed. A majority replaces the goal once, at the same difficulty.'}</AppText>
        {!challenge.replacementUsed && <Button label={challenge.replacementVotes.includes(currentUser.id) ? 'Your vote is in' : 'Vote to replace'} variant="secondary" loading={busy} disabled={challenge.replacementVotes.includes(currentUser.id)} onPress={() => void perform({ type: 'vote', id })} />}
      </Surface>
      {host ? <View style={{ marginTop: 20, gap: 9 }}>
        <Button label="Start the seven-day challenge" icon="play-outline" loading={busy} disabled={challenge.participants.length < 2} onPress={() => void perform({ type: 'start', id })} />
        {challenge.participants.length < 2 && <AppText variant="caption" color={colors.muted}>Add a demo friend below to start your pot.</AppText>}
      </View> : <AppText color={colors.muted} style={{ marginTop: 18 }}>Waiting for {userById(challenge.hostId)?.name} to start the week.</AppText>}
    </>}
    {!lobby && me && <>
      <Divider /><Pressable accessibilityRole="button" accessibilityState={{ expanded: showRuns }} onPress={() => setShowRuns(!showRuns)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <AppText style={{ fontWeight: '600', fontSize: 18 }}>Your verified runs</AppText><Icon name={showRuns ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      {showRuns && (runs.length ? runs.map((run) => <View key={run.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
        <View style={{ backgroundColor: colors.softGreen, borderRadius: 12, padding: 10 }}><Icon name="footsteps-outline" size={20} /></View>
        <View style={{ flex: 1 }}><AppText>{new Date(run.completedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</AppText><AppText variant="caption" color={colors.muted}>Verified · {Math.round(run.durationSeconds / 60)} min</AppText></View><AppText style={{ fontWeight: '600' }}>{distance(run.distanceMeters)}</AppText>
      </View>) : <AppText color={colors.muted} style={{ paddingVertical: 15 }}>Your first run is ahead of you.</AppText>)}
    </>}
    {me && !settled && <>
      <Divider /><Pressable accessibilityRole="button" accessibilityState={{ expanded: showDemo }} onPress={() => setShowDemo(!showDemo)} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, alignItems: 'center' }}>
        <AppText style={{ fontWeight: '600' }}>Demo controls</AppText><Icon name={showDemo ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      <AppText variant="caption" color={colors.muted}>Simulate friends and activity to try the whole experience.</AppText>
      {showDemo && <View style={{ gap: 10, marginTop: 16 }}>
        {lobby ? <>
          <Button label="Add a demo friend" icon="person-add-outline" variant="secondary" disabled={busy || challenge.participants.length >= demo.users.length} onPress={() => void perform({ type: 'addFriend', id })} />
          <Button label="Simulate a friend's vote" variant="secondary" disabled={busy || challenge.replacementUsed || !challenge.participants.some((p) => p.userId !== currentUser.id && !challenge.replacementVotes.includes(p.userId))} onPress={() => void perform({ type: 'friendVote', id })} />
          {!host && <Button label="Simulate host starting" variant="secondary" disabled={busy} onPress={() => void perform({ type: 'demoHostStart', id })} />}
        </> : <>
          <Button label="Simulate a verified run" icon="footsteps-outline" variant="secondary" disabled={busy || goalMet || new Date(challenge.endsAt!).getTime() <= Date.now()} onPress={() => void perform({ type: 'addRun', id })} />
          <Button label="Fast-forward to results" icon="play-forward-outline" variant="secondary" disabled={busy} onPress={() => void perform({ type: 'settle', id })} />
          <AppText variant="caption" color={colors.muted}>Ends the demo week now. Friends who haven't met the goal will miss it.</AppText>
        </>}
      </View>}
    </>}
    <Divider />
    {settled && <Button label="Host another challenge" icon="add" onPress={() => router.push('/create')} />}
    <Button label="How payouts work" variant="ghost" icon="wallet-outline" onPress={() => router.push('/how-it-works')} />
    <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: 10 }}>All activity and money are simulated. No payment is collected.</AppText>
  </Screen>;
}
