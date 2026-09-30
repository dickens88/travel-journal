import { z } from 'zod';

import { getT, type Messages } from '@/i18n';

// Minimal client for OpenAI-compatible /chat/completions endpoints (Volcengine Ark, DeepSeek, Qwen, …).
// Only the widely supported subset is used: streaming, image_url / input_audio parts and function tools — no response_format,
// since compatible servers disagree on it; JSON output is requested in the prompt and validated with zod instead.

export type OAContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  // Base64 audio; only models with audio understanding accept it (e.g. Doubao Seed lite on Volcengine Ark)
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' } };
export type OAToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
export type OAMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OAContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OAToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export type OATool = { type: 'function'; function: { name: string; description: string; parameters: object } };

export type OAConfig = { apiKey: string; baseURL: string };
type Request = { model: string; messages: OAMessage[]; tools?: OATool[]; max_tokens: number; temperature?: number };
type Result = { text: string; toolCalls: OAToolCall[]; finishReason: string | null };

// Used when a request doesn't set its own temperature
export const DEFAULT_TEMPERATURE = 0.7;

// The reply wasn't the JSON asked for; models slip on this now and then, so the request is worth repeating
export class BadJSONError extends Error {}

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

// Streams the reply, calling onText with the accumulated text; tool call fragments are stitched by index.
// With timeoutMs, a reply that hasn't finished by then is aborted — some models occasionally never stop generating.
export async function chatCompletion(cfg: OAConfig, req: Request, onText?: (text: string) => void, opts: { timeoutMs?: number } = {}): Promise<Result> {
  const abort = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => abort.abort(), opts.timeoutMs) : null;
  try {
    return await streamCompletion(cfg, req, abort.signal, onText);
  } catch (e) {
    if (!abort.signal.aborted) throw e;
    const secs = Math.round(opts.timeoutMs! / 1000);
    throw new OpenAIError(null, getT().errors.timeout(req.model, secs));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isArk(baseURL: string) {
  return /\.volces\.com(\/|$)/.test(baseURL.trim().replace(/\/+$/, ''));
}

// Doubao models on Volcengine Ark think by default, which turns a short reply into most of a minute and trips the photo timeout
function extraFields(baseURL: string) {
  return isArk(baseURL) ? { thinking: { type: 'disabled' } } : {};
}

// Reasoning models may prefix the reply with a <think> block
export function stripThink(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function streamCompletion(cfg: OAConfig, req: Request, signal: AbortSignal, onText?: (text: string) => void): Promise<Result> {
  let res: Response;
  const baseURL = cfg.baseURL.trim().replace(/\/+$/, '');
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ ...req, temperature: req.temperature ?? DEFAULT_TEMPERATURE, ...extraFields(baseURL), stream: true }),
      signal,
    });
  } catch (e) {
    throw new OpenAIError(null, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new OpenAIError(res.status, errorMessage(raw) || res.statusText);
  }

  const out: Result = { text: '', toolCalls: [], finishReason: null };
  const apply = (c: Chunk) => {
    if (c.error) throw new OpenAIError(null, c.error.message ?? getT().errors.serviceError);
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
        if (signal.aborted) {
          reader.cancel().catch(() => {});
          throw new Error('aborted');
        }
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

export function jsonInstruction(schema: z.ZodType, t: Messages) {
  return t.ai.json(JSON.stringify(z.toJSONSchema(schema)));
}

// Pull the JSON object out of a reply that may carry <think> blocks or code fences
function readJSONReply<T>(schema: z.ZodType<T>, text: string): { data: T } | { problem: string } {
  const s = stripThink(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) return { problem: getT().errors.noJSON };
  let json: unknown;
  try {
    json = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return { problem: e instanceof Error ? e.message : String(e) };
  }
  const r = schema.safeParse(json);
  return r.success ? { data: r.data } : { problem: z.prettifyError(r.error) };
}

export function parseJSONReply<T>(schema: z.ZodType<T>, text: string): T | null {
  const r = readJSONReply(schema, text);
  return 'data' in r ? r.data : null;
}

// Same, but a reply that doesn't fit throws with the reason and the start of what the model actually said
export function parseJSONReplyOrThrow<T>(schema: z.ZodType<T>, text: string): T {
  const r = readJSONReply(schema, text);
  if ('data' in r) return r.data;
  const head = text.trim().slice(0, 600);
  throw new BadJSONError(getT().errors.badJSON(r.problem, head) + (text.trim().length > 600 ? '…' : ''));
}
