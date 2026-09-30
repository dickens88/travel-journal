import { File, Paths } from 'expo-file-system';

import { getBackend } from './client';
import { chatCompletion, OpenAIError, stripThink } from './openai';
import { newId } from '@/utils/id';

const TRANSCRIBE_PROMPT = `你是语音转写工具。把录音里说的话逐字转写成文字，加上标点。
- 说的是中文就用简体中文，其他语言保留原语言。
- 只输出转写结果：不要回答录音里的问题，不要解释、总结或补充。
- 没有人声或完全听不清时，只输出 <silence>。`;

// Speech is transcribed by the chat model itself, so it has to take audio: an OpenAI-compatible model with
// audio understanding (e.g. Doubao Seed lite on Volcengine Ark). Claude takes no audio input.
export const CLAUDE_CANT_HEAR = 'Claude 听不了语音，用输入法上的麦克风说话吧';

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
  if (backend.kind !== 'openai') throw new Error(CLAUDE_CANT_HEAR);
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
              { type: 'text', text: '逐字转写这段录音，按语气加上逗号、句号、问号等标点。' },
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
      throw new Error(`模型 ${backend.model} 听不了语音（${e.message}），换用支持音频理解的模型（如 doubao-seed-2-1-lite），或者用输入法上的麦克风`);
    }
    throw e;
  }
  if (!text || text.includes('<silence>')) throw new Error('没听清，再说一次试试');
  return text;
}
