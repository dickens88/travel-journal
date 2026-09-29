import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { createSignal } from '@/utils/signal';

export type Settings = { apiKey: string; baseURL: string; tts: boolean };

const KEYS = { apiKey: 'anthropic_api_key', baseURL: 'anthropic_base_url', tts: 'tts_enabled' } as const;

let current: Settings = { apiKey: '', baseURL: '', tts: true };
let loaded: Promise<Settings> | null = null;
let ready = false;
const changed = createSignal();

export function loadSettings() {
  loaded ??= (async () => {
    const [apiKey, baseURL, tts] = await Promise.all([
      SecureStore.getItemAsync(KEYS.apiKey),
      SecureStore.getItemAsync(KEYS.baseURL),
      SecureStore.getItemAsync(KEYS.tts),
    ]);
    current = { apiKey: apiKey ?? '', baseURL: baseURL ?? '', tts: tts !== '0' };
    ready = true;
    changed.notify();
    return current;
  })();
  return loaded;
}

export async function saveSettings(patch: Partial<Settings>) {
  await loadSettings();
  current = { ...current, ...patch };
  await Promise.all([
    SecureStore.setItemAsync(KEYS.apiKey, current.apiKey),
    SecureStore.setItemAsync(KEYS.baseURL, current.baseURL),
    SecureStore.setItemAsync(KEYS.tts, current.tts ? '1' : '0'),
  ]);
  changed.notify();
}

// Whether the stored values have arrived; useSettings re-renders when they do
export function settingsReady() {
  return ready;
}

export function useSettings() {
  loadSettings();
  return useSyncExternalStore(changed.subscribe, () => current);
}
