import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme';
import { DemoProvider, useDemo } from '../state/DemoProvider';
import { ActivityIndicator, View } from 'react-native';

export default function RootLayout() {
  return <DemoProvider><AppLayout /></DemoProvider>;
}

function AppLayout() {
  const { ready } = useDemo();
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}><ActivityIndicator color={colors.forest} accessibilityLabel="Loading your demo" /></View>;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="challenge/[id]" />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="join" />
        <Stack.Screen name="create" />
        <Stack.Screen name="how-it-works" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
