import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { colors, spacing, typography } from '../src/theme';

export default function Onboarding() {
  return (
    <View style={styles.container}>
      <Text style={[typography.h1, { color: colors.pink }]}>Unnamed</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
        Deposit to earn. Walk to unlock.
      </Text>
      <Link href="/deposit" style={{ marginTop: spacing.xl, color: colors.purple, fontSize: 16 }}>
        Get started →
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
