import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useEffect, useSyncExternalStore } from 'react';

import { synthesize } from './cloudTts';
import { getT } from '@/i18n';
import { loadSettings } from '@/settings/settings';
import { stripMarkdown } from '@/utils/markdown';
import { createSignal } from '@/utils/signal';

let player: AudioPlayer | null = null;
// Resolves the wait on the clip that is playing, when it ends or is cut off
let finished: (() => void) | null = null;
// Bumped by every stop, so work for an earlier reply that finishes late stays silent
let turn = 0;
// The reply being read aloud, so its bubble can offer a stop button
let reading: string | null = null;
const readingChanged = createSignal();

function setReading(text: string | null) {
  if (reading === text) return;
  reading = text;
  readingChanged.notify();
}

export const useReading = () => useSyncExternalStore(readingChanged.subscribe, () => reading);

// Screens replies are read aloud on; reading stops when the last one closes
let openScreens = 0;

export function useSpeechScreen() {
  useEffect(() => {
    openScreens += 1;
    return () => {
      openScreens -= 1;
      if (!openScreens) stopSpeaking();
    };
  }, []);
}

function release() {
  // remove() alone only drops the handle on Android; the clip would keep playing under the next one
  player?.pause();
  player?.remove();
  player = null;
  finished?.();
  finished = null;
}

export function stopSpeaking() {
  turn += 1;
  Speech.stop();
  release();
  setReading(null);
}

// The phone's own voice, in the app's language
const systemVoice = () => ({ language: getT().ai.speechLocale });

// Reads with the phone's voice; the reading state clears when it ends, unless a newer reply has taken over
function speakWithSystem(text: string, mine: number) {
  const ended = () => {
    if (mine === turn) setReading(null);
  };
  Speech.speak(text, { ...systemVoice(), onDone: ended, onStopped: ended, onError: ended });
}

// Once per reply rather than per clip; recording may have changed the mode since the last one
const audibleInSilentMode = () => setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

// Plays an mp3 from the clip cache (which keeps it for next time), and resolves once it has ended or been stopped
function play(file: File) {
  release();
  const p = createAudioPlayer({ uri: file.uri });
  player = p;
  const done = new Promise<void>((resolve) => (finished = resolve));
  p.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish && player === p) release();
  });
  p.play();
  return done;
}

// Joins sentences back up; English ones need the space that trimming removed
const joinSentences = (a: string, b: string) => a + (/[\x21-\x7e]$/.test(a) ? ' ' : '') + b;

// Sentence-sized pieces: the first one short so reading starts quickly, later ones batched to save requests
export function splitForSpeech(text: string): string[] {
  // Chinese end marks, or an English period / mark followed by a space (so 3.5 stays whole)
  const sentences = text.match(/[\s\S]+?(?:[。！？；\n]+|[.!?;](?=\s)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const parts: string[] = [];
  for (const s of sentences) {
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.length + s.length <= 120) parts[parts.length - 1] = joinSentences(last, s);
    else parts.push(s);
  }
  return parts;
}

let lastToggle = 0;

// The read / stop button on a reply. A second tap right after the first is a slip, not a request to stop.
export function toggleReading(text: string) {
  const now = Date.now();
  if (now - lastToggle < 600) return;
  lastToggle = now;
  if (reading === text) stopSpeaking();
  else speak(text);
}

// Cloud voice with the given key, errors surfaced; for the settings screen's preview
export async function previewVoice(text: string, apiKey: string, voice: string) {
  stopSpeaking();
  const mine = turn;
  const [file] = await Promise.all([synthesize(text, apiKey, voice), audibleInSilentMode()]);
  if (mine !== turn) return;
  play(file);
}

// Reads a reply aloud: Doubao speech synthesis when a key is set, otherwise (or from where that fails) the phone's own voice.
// The next piece is synthesized while the current one plays.
export async function speak(text: string) {
  // A reply that finishes after its chat was closed stays silent
  if (!openScreens) return;
  stopSpeaking();
  const mine = turn;
  setReading(text);
  // Replies are markdown; don't read the symbols aloud
  const plain = stripMarkdown(text);
  const { ttsKey, ttsVoice } = await loadSettings();
  // Tapped again or stopped while the settings loaded
  if (mine !== turn) return;
  if (!ttsKey) return speakWithSystem(plain, mine);

  const parts = splitForSpeech(plain);
  let next: Promise<File> | null = parts.length ? synthesize(parts[0], ttsKey, ttsVoice) : null;
  await audibleInSilentMode();
  for (let i = 0; next; i++) {
    let file: File;
    try {
      file = await next;
    } catch (e) {
      console.warn('cloud tts failed, using the system voice', e);
      if (mine === turn) speakWithSystem(parts.slice(i).reduce(joinSentences), mine);
      return;
    }
    if (mine !== turn) return;
    next = i + 1 < parts.length ? synthesize(parts[i + 1], ttsKey, ttsVoice) : null;
    // Stopped mid-way: the prefetched piece still lands in the cache, ready for next time
    next?.catch(() => {});
    await play(file);
    if (mine !== turn) return;
  }
  setReading(null);
}
