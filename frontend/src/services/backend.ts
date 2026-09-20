import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const configured = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
// On phones, use the computer hosting Expo instead of the phone's localhost.
export const backendUrl = Platform.OS !== 'web' && devHost && /localhost|127\.0\.0\.1/.test(configured)
  ? configured.replace(/localhost|127\.0\.0\.1/, devHost) : configured;
export const backend = createClient(backendUrl, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-local-key', {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export function backendError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Please try again.';
  return /fetch|network|Failed to fetch/i.test(message)
    ? 'Cannot reach the local server. Keep Docker running and connect your phone to the same Wi-Fi as this computer.' : message;
}
