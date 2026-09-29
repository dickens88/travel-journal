import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { db } from '@/db/db';
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

// Short values live in the secure store; long free text goes to the app database, since secure store values may be capped around 2 KB
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

function readPref(key: string) {
  try {
    return db.getFirstSync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', key)?.value ?? '';
  } catch (e) {
    console.warn(`settings: failed to read ${key}`, e);
    return '';
  }
}

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
    // One unreadable value must not leave the settings screen waiting forever; fall back to its default
    const names = Object.keys(SECURE) as (keyof typeof SECURE)[];
    const values = await Promise.all(
      names.map((k) =>
        SecureStore.getItemAsync(SECURE[k]).catch((e) => {
          console.warn(`settings: failed to read ${k}`, e);
          return null;
        }),
      ),
    );
    const v = Object.fromEntries(names.map((k, i) => [k, values[i] ?? ''])) as Record<keyof typeof SECURE, string>;
    current = {
      ...v,
      provider: v.provider === 'openai' ? 'openai' : 'anthropic',
      buddyPrompt: readPref(PLAIN.buddyPrompt),
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
  await Promise.all(
    (Object.keys(SECURE) as (keyof typeof SECURE)[]).map((k) =>
      SecureStore.setItemAsync(SECURE[k], k === 'tts' ? (current.tts ? '1' : '0') : current[k]),
    ),
  );
  db.runSync('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', PLAIN.buddyPrompt, current.buddyPrompt);
  changed.notify();
}

// Whether the stored values have arrived. A hook rather than a plain getter: the React Compiler
// memoizes plain calls made during render, which would pin the first `false` forever.
export function useSettingsReady() {
  loadSettings();
  return useSyncExternalStore(changed.subscribe, () => ready);
}

export function useSettings() {
  loadSettings();
  return useSyncExternalStore(changed.subscribe, () => current);
}
