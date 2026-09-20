import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { colors, typography } from '../src/theme';
import { useAppStore } from '../src/store/useAppStore';

export default function Dashboard() {
  const latestWorkout = useAppStore(state => state.workouts.at(-1));
  const gait = latestWorkout?.gait;
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.textPrimary }]}>Movement validation</Text>
      {gait ? (
        <>
          <Text style={[typography.h3, { color: gait.isVerified ? colors.success : colors.danger, marginTop: 16 }]}>
            {gait.isVerified ? 'Gait matches the step count' : 'Workout not verified'}
          </Text>
          <Text style={[typography.body, styles.detail]}>{gait.reason}</Text>
          <Text style={[typography.body, styles.detail]}>
            {gait.cadenceSpm.toFixed(0)} steps/min | {Math.round(gait.periodicity * 100)}% periodicity | {gait.sampleRateHz.toFixed(0)} Hz
          </Text>
        </>
      ) : (
        <Text style={[typography.body, styles.detail]}>Complete a validated workout to see its gait result.</Text>
      )}
      <Link href="/analysis" style={[typography.body, styles.link]}>Open walking analysis</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  detail: { color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
  link: { color: colors.pink, marginTop: 24 },
});
