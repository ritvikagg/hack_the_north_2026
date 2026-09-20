import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText, Brand, Button, ErrorNotice, Screen } from '../components/ui';
import { colors } from '../theme';
import { backend, backendError } from '../services/backend';

export default function Auth() {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function submit() {
    setError(null); setNotice(null);
    if (signup && !name.trim()) { setError('Enter your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < 6) { setError('Use a password with at least 6 characters.'); return; }
    setBusy(true);
    try {
      const result = signup
        ? await backend.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { display_name: name.trim() } } })
        : await backend.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (result.error) throw result.error;
      if (!result.data.session) setNotice('Check your email to confirm your account, then sign in.');
    } catch (e) { setError(backendError(e)); } finally { setBusy(false); }
  }
  const input = { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 17, backgroundColor: colors.white, color: colors.ink, fontSize: 16 };
  return <Screen contentStyle={{ justifyContent: 'center', gap: 20 }}>
    <Brand /><AppText variant="hero">{signup ? 'Make yourself a promise.' : 'Welcome back.'}</AppText>
    <AppText color={colors.muted}>Move solo or with friends. Put a little behind your goals.</AppText>
    <View style={{ gap: 12 }}>
      {signup && <TextInput accessibilityLabel="Your name" placeholder="Your name" autoComplete="name" maxLength={60} value={name} onChangeText={setName} editable={!busy} style={input} />}
      <TextInput accessibilityLabel="Email" placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} style={input} />
      <TextInput accessibilityLabel="Password" placeholder="Password (6+ characters)" secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChangeText={setPassword} editable={!busy} style={input} onSubmitEditing={() => !busy && void submit()} />
    </View>
    <ErrorNotice message={error} />{notice && <AppText>{notice}</AppText>}
    <Button label={signup ? 'Create account' : 'Sign in'} loading={busy} onPress={() => void submit()} />
    <Button label={signup ? 'Already have an account? Sign in' : 'New here? Sign up'} variant="ghost" disabled={busy} onPress={() => { setSignup(!signup); setError(null); setNotice(null); }} />
    <AppText variant="caption" color={colors.muted}>Hackathon preview · Real accounts, simulated deposits and donations. No payment is collected.</AppText>
  </Screen>;
}
