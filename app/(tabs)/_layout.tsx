import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '@/components/ui';
import { colors } from '@/theme';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.forest, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.cream, borderTopColor: colors.line, paddingTop: 8 },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3 }, sceneStyle: { backgroundColor: colors.cream } }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Icon name="home-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: ({ color, size }) => <Icon name="people-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: ({ color, size }) => <Icon name="person-outline" color={color} size={size} /> }} />
  </Tabs>;
}
