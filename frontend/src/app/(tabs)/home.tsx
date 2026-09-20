import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Avatar, AvatarStack, Badge, Brand, Button, ErrorNotice, Icon, ProgressDots, Screen, Surface } from '../../components/ui';
import { colors, goalText, money, timeLeft } from '../../theme';
import { useDemo } from '../../state/DemoProvider';

export default function Home() {
  const { demo, currentUser, storageError, refresh } = useDemo();
  const mine = demo.challenges.filter((c) => c.participants.some((p) => p.userId === currentUser.id));
  const invitations = demo.challenges.filter((c) => c.status === 'lobby' && !c.participants.some((p) => p.userId === currentUser.id));
  return <Screen>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
      <Brand /><Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.navigate('/you')}><Avatar user={currentUser} size={44} /></Pressable>
    </View>
    <AppText variant="label" color={colors.muted}>HEY, {currentUser.name.toUpperCase()}</AppText>
    <AppText variant="title" style={{ marginTop: 8, marginBottom: 10 }}>Good things start with showing up.</AppText>
    <AppText color={colors.muted} style={{ marginBottom: 22 }}>Make a promise to yourself. Or bring your people.</AppText>
    <ErrorNotice message={storageError} />
    <View style={{ gap: 10, marginBottom: 26 }}>
      <Button label="Start a solo challenge" icon="person-outline" onPress={() => router.push({ pathname: '/create', params: { mode: 'solo' } })} />
      <Button label="Host a challenge" icon="add" onPress={() => router.push('/create')} />
      <Button label="Join a pot" variant="secondary" icon="people-outline" onPress={() => router.push('/join')} />
    </View>
    {invitations.length > 0 && <Surface style={{ backgroundColor: colors.softGreen, marginBottom: 26, gap: 10 }}>
      <AppText variant="label" color={colors.muted}>YOU'RE INVITED</AppText>
      <AppText style={{ fontWeight: '600', fontSize: 18 }}>Your group has an open party.</AppText>
      <AppText color={colors.muted}>{invitations[0].title}</AppText>
      <Button label="View invitation" variant="ghost" icon="arrow-forward" onPress={() => router.push({ pathname: '/join', params: { code: invitations[0].inviteCode } })} />
    </Surface>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <AppText style={{ fontWeight: '600', fontSize: 18 }}>Your challenges</AppText><Badge label="Demo" tone="neutral" />
    </View>
    {!mine.length && <Surface style={{ marginBottom: 20 }}><AppText>Your next chapter starts here. Create a solo challenge or join a friend's party.</AppText></Surface>}
    {mine.map((challenge) => {
      const me = challenge.participants.find((p) => p.userId === currentUser.id)!;
      const friends = demo.users.filter((user) => challenge.participants.some((p) => p.userId === user.id));
      const active = challenge.status === 'active';
      const payout = challenge.payouts.find((p) => p.userId === currentUser.id);
      return <Pressable key={challenge.id} accessibilityRole="button" accessibilityLabel={'Open ' + challenge.title}
        onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } })} style={{ marginBottom: 18 }}>
        <Surface dark={active} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="label" color={active ? colors.lime : colors.muted}>{challenge.mode === 'solo' ? 'SOLO' : challenge.hostId === currentUser.id ? 'PARTY · YOU HOST' : 'PARTY'} · {challenge.requiredDays} DAYS</AppText>
            <Icon name="arrow-forward" color={active ? colors.lime : colors.forest} size={21} />
          </View>
          <AppText variant="title" color={active ? colors.cream : colors.ink} style={{ fontSize: 29, lineHeight: 36 }}>{challenge.title}.</AppText>
          <AppText color={active ? '#D2DDCE' : colors.muted} variant="caption">{goalText(challenge.dailyStepGoal, challenge.requiredDays)}</AppText>
          {active ? <><AppText variant="number" color={colors.cream}>{me.completedDays} / {challenge.requiredDays}</AppText><ProgressDots completed={me.completedDays} total={challenge.requiredDays} dark /><AppText color={colors.lime} variant="caption">{timeLeft(challenge.endsAt)}</AppText></>
            : <Badge label={challenge.status === 'lobby' ? 'Lobby · waiting to start' : 'Completed · ' + money(payout?.totalMinor ?? 0) + ' returned'} tone={challenge.status === 'lobby' ? 'peach' : 'green'} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AvatarStack users={friends} /><AppText color={active ? '#D2DDCE' : colors.muted} variant="caption">{money(challenge.pledgeMinor * friends.length)} pot · CAD</AppText>
          </View>
        </Surface>
      </Pressable>;
    })}
    <Button label="How the pledge works" variant="ghost" icon="information-circle-outline" onPress={() => router.push('/how-it-works')} />
    <Button label="Refresh challenges" variant="ghost" icon="refresh-outline" onPress={() => void refresh()} />
    <AppText variant="caption" color={colors.muted}>Shared updates refresh every few seconds. Deposits and charity allocations are simulated.</AppText>
  </Screen>;
}
