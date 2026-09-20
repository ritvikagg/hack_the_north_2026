import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DemoState } from '../domain/models';
import { createDemoState } from '../services/demoFixtures';
import { DemoAction, transition } from '../services/demoEngine';

const STORAGE_KEY = 'pledgefit.demo.v1';
interface DemoContextValue { demo: DemoState; ready: boolean; busy: boolean; storageError: string | null; dispatch(action: DemoAction): Promise<string | undefined>; }
const DemoContext = createContext<DemoContextValue | null>(null);

function isSavedState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const s = value as DemoState;
  return s.version === 1 && Array.isArray(s.users) && s.users.some((u) => u.id === s.currentUserId)
    && Array.isArray(s.groups) && Array.isArray(s.runs) && Array.isArray(s.challenges)
    && s.challenges.every((c) => typeof c.id === 'string' && Array.isArray(c.participants) && Array.isArray(c.payouts) && Array.isArray(c.replacementVotes) && Number.isInteger(c.pledgeMinor));
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(createDemoState);
  const current = useRef(demo);
  const locked = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!mounted || !raw) return;
      const saved: unknown = JSON.parse(raw);
      if (isSavedState(saved)) { current.current = saved; setDemo(saved); }
    }).catch(() => { if (mounted) setStorageError('Saved demo could not be loaded. A fresh demo is ready.'); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  async function dispatch(action: DemoAction) {
    if (!ready) throw new Error('The demo is still loading.');
    if (locked.current) throw new Error('Please wait for the current action to finish.');
    locked.current = true; setBusy(true);
    try {
      const result = transition(current.current, action);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
      current.current = result.state; setDemo(result.state); setStorageError(null);
      return result.id;
    } finally { locked.current = false; setBusy(false); }
  }
  return <DemoContext.Provider value={{ demo, ready, busy, storageError, dispatch }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemo must be inside DemoProvider');
  const currentUser = context.demo.users.find((u) => u.id === context.demo.currentUserId)!;
  return { ...context, currentUser, userById: (id: string) => context.demo.users.find((u) => u.id === id), challengeById: (id: string) => context.demo.challenges.find((c) => c.id === id) };
}
