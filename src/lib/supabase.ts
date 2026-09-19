// ─────────────────────────────────────────────────────────────────
// Supabase client singleton — authenticated role only. Authorization is
// enforced entirely by RLS (see supabase/migrations); there is no
// service-role key on the client.
//
// Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// .env may carry the REST endpoint (…/rest/v1[/]); supabase-js wants the
// project base URL and appends /rest/v1, /auth/v1, etc. itself.
const supabaseUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');

if (!supabaseUrl || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // RN: no URL to parse; deep-link exchange handled by auth screens
  },
});
