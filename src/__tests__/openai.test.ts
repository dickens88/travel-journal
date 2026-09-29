import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import { chatCompletion, OpenAIError, parseJSONReply, toOAParts } from '@/ai/openai';

const cfg = { apiKey: 'k', baseURL: 'https://api.modelarts-maas.com/openai/v1/' };

function sse(events: object[], split = 7) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text);
  // Deliver in odd-sized chunks so lines straddle reads
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += split) chunks.push(bytes.slice(i, i + split));
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream; charset=utf-8' },
    body: {
      getReader: () => ({ read: async () => (chunks.length ? { done: false, value: chunks.shift() } : { done: true, value: undefined }) }),
    },
  };
}

afterEach(() => {
  (global as any).fetch = undefined;
});

describe('OpenAI-compatible client', () => {
  it('streams text and stitches tool call fragments', async () => {
    const fetch = jest.fn(async () =>
      sse([
        { choices: [{ delta: { content: '好的，' } }] },
        { choices: [{ delta: { content: '记下了' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'save_note', arguments: '{"text":"巴黎' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '下雨","related_photo_id":""}' } }] }, finish_reason: 'tool_calls' }] },
      ]),
    );
    (global as any).fetch = fetch;
    const seen: string[] = [];
    const res = await chatCompletion(cfg, { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, (t) => seen.push(t));
    expect((fetch.mock.calls[0] as any[])[0]).toBe('https://api.modelarts-maas.com/openai/v1/chat/completions');
    expect(res.text).toBe('好的，记下了');
    expect(seen.at(-1)).toBe('好的，记下了');
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolCalls).toHaveLength(1);
    expect(JSON.parse(res.toolCalls[0].function.arguments)).toEqual({ text: '巴黎下雨', related_photo_id: '' });
  });

  it('surfaces HTTP errors with status and server message', async () => {
    (global as any).fetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => '{"error":{"message":"bad key"}}' });
    await expect(chatCompletion(cfg, { model: 'm', max_tokens: 10, messages: [] })).rejects.toMatchObject({ status: 401, message: 'bad key' });
    await expect(chatCompletion(cfg, { model: 'm', max_tokens: 10, messages: [] })).rejects.toBeInstanceOf(OpenAIError);
  });

  it('extracts JSON from replies with think blocks and code fences', () => {
    const schema = z.object({ a: z.number() });
    expect(parseJSONReply(schema, '<think>{"a":"no"}</think>\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJSONReply(schema, '{"a":"x"}')).toBeNull();
    expect(parseJSONReply(schema, '没有 JSON')).toBeNull();
  });

  it('converts image blocks to data URLs', () => {
    expect(toOAParts([{ type: 'text', text: 't' }, { type: 'image', source: { media_type: 'image/jpeg', data: 'AAA' } }])).toEqual([
      { type: 'text', text: 't' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
    ]);
  });
});
