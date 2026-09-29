import Anthropic from '@anthropic-ai/sdk';

import { photoBase64 } from '@/photos/storage';
import { loadSettings } from '@/settings/settings';

export const MODEL = 'claude-opus-5';
// Server-side fallback re-runs a declined request on Anthropic's recommended model
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

class MissingKeyError extends Error {
  constructor() {
    super('请先在「设置」里填写 Claude API Key');
  }
}

export async function getClient() {
  const { apiKey, baseURL } = await loadSettings();
  if (!apiKey) throw new MissingKeyError();
  return new Anthropic({ apiKey, baseURL: baseURL.trim() || undefined, maxRetries: 2 });
}

// A stored trip photo as an API image block
export async function photoImageBlock(file: string) {
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: await photoBase64(file) } };
}

export function describeError(e: unknown): string {
  if (e instanceof MissingKeyError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return 'API Key 无效，请到设置里检查';
  if (e instanceof Anthropic.PermissionDeniedError) return '这个 API Key 没有权限使用该模型';
  if (e instanceof Anthropic.RateLimitError) return '请求太频繁，稍等一会儿再试';
  if (e instanceof Anthropic.APIConnectionError) return '连不上 Claude 服务，检查网络或设置里的 Base URL';
  if (e instanceof Anthropic.APIError) return `Claude 返回错误（${e.status ?? '?'}）：${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export function assertUsable(stopReason: string | null) {
  if (stopReason === 'refusal') throw new Error('这次请求被模型拒绝了，换个说法再试试');
  if (stopReason === 'max_tokens') throw new Error('内容太长被截断了，请减少素材后重试');
}
