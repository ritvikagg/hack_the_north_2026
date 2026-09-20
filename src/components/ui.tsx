import { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { colors, fonts } from '../theme';
import { User } from '../domain/models';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: ComponentProps<typeof Ionicons>['color'] }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function AppText({ children, variant = 'body', color, style, ...props }: {
  children: ReactNode; variant?: 'body' | 'title' | 'hero' | 'caption' | 'label' | 'number';
  color?: string; style?: StyleProp<TextStyle>;
} & Omit<ComponentProps<typeof Text>, 'style'>) {
  return <Text {...props} style={[s.text, textVariants[variant], color ? { color } : undefined, style]}>{children}</Text>;
}

export function Screen({ children, scroll = true, contentStyle }: { children: ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const bottomSpace = { paddingBottom: Math.max(36, insets.bottom + 24) };
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
    {scroll ? <ScrollView contentContainerStyle={[s.content, bottomSpace, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : <View style={[s.content, bottomSpace, { flex: 1 }, contentStyle]}>{children}</View>}
  </SafeAreaView>;
}

export function Brand() {
  return <View style={s.brand}><Icon name="leaf-outline" size={22} color={colors.forest} /><AppText style={s.brandText}>pledgefit</AppText></View>;
}

export function PageHeader({ title, eyebrow, subtitle, back = false, action }: { title: string; eyebrow?: string; subtitle?: string; back?: boolean; action?: ReactNode }) {
  return <View style={{ marginBottom: 26, gap: 10 }}>
    {back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} style={s.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}><Icon name="arrow-back" size={23} /></Pressable>}
    {eyebrow && <AppText variant="label" color={colors.muted}>{eyebrow.toUpperCase()}</AppText>}
    <View style={s.headingRow}><AppText variant="title" style={{ flex: 1 }} accessibilityRole="header">{title}</AppText>{action}</View>
    {subtitle && <AppText color={colors.muted}>{subtitle}</AppText>}
  </View>;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, icon, style }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; loading?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'primary' ? colors.cream : colors.forest;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading}
    onPress={() => { if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); onPress(); }}
    style={({ pressed }) => [s.button, variant === 'primary' ? s.primary : variant === 'secondary' ? s.secondary : s.ghost, { opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
    {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
    <AppText style={{ fontWeight: '600', color: fg, flexShrink: 1, textAlign: 'center' }}>{label}</AppText>
  </Pressable>;
}

export function Surface({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.surface, dark && { backgroundColor: colors.forest, borderColor: colors.forest }, style]}>{children}</View>;
}

export function Badge({ label, tone = 'green' }: { label: string; tone?: 'green' | 'neutral' | 'peach' }) {
  return <View style={[s.badge, { backgroundColor: tone === 'green' ? colors.softGreen : tone === 'peach' ? colors.peach : '#EDEEE4' }]}><AppText variant="caption" style={{ fontWeight: '600', color: colors.forest }}>{label}</AppText></View>;
}

export function Avatar({ user, size = 38 }: { user?: User; size?: number }) {
  return <View accessibilityLabel={user?.name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: user?.color ?? colors.softGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.cream }}><AppText style={{ fontSize: size * .34, fontWeight: '600' }}>{user?.initials ?? '?'}</AppText></View>;
}

export function AvatarStack({ users, max = 4 }: { users: User[]; max?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 0 }}>{users.slice(0, max).map((user, i) => <View key={user.id} style={{ marginLeft: i ? -9 : 0, zIndex: max - i }}><Avatar user={user} size={34} /></View>)}{users.length > max && <AppText variant="caption" style={{ marginLeft: 7 }}>+{users.length - max}</AppText>}</View>;
}

export function ProgressDots({ completed, total, dark = false }: { completed: number; total: number; dark?: boolean }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Runs completed" accessibilityValue={{ min: 0, max: total, now: Math.min(completed, total), text: `${completed} of ${total} runs` }} style={{ flexDirection: 'row', gap: 7, marginVertical: 15 }}>{Array.from({ length: total }, (_, i) => <View key={i} style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: i < completed ? dark ? colors.lime : colors.forest : dark ? '#54705C' : colors.line }} />)}</View>;
}

export function ErrorNotice({ message, onDismiss }: { message?: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return <View accessibilityRole="alert" style={s.error}><Icon name="alert-circle-outline" color={colors.danger} size={20} /><AppText style={{ flex: 1 }} color={colors.danger}>{message}</AppText>{onDismiss && <Pressable onPress={onDismiss} accessibilityLabel="Dismiss error" hitSlop={12}><Icon name="close" color={colors.danger} /></Pressable>}</View>;
}

export function EmptyState({ title, message, action, icon = 'leaf-outline' }: { title: string; message: string; action?: ReactNode; icon?: IconName }) {
  return <Surface style={{ alignItems: 'center', gap: 14, paddingVertical: 34 }}><Icon name={icon} color={colors.forest} size={34} /><AppText style={{ fontSize: 20, fontWeight: '600', textAlign: 'center' }}>{title}</AppText><AppText color={colors.muted} style={{ textAlign: 'center' }}>{message}</AppText>{action}</Surface>;
}

export function Divider() { return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 20 }} />; }

const textVariants = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 24 },
  title: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 42, letterSpacing: -1.2 },
  hero: { fontFamily: fonts.serif, fontSize: 48, lineHeight: 54, letterSpacing: -1.9 },
  caption: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 11, lineHeight: 18, letterSpacing: 1.6, fontWeight: '600' },
  number: { fontSize: 44, lineHeight: 52, fontWeight: '600', letterSpacing: -1.8, fontVariant: ['tabular-nums'] },
});
const s = StyleSheet.create({
  text: { color: colors.ink }, screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 24, paddingBottom: 36, flexGrow: 1 },
  brand: { flexDirection: 'row', gap: 7, alignItems: 'center' }, brandText: { fontSize: 23, fontWeight: '600', letterSpacing: -1 },
  back: { width: 44, height: 44, justifyContent: 'center', marginBottom: 2 }, headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { minHeight: 54, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 9 },
  primary: { backgroundColor: colors.forest }, secondary: { backgroundColor: colors.softGreen }, ghost: { backgroundColor: 'transparent' },
  surface: { borderRadius: 24, padding: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: colors.paleDanger, borderRadius: 14, marginBottom: 14 },
});
