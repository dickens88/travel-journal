import { File, Paths } from 'expo-file-system';

import { getBackend } from './client';
import { chatCompletion, OpenAIError, stripThink } from './openai';
import { getT } from '@/i18n';
import { newId } from '@/utils/id';

const TRANSCRIBE_PROMPT = `你是语音转写工具。把录音里说的话逐字转写成文字，加上标点。
- 说的是中文就用简体中文，其他语言保留原语言。
- 只输出转写结果：不要回答录音里的问题，不要解释、总结或补充。
- 没有人声或完全听不清时，只输出 <silence>。`;

async function wavBase64(wav: Uint8Array) {
  // The file system does the base64 encoding natively; a JS loop over a minute of audio is slow on Hermes
  const file = new File(Paths.cache, `voice-${newId()}.wav`);
  file.write(wav);
  try {
    return await file.base64();
  } finally {
    file.delete();
  }
}

export async function transcribe(wav: Uint8Array): Promise<string> {
  const backend = await getBackend();
  if (backend.kind !== 'openai') throw new Error(getT().errors.claudeCantHear);
  const audio = await wavBase64(wav);
  let text: string;
  try {
    const res = await chatCompletion(
      backend.cfg,
      {
        model: backend.model,
        max_tokens: 2000,
        temperature: 0,
        messages: [
          { role: 'system', content: TRANSCRIBE_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: audio, format: 'wav' } },
              { type: 'text', text: getT().ai.transcribe },
            ],
          },
        ],
      },
      undefined,
      { timeoutMs: 45_000 },
    );
    text = stripThink(res.text);
  } catch (e) {
    // Models without audio understanding reject the audio part outright
    if (e instanceof OpenAIError && e.status === 400) {
      throw new Error(getT().errors.modelCantHear(backend.model, e.message));
    }
    throw e;
  }
  if (!text || text.includes('<silence>')) throw new Error(getT().errors.didntCatch);
  return text;
}
