import { Stack } from 'expo-router';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Unnamed' }} />
      <Stack.Screen name="deposit" options={{ title: 'Deposit' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="workout" options={{ title: 'Workout' }} />
    </Stack>
  );
}
