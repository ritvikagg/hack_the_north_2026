import { useState } from 'react';
import { TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Badge, Button, ErrorNotice, PageHeader, Screen, Surface } from '../components/ui';
import { colors, errorMessage, goalText, money } from '../theme';
import { useDemo } from '../state/DemoProvider';
import type { Challenge } from '../domain/models';
export default function JoinPot() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { currentUser, busy, dispatch, findParty } = useDemo();
  const [code, setCode] = useState(params.code ?? '');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function find() { setFinding(true); setError(null); setChallenge(null); try { setChallenge(await findParty(code)); } catch(e) { setError(errorMessage(e)); } finally { setFinding(false); } }
  const joined = challenge?.participants.some((p) => p.userId === currentUser.id);
  async function join() { try { setError(null); const id = await dispatch({ type: 'join', code: challenge!.inviteCode }); router.replace({ pathname: '/challenge/[id]', params: { id: id! } }); } catch(e) { setError(errorMessage(e)); } }
  return <Screen><PageHeader back title="There's room for you." eyebrow="Join a party" subtitle="Get an invite code from your friend." />
    <TextInput accessibilityLabel="Invite code" value={code} onChangeText={(v) => { setCode(v); setChallenge(null); setError(null); }} editable={!busy && !finding} autoCapitalize="characters" autoCorrect={false} maxLength={20} placeholder="Invite code" onSubmitEditing={() => !finding && void find()} style={{ padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white, fontSize: 20, marginBottom: 14 }} />
    <Button label="Find party" loading={finding} disabled={busy || !code.trim()} onPress={() => void find()} />
    <ErrorNotice message={error} />
    {challenge && <Surface style={{ marginTop: 24, gap: 16 }}><Badge label={challenge.status === 'lobby' ? 'Open party' : challenge.status === 'active' ? 'In progress' : 'Completed'} />
      <AppText variant="title">{challenge.title}</AppText><AppText>{goalText(challenge.requiredRuns, challenge.minimumDistanceMeters)}</AppText>
      <AppText>{challenge.participants.length} participants · {money(challenge.pledgeMinor)} per person</AppText>
      <AppText>Pot {joined ? 'now' : 'after you join'}: {money(challenge.pledgeMinor * (challenge.participants.length + (joined ? 0 : 1)))}</AppText>
      <AppText variant="caption" color={colors.muted}>10% goes to charity; finishers split 90%. If nobody finishes, the whole pot goes to charity. All money is simulated.</AppText>
      <Button label={joined ? 'Open your challenge' : 'Join & pledge ' + money(challenge.pledgeMinor)} loading={busy} disabled={!joined && challenge.status !== 'lobby'} onPress={() => void join()} />
    </Surface>}
  </Screen>;
}
