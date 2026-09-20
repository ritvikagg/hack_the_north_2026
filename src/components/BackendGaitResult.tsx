import { useState } from 'react';
import { View } from 'react-native';
import type { GaitScore } from '../domain/gaitScore';
import { AppText, Badge, Button, ErrorNotice, Surface } from './ui';
import { colors } from '../theme';

export function BackendGaitResult({ score, busy = false, error, onRetry }: { score?: GaitScore | null; busy?: boolean; error?: string | null; onRetry?: () => void }) {
  const [details, setDetails] = useState(false);
  return <Surface style={{ gap: 12 }}>
    <AppText style={{ fontWeight: '600' }}>Backend gait model</AppText>
    {busy ? <AppText accessibilityLiveRegion="polite" color={colors.muted}>Checking your recording with the trained model…</AppText> : score ? <>
      <Badge label={score.decision === 'genuine' ? 'Typical walking pattern' : 'Different walking pattern'} tone={score.decision === 'genuine' ? 'green' : 'peach'} />
      <AppText variant="number">{Math.round(score.genuine_probability * 100)}%</AppText>
      <AppText variant="caption" color={colors.muted}>Model probability of the training set’s “genuine” class. This score does not authorize or reverse a payout.</AppText>
      <Button label={details ? 'Hide model details' : 'See model details'} variant="ghost" onPress={() => setDetails(!details)} />
      {details && <View style={{ gap: 8 }}><AppText variant="caption" color={colors.muted}>{score.model_type}</AppText>{Object.entries(score.feature_values).map(([name, value]) => <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><AppText variant="caption" style={{ flex: 1 }}>{name.replace(/_/g, ' ')}</AppText><AppText variant="caption">{value.toFixed(3)}</AppText></View>)}{score.limitations.map(text => <AppText key={text} variant="caption" color={colors.muted}>{text}</AppText>)}</View>}
    </> : <><ErrorNotice message={error} /><AppText variant="caption" color={colors.muted}>No backend score saved yet. Phone validation is a separate check.</AppText>{onRetry && <Button label="Retry backend check" variant="secondary" onPress={onRetry} />}</>}
  </Surface>;
}
