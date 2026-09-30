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
  // Empty means the app's default model
  anthropicModel: string;
  // OpenAI-compatible (Volcengine Ark, DeepSeek, Qwen, …)
  openaiKey: string;
  openaiBaseURL: string;
  openaiModel: string;
  // Model that can read images; empty means openaiModel does
  openaiVisionModel: string;
  // Where the vision model is served; empty means openaiBaseURL. For a vision model hosted by a different service
  openaiVisionBaseURL: string;
  // Buddy system prompt; empty means the built-in default
  buddyPrompt: string;
  // Buddy avatar: empty for the default icon, a preset animal id, or `photo:<file>` for an uploaded picture
  buddyAvatar: string;
  tts: boolean;
};

// Short values live in the secure store; long free text goes to the app database, since secure store values may be capped around 2 KB
const SECURE = {
  provider: 'ai_provider',
  apiKey: 'anthropic_api_key',
  baseURL: 'anthropic_base_url',
  anthropicModel: 'anthropic_model',
  openaiKey: 'openai_api_key',
  openaiBaseURL: 'openai_base_url',
  openaiModel: 'openai_model',
  openaiVisionModel: 'openai_vision_model',
  openaiVisionBaseURL: 'openai_vision_base_url',
  tts: 'tts_enabled',
} as const;
const PLAIN = { buddyPrompt: 'buddy_prompt', buddyAvatar: 'buddy_avatar' } as const;

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
  anthropicModel: '',
  openaiKey: '',
  openaiBaseURL: '',
  openaiModel: '',
  openaiVisionModel: '',
  openaiVisionBaseURL: '',
  buddyPrompt: '',
  buddyAvatar: '',
  tts: true,
};
let loaded: Promise<void> | null = null;
let ready = false;
const changed = createSignal();

// Resolves to the latest values: saveSettings replaces `current`, so the first load's snapshot would go stale
export async function loadSettings(): Promise<Settings> {
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
      buddyAvatar: readPref(PLAIN.buddyAvatar),
      tts: v.tts !== '0',
    };
    ready = true;
    changed.notify();
  })();
  await loaded;
  return current;
}

export async function saveSettings(patch: Partial<Settings>) {
  await loadSettings();
  const prev = current;
  current = { ...current, ...patch };
  // Each secure store write is a keystore round trip, so only touch the values that changed
  const touched = (Object.keys(patch) as (keyof Settings)[]).filter((k) => current[k] !== prev[k]);
  await Promise.all(
    touched
      .filter((k): k is keyof typeof SECURE => k in SECURE)
      .map((k) => SecureStore.setItemAsync(SECURE[k], k === 'tts' ? (current.tts ? '1' : '0') : current[k])),
  );
  for (const k of touched.filter((k): k is keyof typeof PLAIN => k in PLAIN)) {
    db.runSync('INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', PLAIN[k], current[k]);
  }
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

// Whether the selected provider has what it needs to make a call (mirrors getBackend's checks)
export function aiConfigured(s: Settings) {
  return s.provider === 'openai' ? !!(s.openaiKey && s.openaiBaseURL.trim() && s.openaiModel.trim()) : !!s.apiKey;
}
