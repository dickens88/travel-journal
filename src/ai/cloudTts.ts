import { File, Paths } from 'expo-file-system';

import { newId } from '@/utils/id';

// Doubao speech synthesis 2.0 (Volcengine "豆包语音", a separate product from Ark with its own API key).
// The SSE flavour of the one-shot streaming API: all text in, base64 mp3 pieces out as `data:` events.
const TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
const RESOURCE_ID = 'seed-tts-2.0';

export const TTS_VOICES = [
  { id: 'zh_female_vv_uranus_bigtts', label: 'Vivi' },
  { id: 'zh_female_xiaohe_uranus_bigtts', label: '小何' },
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', label: '爽快思思' },
  { id: 'zh_female_linjianvhai_uranus_bigtts', label: '邻家女孩' },
  { id: 'zh_male_m191_uranus_bigtts', label: '云舟' },
  { id: 'zh_male_taocheng_uranus_bigtts', label: '小天' },
] as const;
export const DEFAULT_VOICE = TTS_VOICES[0].id;

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
  if (res.status === 401 || res.status === 403) throw new Error('豆包语音的 API Key 不对，或者还没开通「语音合成 2.0」');
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
  if (!res.ok && !events.length) throw new Error(`语音合成失败（HTTP ${res.status}）：${body.slice(0, 200)}`);
  const failed = events.find((e) => e.code !== undefined && e.code !== 0 && e.code !== 20000000);
  if (failed?.code === 45000010) throw new Error('豆包语音的 API Key 不对');
  if (failed?.code === 45000030) throw new Error('还没开通「豆包语音合成模型 2.0」，去豆包语音控制台开通后再试');
  if (failed) {
    const hint = failed.code === 45000000 ? '，音色没有开通或者不存在' : '';
    throw new Error(`语音合成失败（${failed.code}）：${failed.message ?? ''}${hint}`);
  }
  const pieces = events.filter((e) => e.data).map((e) => e.data!);
  if (!pieces.length) throw new Error('语音合成没有返回音频');
  const file = new File(Paths.cache, `tts-${newId()}.mp3`);
  file.create();
  // Each piece is base64 on its own; the file system decodes and appends them natively
  for (const p of pieces) file.write(p, { encoding: 'base64', append: true });
  return file;
}
