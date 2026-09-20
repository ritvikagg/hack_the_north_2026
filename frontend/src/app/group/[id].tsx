import { Pressable, Share, View } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Avatar, Badge, Button, Divider, EmptyState, ErrorNotice, Icon, PageHeader, Screen, Surface } from '../../components/ui';
import { colors, goalText, money, errorMessage } from '../../theme';
import { useDemo } from '../../state/DemoProvider';

export default function GroupDetail() {
  const { demo, userById } = useDemo();
  const [error, setError] = useState<string | null>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = demo.groups.find((item) => item.id === id);
  if (!group) return <Screen><PageHeader title="Group not found" back /><EmptyState title="Find your people." message="Open Groups to explore the sample group." action={<Button label="Go to Groups" onPress={() => router.replace('/groups')} />} /></Screen>;
  const challenges = demo.challenges.filter((challenge) => challenge.groupId === group.id);
  return <Screen><PageHeader back title={`${group.name}.`} eyebrow="Your group" subtitle={group.description} action={<Badge label="Demo" tone="neutral" />} />
    <View style={{ gap: 12, marginBottom: 26 }}><AppText style={{ fontSize: 18, fontWeight: '600' }}>The crew</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>{group.memberIds.map((userId) => <View key={userId} style={{ alignItems: 'center', gap: 5 }}><Avatar user={userById(userId)} size={52} /><AppText variant="caption">{userById(userId)?.name}</AppText></View>)}</View></View>
    <Surface style={{ marginBottom: 20, gap: 12 }}><AppText variant="label">GROUP INVITE CODE</AppText><AppText selectable style={{ fontSize: 24 }}>{group.inviteCode}</AppText><Button label="Share group invite" variant="secondary" onPress={() => void Share.share({ message: `Join our Pledgefit group with code ${group.inviteCode}. Enter it on the Groups tab.` }).catch((e) => setError(errorMessage(e)))} /></Surface>
    <ErrorNotice message={error} />
    <Button label="Host a group challenge" icon="add" onPress={() => router.push({ pathname: '/create', params: { groupId: group.id } })} />
    <Divider /><AppText style={{ fontSize: 18, fontWeight: '600', marginBottom: 16 }}>Group challenges</AppText>
    {challenges.map((challenge) => <Pressable key={challenge.id} accessibilityRole="button" accessibilityLabel={`Open ${challenge.title}`} style={{ marginBottom: 14 }} onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } })}><Surface style={{ gap: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Badge label={challenge.status === 'settled' ? 'Completed' : challenge.status === 'active' ? 'In progress' : 'Gathering friends'} tone={challenge.status === 'active' ? 'green' : 'peach'} /><Icon name="arrow-forward" size={20} /></View><AppText variant="title" style={{ fontSize: 28, lineHeight: 34 }}>{challenge.title}</AppText><AppText variant="caption" color={colors.muted}>{goalText(challenge.requiredRuns, challenge.minimumDistanceMeters)}</AppText><AppText variant="caption" color={colors.muted}>{money(challenge.pledgeMinor)} pledge · {challenge.participants.length} friends</AppText></Surface></Pressable>)}
  </Screen>;
}
