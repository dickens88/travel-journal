import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import { en } from './locales/en';
import { zh, type Messages } from './locales/zh';
import { createSignal } from '@/utils/signal';

export type { Messages };

// Every UI language. Adding one = a new file in ./locales typed as Messages (the compiler lists anything missing)
// plus a line here; the language picker in Settings reads this list.
export const LOCALES = { zh, en } satisfies Record<string, Messages>;

export type Lang = keyof typeof LOCALES;
// What the user picked in Settings; 'system' follows the phone's language
export type LangPref = Lang | 'system';
// Every language, in picker order
export const LANGS = Object.keys(LOCALES) as Lang[];
// For phones set to a language the app doesn't have
const FALLBACK: Lang = 'en';

const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in LOCALES;

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode;
    return isLang(code) ? code : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function parseLangPref(v: string | null | undefined): LangPref {
  return isLang(v) ? v : 'system';
}

let pref: LangPref = 'system';
let lang: Lang = deviceLang();
const changed = createSignal();

export function applyLangPref(p: LangPref) {
  pref = p;
  lang = p === 'system' ? deviceLang() : p;
  changed.notify();
}

export function getLang() {
  return lang;
}

function getLangPref() {
  return pref;
}

// For code that runs outside render (AI prompts, errors, toasts): the messages at call time
export function getT(): Messages {
  return LOCALES[lang];
}

// Components take the language from these hooks, never from getLang/getT during render: the React Compiler memoizes
// plain calls made while rendering, which would keep showing the old language after a switch. Helpers that return
// display text take `lang` (or `t`) as an argument for the same reason.
function useLang() {
  return useSyncExternalStore(changed.subscribe, getLang);
}

export function useLangPref() {
  return useSyncExternalStore(changed.subscribe, getLangPref);
}

// The dictionary object changes identity with the language, so everything built from it re-renders
export function useT(): Messages {
  return LOCALES[useLang()];
}
