import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Badge, Button, EmptyState, PageHeader, Screen, Surface } from '@/components/ui';
import { GaitResult } from '@/components/GaitResult';
import { BackendGaitResult } from '@/components/BackendGaitResult';
import { useAppStore } from '@/store/useAppStore';
import { colors, money } from '@/theme';

export default function Activity() {
  const workouts = useAppStore(s => s.workouts);
  const [expanded, setExpanded] = useState<string | null>(null);
  return <Screen>
    <PageHeader title="Every step, saved." eyebrow="Your walks" back subtitle="Phone recordings and their validation results, saved on this device." />
    <Button label="Record a walk" icon="walk-outline" onPress={() => router.push('/workout')} />
    {!workouts.length && <View style={{ marginTop: 20 }}><EmptyState title="Your first steps await." message="Record a walk to see your step count and walking analysis here." /></View>}
    {[...workouts].reverse().map(workout => <Surface key={workout.id} style={{ gap: 12, marginTop: 16 }}>
      <Badge label={workout.source === 'debug-injected' ? 'Debug · no credit' : workout.verified ? 'Validated walk' : 'Not verified'} tone={workout.verified ? 'green' : 'peach'} />
      <AppText style={{ fontSize: 24, fontWeight: '600' }}>{workout.steps.toLocaleString()} steps</AppText>
      <AppText variant="caption" color={colors.muted}>{new Date(workout.timestamp).toLocaleString()}</AppText>
      {(workout.unlockedAmount ?? 0) > 0 && <AppText>{money(Math.round(workout.unlockedAmount! * 100))} unlocked in walking wallet</AppText>}
      {workout.backendScore && <BackendGaitResult score={workout.backendScore} />}
      {workout.gait && <><Button label={expanded === workout.id ? 'Hide analysis' : 'See walking analysis'} variant="ghost" onPress={() => setExpanded(expanded === workout.id ? null : workout.id)} />{expanded === workout.id && <GaitResult analysis={workout.gait} debug={workout.source === 'debug-injected'} />}</>}
    </Surface>)}
  </Screen>;
}
