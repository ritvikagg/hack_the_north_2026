import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Badge, Button, Divider, ErrorNotice, PageHeader, Screen, Surface } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { UNLOCK_RULES } from '@/lib/unlockRules';
import { REWARD_PARTNERS } from '@/data/rewardPartners';
import { colors, errorMessage, money } from '@/theme';

export default function Wallet() {
  const user = useAppStore(s => s.user);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  function deposit(amount: number) {
    try { useAppStore.getState().addDeposit(amount); setError(null); setMessage(money(amount * 100) + ' added to your simulated walking wallet.'); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <Screen>
    <PageHeader title="Walk to unlock." eyebrow="Walking wallet · demo" back subtitle="Try the original step-tier reward system with a separate simulated balance." />
    <ErrorNotice message={error} />
    {message && <AppText accessibilityLiveRegion="polite" style={{ marginBottom: 14 }}>{message}</AppText>}
    <Surface dark style={{ gap: 12 }}><AppText color={colors.lime}>Unlocked</AppText><AppText variant="number" color={colors.cream}>{money(Math.round(user.unlockedAmount * 100))}</AppText><AppText color={colors.cream}>{money(Math.round(user.lockedAmount * 100))} locked · {money(Math.round(user.depositBalance * 100))} deposited</AppText><AppText variant="caption" color={colors.lime}>{user.streak} qualifying sessions in a row</AppText></Surface>
    <AppText variant="caption" color={colors.muted} style={{ marginVertical: 18 }}>This balance is separate from social pots and personal step pledges. No real payment or withdrawal is available.</AppText>
    <View style={{ gap: 10 }}>{[20, 50, 100].map(amount => <Button key={amount} label={'Add ' + money(amount * 100) + ' demo funds'} variant="secondary" onPress={() => deposit(amount)} />)}</View>
    <Divider /><AppText style={{ fontWeight: '600', marginBottom: 14 }}>One verified session unlocks</AppText>
    {UNLOCK_RULES.map(rule => <View key={rule.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}><AppText>{rule.label}</AppText><AppText>{Math.round(rule.unlockPercent * 100)}% of locked balance</AppText></View>)}
    <AppText variant="caption" color={colors.muted} style={{ marginVertical: 14 }}>The highest reached tier applies once per session. Debug or rejected sessions unlock nothing.</AppText>
    <Button label="Record a walk" icon="walk-outline" onPress={() => router.push('/workout')} />
    <Divider /><AppText variant="title" style={{ fontSize: 28 }}>Rewards preview</AppText>
    <AppText variant="caption" color={colors.muted}>Sample offers only. Partner redemption is not connected.</AppText>
    {REWARD_PARTNERS.map(partner => <Surface key={partner.id} style={{ marginTop: 14, gap: 8 }}><Badge label="Preview only" tone="neutral" /><AppText style={{ fontWeight: '600' }}>{partner.name}</AppText><AppText>{partner.description}</AppText><AppText variant="caption" color={colors.muted}>{money(partner.creditCost * 100)} credit cost · no redemption</AppText></Surface>)}
  </Screen>;
}
