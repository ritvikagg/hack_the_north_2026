import { Platform } from 'react-native';

export const colors = {
  cream: '#F6F4E9', forest: '#203F30', lime: '#D4EB86', ink: '#20372B',
  muted: '#65705F', line: '#DBE0D1', white: '#FFFDF5', softGreen: '#E7ECD9',
  peach: '#F3DBC5', danger: '#A63F37', paleDanger: '#FBE8DF',
};
export const fonts = { serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) };

export function money(minor: number) {
  return `$${(minor / 100).toLocaleString('en-CA', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
export function distance(meters: number) { return `${Number((meters / 1000).toFixed(2))} km`; }
export function goalText(runs: number, meters: number) { return `${runs} runs · ${distance(meters)} minimum each`; }
export function timeLeft(endsAt: string | null) {
  if (!endsAt) return 'Ready when you are';
  const hours = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 3_600_000);
  return hours <= 0 ? 'Awaiting results' : hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)} days left`;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
