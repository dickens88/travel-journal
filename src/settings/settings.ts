import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { createSignal } from '@/utils/signal';

export type Provider = 'anthropic' | 'openai';

export type Settings = {
  provider: Provider;
  // Anthropic
  apiKey: string;
  baseURL: string;
  // OpenAI-compatible (Huawei Cloud MaaS, DeepSeek, Qwen, …)
  openaiKey: string;
  openaiBaseURL: string;
  openaiModel: string;
  // Model that can read images; empty means openaiModel does
  openaiVisionModel: string;
  // Buddy system prompt; empty means the built-in default
  buddyPrompt: string;
  tts: boolean;
};

// Short values live in the secure store; long free text goes to SQLite, since secure store values may be capped around 2 KB
const SECURE = {
  provider: 'ai_provider',
  apiKey: 'anthropic_api_key',
  baseURL: 'anthropic_base_url',
  openaiKey: 'openai_api_key',
  openaiBaseURL: 'openai_base_url',
  openaiModel: 'openai_model',
  openaiVisionModel: 'openai_vision_model',
  tts: 'tts_enabled',
} as const;
const PLAIN = { buddyPrompt: 'buddy_prompt' } as const;

let current: Settings = {
  provider: 'anthropic',
  apiKey: '',
  baseURL: '',
  openaiKey: '',
  openaiBaseURL: '',
  openaiModel: '',
  openaiVisionModel: '',
  buddyPrompt: '',
  tts: true,
};
let loaded: Promise<Settings> | null = null;
let ready = false;
const changed = createSignal();

export function loadSettings() {
  loaded ??= (async () => {
    const names = Object.keys(SECURE) as (keyof typeof SECURE)[];
    const values = await Promise.all(names.map((k) => SecureStore.getItemAsync(SECURE[k])));
    const v = Object.fromEntries(names.map((k, i) => [k, values[i] ?? ''])) as Record<keyof typeof SECURE, string>;
    current = {
      ...v,
      provider: v.provider === 'openai' ? 'openai' : 'anthropic',
      buddyPrompt: (await Storage.getItemAsync(PLAIN.buddyPrompt)) ?? '',
      tts: v.tts !== '0',
    };
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
    ...(Object.keys(SECURE) as (keyof typeof SECURE)[]).map((k) =>
      SecureStore.setItemAsync(SECURE[k], k === 'tts' ? (current.tts ? '1' : '0') : current[k]),
    ),
    Storage.setItemAsync(PLAIN.buddyPrompt, current.buddyPrompt),
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
