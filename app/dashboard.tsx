// PERSON 1 owns this screen.
// TODO: pull `user` from useAppStore(), show locked/unlocked balance,
// progress bar, streak, and a button into /workout. Reward list from
// src/data/rewardPartners.ts can render here too.
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../src/theme';

export default function Dashboard() {
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.textPrimary }]}>Dashboard screen — TODO (Person 1)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
