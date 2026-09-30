import { Directory, File, Paths } from 'expo-file-system';

import { getT } from '@/i18n';
import { newId } from '@/utils/id';

// Doubao speech synthesis 2.0 (Volcengine "豆包语音", a separate product from Ark with its own API key).
// The SSE flavour of the one-shot streaming API: all text in, base64 mp3 pieces out as `data:` events.
const TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
const RESOURCE_ID = 'seed-tts-2.0';

// Voice ids; their names are t.voice.voices[id]
export const TTS_VOICES = [
  'zh_female_vv_uranus_bigtts',
  'zh_female_xiaohe_uranus_bigtts',
  'zh_female_shuangkuaisisi_uranus_bigtts',
  'zh_female_linjianvhai_uranus_bigtts',
  'zh_male_m191_uranus_bigtts',
  'zh_male_taocheng_uranus_bigtts',
] as const;
export const DEFAULT_VOICE = TTS_VOICES[0];

type Event = { code?: number; message?: string; data?: string | null };

// Clips are kept so reading a reply again costs no second request; past these caps the oldest go
const CACHE_CLIPS = 200;
const CACHE_BYTES = 100 * 1024 * 1024;

function cacheDir() {
  const dir = new Directory(Paths.cache, 'tts');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// 53-bit string hash (cyrb53), for naming a clip after its voice and text
function hash(s: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const clipName = (text: string, voice: string) => `${hash(`${voice}\n${text}`)}-${text.length}.mp3`;

// Newest first; keeps the clip just written even when it alone is over the size cap
function prune(dir: Directory) {
  const clips = dir
    .list()
    .filter((f): f is File => f instanceof File)
    .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  let bytes = 0;
  clips.forEach((f, i) => {
    bytes += f.size;
    if (i > 0 && (i >= CACHE_CLIPS || bytes > CACHE_BYTES)) f.delete();
  });
}

// Text -> an mp3 file in the clip cache, requested only the first time a voice reads that text
export async function synthesize(text: string, apiKey: string, voice: string): Promise<File> {
  voice ||= DEFAULT_VOICE;
  const dir = cacheDir();
  const name = clipName(text, voice);
  const cached = new File(dir, name);
  if (cached.exists && cached.size > 0) return cached;

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': `${newId()}-${newId()}`,
    },
    body: JSON.stringify({
      user: { uid: 'travel-journal' },
      req_params: { text, speaker: voice, audio_params: { format: 'mp3', sample_rate: 24000 } },
    }),
  });
  const body = await res.text();
  const t = getT().errors;
  if (res.status === 401 || res.status === 403) throw new Error(t.ttsBadKey);
  const events: Event[] = body
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => {
      try {
        return JSON.parse(l.slice(5).trim()) as Event;
      } catch {
        return {};
      }
    });
  if (!res.ok && !events.length) throw new Error(t.ttsFailed(`HTTP ${res.status}`, body.slice(0, 200)));
  const failed = events.find((e) => e.code !== undefined && e.code !== 0 && e.code !== 20000000);
  if (failed?.code === 45000010) throw new Error(t.ttsWrongKey);
  if (failed?.code === 45000030) throw new Error(t.ttsNotEnabled);
  if (failed) {
    const hint = failed.code === 45000000 ? t.ttsVoiceMissing : '';
    throw new Error(t.ttsFailed(failed.code!, `${failed.message ?? ''}${hint}`));
  }
  const pieces = events.filter((e) => e.data).map((e) => e.data!);
  if (!pieces.length) throw new Error(t.ttsNoAudio);
  // Written under a temporary name, so a half-written clip is never taken for a finished one
  const tmp = new File(dir, `tmp-${newId()}.mp3`);
  tmp.create();
  // Each piece is base64 on its own; the file system decodes and appends them natively
  for (const p of pieces) tmp.write(p, { encoding: 'base64', append: true });
  // The same text may have been fetched meanwhile (a prefetch racing a tap)
  if (cached.exists) tmp.delete();
  else tmp.rename(name);
  prune(dir);
  return new File(dir, name);
}
