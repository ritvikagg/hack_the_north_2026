import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const useStorageStatus = create<{ error: string | null; readFailed: boolean }>(() => ({ error: null, readFailed: false }));
export const hydrationFinished = (_state: unknown, error: unknown) => {
  if (error) useStorageStatus.setState({ readFailed: true, error: 'Saved activity could not be read. Retry loading before continuing.' });
};
const pending = new Map<string, string>();
export const deviceStorage = {
  async getItem(key: string) {
    try { return await AsyncStorage.getItem(key); }
    catch (error) {
      useStorageStatus.setState({ readFailed: true, error: 'Your saved activity could not be loaded. Retry before continuing.' });
      throw error;
    }
  },
  async setItem(key: string, value: string) {
    pending.set(key, value);
    try {
      await AsyncStorage.setItem(key, value);
      if (pending.get(key) === value) pending.delete(key);
      if (!pending.size && !useStorageStatus.getState().readFailed) useStorageStatus.setState({ error: null });
    } catch {
      useStorageStatus.setState({ error: 'Recent activity has not saved to this device. Keep the app open and retry saving.' });
    }
  },
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
export async function retryStorage() {
  for (const [key, value] of pending) await deviceStorage.setItem(key, value);
}
