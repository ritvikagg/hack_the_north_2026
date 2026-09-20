import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, AvatarStack, Button, ErrorNotice, PageHeader, Screen, Surface } from '../../components/ui';
import { colors, errorMessage } from '../../theme';
import { useDemo } from '../../state/DemoProvider';
export default function Groups() {
  const { demo, dispatch, busy, storageError } = useDemo();
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [error, setError] = useState<string | null>(null);
  async function act(type: 'createGroup' | 'joinGroup') {
    try { setError(null); const id = await dispatch(type === 'createGroup' ? { type, name } : { type, code }); setName(''); setCode(''); router.push({ pathname: '/group/[id]', params: { id: id! } }); } catch(e) { setError(errorMessage(e)); }
  }
  const input = { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, backgroundColor: colors.white, fontSize: 16, color: colors.ink };
  return <Screen><PageHeader title="Your people. Your momentum." eyebrow="Groups" subtitle="A little encouragement goes a long way." />
    <ErrorNotice message={error ?? storageError} />
    {demo.groups.map((g) => <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={'Open ' + g.name} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} style={{ marginBottom: 16 }}><Surface style={{ gap: 12 }}><AppText variant="title" style={{ fontSize: 28 }}>{g.name}</AppText><AvatarStack users={demo.users.filter((u) => g.memberIds.includes(u.id))} /><AppText>{g.memberIds.length} members</AppText></Surface></Pressable>)}
    {!demo.groups.length && <AppText color={colors.muted}>Create a group or join your friends using their group code.</AppText>}
    <Surface style={{ marginTop: 20, gap: 12 }}><AppText style={{ fontWeight: '600' }}>Start a group</AppText><TextInput accessibilityLabel="Group name" placeholder="Group name" value={name} onChangeText={setName} maxLength={60} editable={!busy} style={input} /><Button label="Create group" disabled={busy || !name.trim()} onPress={() => void act('createGroup')} /></Surface>
    <Surface style={{ marginTop: 20, gap: 12 }}><AppText style={{ fontWeight: '600' }}>Find your people</AppText><Button label="Scan group QR" icon="qr-code-outline" onPress={() => router.push('/group/scan')} /><AppText variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>or enter the invite code</AppText><TextInput accessibilityLabel="Group invite code" placeholder="Group invite code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={20} editable={!busy} style={input} /><Button label="Join group" variant="secondary" disabled={busy || !code.trim()} onPress={() => void act('joinGroup')} /></Surface>
  </Screen>;
}
