import { z } from 'zod';

// Minimal client for OpenAI-compatible /chat/completions endpoints (Huawei Cloud MaaS, DeepSeek, Qwen, …).
// Only the widely supported subset is used: streaming, image_url parts and function tools — no response_format,
// since compatible servers disagree on it; JSON output is requested in the prompt and validated with zod instead.

export type OAContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type OAToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type OAMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OAContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OAToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type OATool = { type: 'function'; function: { name: string; description: string; parameters: object } };

export type OAConfig = { apiKey: string; baseURL: string };
type Request = { model: string; messages: OAMessage[]; tools?: OATool[]; max_tokens: number };
type Result = { text: string; toolCalls: OAToolCall[]; finishReason: string | null };

export class OpenAIError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

// Anthropic-style text / base64 image blocks (what the rest of the app builds) -> OpenAI content parts
export function toOAParts(blocks: { type: string; [k: string]: any }[]): OAContentPart[] {
  return blocks.flatMap((b): OAContentPart[] => {
    if (b.type === 'text') return [{ type: 'text', text: b.text }];
    if (b.type === 'image') return [{ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }];
    return [];
  });
}

function errorMessage(raw: string) {
  try {
    const j = JSON.parse(raw);
    return String(j.error?.message ?? j.error_msg ?? j.message ?? raw);
  } catch {
    return raw;
  }
}

type Chunk = {
  error?: { message?: string };
  choices?: {
    delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] };
    message?: { content?: string | null; tool_calls?: OAToolCall[] };
    finish_reason?: string | null;
  }[];
};

// Streams the reply, calling onText with the accumulated text; tool call fragments are stitched by index
export async function chatCompletion(cfg: OAConfig, req: Request, onText?: (text: string) => void): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseURL.trim().replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ ...req, stream: true }),
    });
  } catch (e) {
    throw new OpenAIError(null, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new OpenAIError(res.status, errorMessage(raw).slice(0, 300) || res.statusText);
  }

  const out: Result = { text: '', toolCalls: [], finishReason: null };
  const apply = (c: Chunk) => {
    if (c.error) throw new OpenAIError(null, c.error.message ?? '服务返回了错误');
    const choice = c.choices?.[0];
    if (!choice) return;
    // Servers that ignore stream:true answer with one complete message
    const piece = choice.delta ?? choice.message;
    if (piece?.content) {
      out.text += piece.content;
      onText?.(out.text);
    }
    (piece?.tool_calls ?? []).forEach((t: any, i: number) => {
      const slot = (out.toolCalls[t.index ?? i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (t.id) slot.id = t.id;
      if (t.function?.name) slot.function.name += t.function.name;
      if (t.function?.arguments) slot.function.arguments += t.function.arguments;
    });
    if (choice.finish_reason) out.finishReason = choice.finish_reason;
  };

  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    apply(JSON.parse(await res.text()));
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = done ? '' : lines.pop()!;
        for (const line of lines) {
          const data = line.startsWith('data:') ? line.slice(5).trim() : '';
          if (data && data !== '[DONE]') apply(JSON.parse(data));
        }
        if (done) break;
      }
    } catch (e) {
      throw e instanceof OpenAIError ? e : new OpenAIError(null, e instanceof Error ? e.message : String(e));
    }
  }
  out.toolCalls = out.toolCalls.filter(Boolean);
  return out;
}

export function jsonInstruction(schema: z.ZodType) {
  return `只输出一个 JSON 对象，不要输出任何其他文字，也不要用代码块包裹。JSON 必须符合这个 JSON Schema：\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

// Pull the JSON object out of a reply that may carry <think> blocks or code fences
export function parseJSONReply<T>(schema: z.ZodType<T>, text: string): T | null {
  const s = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const r = schema.safeParse(JSON.parse(s.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
