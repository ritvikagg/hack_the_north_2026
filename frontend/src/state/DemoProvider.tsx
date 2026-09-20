import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { Challenge, DemoState } from '../domain/models';
import { backend, backendError } from '../services/backend';
import type { DemoAction } from '../services/demoEngine';

const empty = (): DemoState => ({ version: 1, hasEntered: false, currentUserId: '', users: [], challenges: [], groups: [], runs: [] });
type Action = DemoAction | { type: 'createGroup'; name: string } | { type: 'joinGroup'; code: string };
interface Value {
  demo: DemoState; session: Session | null; ready: boolean; busy: boolean; storageError: string | null;
  dispatch(action: Action): Promise<string | undefined>; refresh(): Promise<void>;
  findParty(code: string): Promise<Challenge>; signOut(): Promise<void>;
}
const Context = createContext<Value | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(empty);
  const [session, setSession] = useState<Session | null>(null);
  const userId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storageError, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const refreshing = useRef(0);
  const refresh = useCallback(async () => {
    const expected = userId.current;
    const ticket = ++generation.current;
    if (!expected) return;
    refreshing.current++;
    try {
      const { data, error } = await backend.rpc('fitness_snapshot');
      if (userId.current !== expected || ticket !== generation.current) return;
      if (error) { setError(backendError(error)); return; }
      setDemo(data as DemoState); setError(null);
    } catch (error) { if (userId.current === expected && ticket === generation.current) setError(backendError(error)); }
    finally { refreshing.current--; }
  }, []);
  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = backend.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      const nextId = next?.user.id ?? null;
      if (userId.current !== nextId) { ++generation.current; setDemo(empty()); setError(null); }
      userId.current = nextId; setSession(next); setReady(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session?.user.id) return;
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active' && !refreshing.current && !locked.current) void refresh(); }, 3000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { backend.auth.startAutoRefresh(); void refresh(); }
      else backend.auth.stopAutoRefresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [session?.user.id, refresh]);
  async function dispatch(action: Action) {
    if (!userId.current) throw new Error('Sign in first.');
    if (locked.current) throw new Error('Please wait for the current action.');
    locked.current = true; setBusy(true);
    try {
      const payload = action.type === 'addRun' ? { ...action, requestId: `${userId.current}-${Date.now()}-${Math.random().toString(36).slice(2)}` } : action;
      const { data, error } = await backend.rpc('fitness_action', { p_action: payload });
      if (error) throw new Error(backendError(error));
      await refresh(); return data as string;
    } finally { locked.current = false; setBusy(false); }
  }
  async function findParty(code: string) {
    const { data, error } = await backend.rpc('fitness_find_party', { p_code: code });
    if (error) throw new Error(backendError(error));
    return data as Challenge;
  }
  async function signOut() {
    const { error } = await backend.auth.signOut({ scope: 'local' });
    if (error) throw new Error(backendError(error));
  }
  return <Context.Provider value={{ demo, session, ready, busy, storageError, dispatch, refresh, findParty, signOut }}>{children}</Context.Provider>;
}
export function useDemo() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing account provider.');
  const currentUser = context.demo.users.find((u) => u.id === context.session?.user.id) ?? {
    id: context.session?.user.id ?? '', name: context.session?.user.user_metadata.display_name ?? 'Walker', initials: 'W', color: '#DDEAA4',
  };
  return { ...context, currentUser, userById: (id: string) => context.demo.users.find((u) => u.id === id), challengeById: (id: string) => context.demo.challenges.find((c) => c.id === id) };
}
