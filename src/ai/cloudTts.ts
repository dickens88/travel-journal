import { File, Paths } from 'expo-file-system';

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

// Text -> an mp3 file in the cache; the caller plays it and deletes it
export async function synthesize(text: string, apiKey: string, voice: string): Promise<File> {
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
      req_params: { text, speaker: voice || DEFAULT_VOICE, audio_params: { format: 'mp3', sample_rate: 24000 } },
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
  const file = new File(Paths.cache, `tts-${newId()}.mp3`);
  file.create();
  // Each piece is base64 on its own; the file system decodes and appends them natively
  for (const p of pieces) file.write(p, { encoding: 'base64', append: true });
  return file;
}
