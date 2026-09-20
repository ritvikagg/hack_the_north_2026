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
export function steps(count: number) { return `${count.toLocaleString('en-CA')} steps`; }
export function goalText(dailyStepGoal: number, requiredDays: number) {
  return `${steps(dailyStepGoal)} a day · ${requiredDays} day${requiredDays === 1 ? '' : 's'} to finish`;
}
export function timeLeft(endsAt: string | null) {
  if (!endsAt) return 'Ready when you are';
  const hours = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 3_600_000);
  return hours <= 0 ? 'Past the target date — every day still counts' : hours < 24 ? `${hours}h to target pace` : `${Math.ceil(hours / 24)} days to target pace`;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
