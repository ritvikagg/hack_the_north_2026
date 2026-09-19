import { View } from 'react-native';
import { AppText, Badge, Divider, Icon, PageHeader, Screen, Surface } from '../components/ui';
import { colors } from '../theme';

export default function HowItWorks() {
  return <Screen><PageHeader back title="A promise with a little extra." eyebrow="How pledgefit works" />
    {[
      { number: '01', title: 'Pledge together.', text: 'Everyone commits the same amount: $5, $10, or $20 CAD. Together, your pledges make the pot.' },
      { number: '02', title: 'Show up for your goal.', text: 'The app generates a weekly running challenge at your chosen difficulty. Your group can vote for one replacement before it starts.' },
      { number: '03', title: 'Finish. Get rewarded.', text: 'Finishers receive their own pledge back and split the missed pledges equally. If everyone misses, everyone gets a refund.' },
    ].map((step) => <View key={step.number} style={{ flexDirection: 'row', gap: 16, marginBottom: 28 }}><AppText variant="label" color={colors.muted} style={{ marginTop: 6 }}>{step.number}</AppText><View style={{ flex: 1, gap: 9 }}><AppText style={{ fontSize: 21, fontWeight: '600' }}>{step.title}</AppText><AppText color={colors.muted}>{step.text}</AppText></View></View>)}
    <Surface dark><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="sparkles-outline" color={colors.lime} /><AppText variant="label" color={colors.lime}>AN EXAMPLE</AppText></View><AppText color={colors.cream} variant="title" style={{ marginVertical: 14 }}>4 friends. $20 pot.</AppText><AppText color="#D2DDCE">Each person pledges $5. Two people finish. Each finisher receives $10: their $5 pledge back, plus a $5 bonus.</AppText></Surface>
    <Divider /><Badge label="Demo only" tone="neutral" /><AppText variant="caption" color={colors.muted} style={{ marginTop: 12 }}>All money and activity shown in this prototype are simulated. No payment is collected.</AppText>
  </Screen>;
}
