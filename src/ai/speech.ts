import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { File } from 'expo-file-system';
import * as Speech from 'expo-speech';

import { synthesize } from './cloudTts';
import { loadSettings } from '@/settings/settings';
import { stripMarkdown } from '@/utils/markdown';

let player: AudioPlayer | null = null;
let playing: File | null = null;
// Resolves the wait on the clip that is playing, when it ends or is cut off
let finished: (() => void) | null = null;
// Bumped by every stop, so work for an earlier reply that finishes late stays silent
let turn = 0;

function release() {
  player?.remove();
  player = null;
  if (playing?.exists) playing.delete();
  playing = null;
  finished?.();
  finished = null;
}

export function stopSpeaking() {
  turn += 1;
  Speech.stop();
  release();
}

// Once per reply rather than per clip; recording may have changed the mode since the last one
const audibleInSilentMode = () => setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

// Plays an mp3 from the cache, deletes it afterwards, and resolves once it has ended or been stopped
function play(file: File) {
  release();
  playing = file;
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

// Cloud voice with the given key, errors surfaced; for the settings screen's preview
export async function previewVoice(text: string, apiKey: string, voice: string) {
  stopSpeaking();
  const mine = turn;
  const [file] = await Promise.all([synthesize(text, apiKey, voice), audibleInSilentMode()]);
  if (mine !== turn) return file.delete();
  play(file);
}

// Reads a reply aloud: Doubao speech synthesis when a key is set, otherwise (or from where that fails) the phone's own voice.
// The next piece is synthesized while the current one plays.
export async function speak(text: string) {
  stopSpeaking();
  const mine = turn;
  // Replies are markdown; don't read the symbols aloud
  const plain = stripMarkdown(text);
  const { ttsKey, ttsVoice } = await loadSettings();
  if (!ttsKey) return Speech.speak(plain, { language: 'zh-CN' });

  const parts = splitForSpeech(plain);
  let next: Promise<File> | null = parts.length ? synthesize(parts[0], ttsKey, ttsVoice) : null;
  await audibleInSilentMode();
  for (let i = 0; next; i++) {
    let file: File;
    try {
      file = await next;
    } catch (e) {
      console.warn('cloud tts failed, using the system voice', e);
      if (mine === turn) Speech.speak(parts.slice(i).reduce(joinSentences), { language: 'zh-CN' });
      return;
    }
    if (mine !== turn) return file.delete();
    next = i + 1 < parts.length ? synthesize(parts[i + 1], ttsKey, ttsVoice) : null;
    // Stopped mid-way: the prefetched piece is dropped when it lands
    next?.catch(() => {});
    await play(file);
    if (mine !== turn) {
      next?.then((f) => f.delete()).catch(() => {});
      return;
    }
  }
}
