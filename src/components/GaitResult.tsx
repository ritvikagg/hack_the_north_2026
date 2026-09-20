import { View } from 'react-native';
import type { GaitAnalysis } from '../types';
import { AppText, Badge, Surface } from './ui';
import { colors } from '../theme';

export function GaitResult({ analysis, debug = false }: { analysis: GaitAnalysis; debug?: boolean }) {
  const matches = analysis.isVerified && !debug;
  return <Surface style={{ gap: 12 }}>
    <Badge label={debug ? 'Injected steps · not verified' : matches ? 'Walking signal matches' : 'Not verified'} tone={matches ? 'green' : 'peach'} />
    <AppText>{debug ? 'Debug counts never earn activity credit or unlock a pledge.' : analysis.reason}</AppText>
    {[
      ['Cadence', `${Math.round(analysis.cadenceSpm)} steps/min`],
      ['Walking rhythm', `${Math.round(analysis.periodicity * 100)}%`],
      ['Step agreement', analysis.reportedSteps === null ? 'No step counter compared' : `${Math.round(analysis.stepAgreement * 100)}%`],
      ['Signal rate', `${analysis.sampleRateHz.toFixed(1)} Hz`],
      ['Samples', analysis.sampleCount.toLocaleString()],
      ['Confidence', `${Math.round(analysis.confidence * 100)}%`],
    ].map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between' }}><AppText variant="caption" color={colors.muted}>{label}</AppText><AppText variant="caption" style={{ flexShrink: 1 }}>{value}</AppText></View>)}
    <AppText variant="caption" color={colors.muted}>An on-device walking check. It does not establish run distance or provide a medical assessment.</AppText>
  </Surface>;
}
