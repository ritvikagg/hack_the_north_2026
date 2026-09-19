import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, AvatarStack, Badge, Icon, PageHeader, Screen, Surface } from '../../components/ui';
import { colors } from '../../theme';
import { useDemo } from '../../state/DemoProvider';

export default function Groups() {
  const { demo } = useDemo();
  return <Screen><PageHeader title="Your people. Your momentum." eyebrow="Groups" subtitle="A little encouragement goes a long way." action={<Badge label="Demo" tone="neutral" />} />
    {demo.groups.map((group) => <Pressable key={group.id} accessibilityRole="button" accessibilityLabel={`Open ${group.name}`} onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })}>
      <Surface style={{ gap: 18 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.lime }}><Icon name="sunny-outline" size={30} /></View><Icon name="arrow-forward" /></View><AppText variant="title" style={{ fontSize: 29 }}>{group.name}</AppText><AppText color={colors.muted}>{group.description}</AppText><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><AvatarStack users={demo.users.filter((user) => group.memberIds.includes(user.id))} /><AppText variant="caption" color={colors.muted}>{group.memberIds.length} members</AppText></View></Surface>
    </Pressable>)}
    <View style={{ marginTop: 28, paddingHorizontal: 8, gap: 10 }}><AppText style={{ fontWeight: '600' }}>Everyone brings something.</AppText><AppText color={colors.muted}>A shared goal. A little accountability. A reason to get out the door.</AppText><AppText variant="caption" color={colors.muted}>Explore the sample group to see challenges and friends.</AppText></View>
  </Screen>;
}
