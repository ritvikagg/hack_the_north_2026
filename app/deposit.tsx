// PERSON 1 owns this screen.
// TODO: deposit amount input ($20–200 per the deck), fake "Confirm deposit"
// button (no real payment rail needed), calls useAppStore().addDeposit(),
// then router.push('/dashboard').
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../src/theme';

export default function Deposit() {
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.textPrimary }]}>Deposit screen — TODO (Person 1)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
