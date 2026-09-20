import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { AppText, Avatar, Badge, Brand, Button, Icon, Screen } from '@/components/ui';
import { colors } from '@/theme';
import { useDemo } from '@/state/DemoProvider';

export default function Welcome() {
  const { demo } = useDemo();
  return <Screen contentStyle={{ paddingTop: 22, justifyContent: 'space-between', gap: 30 }}>
    <View style={s.row}><Brand /><Badge label="Made for together" /></View>
    <View style={s.art} accessibilityLabel="Friends making progress together">
      <View style={s.orbit} />
      <View style={s.center}><Icon name="leaf-outline" size={54} color={colors.lime} /><AppText color={colors.cream} style={{ fontSize: 19, fontWeight: '600' }}>Small steps.</AppText><AppText color={colors.lime} variant="caption">Bigger together.</AppText></View>
      <View style={s.friendOne}><Avatar user={demo.users[0]} size={65} /></View>
      <View style={s.friendTwo}><Avatar user={demo.users[1]} size={58} /></View>
      <View style={s.friendThree}><Avatar user={demo.users[2]} size={52} /></View>
      <View style={s.pot}><Icon name="heart" size={16} color={colors.forest} /><AppText variant="caption" style={{ fontWeight: '600' }}>A little accountability</AppText></View>
    </View>
    <View style={{ gap: 18 }}><AppText variant="hero" accessibilityRole="header">A little farther. Together.</AppText><AppText color={colors.muted} style={{ fontSize: 17, lineHeight: 27 }}>Make a pledge. Move with your friends. Turn showing up into something worth celebrating.</AppText></View>
    <View style={{ gap: 12 }}><Button label="Let's get moving" icon="arrow-forward" onPress={() => router.replace('/home')} /><AppText variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>Enter as Ryan. Record real walks; social pots and money are simulated.</AppText></View>
  </Screen>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  art: { height: 244, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  orbit: { position: 'absolute', width: 230, height: 230, borderWidth: 1, borderColor: colors.line, borderRadius: 115 },
  center: { width: 166, height: 166, borderRadius: 57, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', gap: 6, transform: [{ rotate: '-5deg' }] },
  friendOne: { position: 'absolute', top: 6, left: '12%' }, friendTwo: { position: 'absolute', top: 30, right: '5%' }, friendThree: { position: 'absolute', bottom: 10, left: '15%' },
  pot: { position: 'absolute', bottom: 20, right: 0, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 12, backgroundColor: colors.lime, borderRadius: 17, transform: [{ rotate: '5deg' }] },
});
