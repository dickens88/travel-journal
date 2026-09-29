import Anthropic from '@anthropic-ai/sdk';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { OpenAIError, type OAConfig } from './openai';
import { photoBase64, photoUri } from '@/photos/storage';
import { loadSettings } from '@/settings/settings';

export const MODEL = 'claude-opus-5';
// Server-side fallback re-runs a declined request on Anthropic's recommended model
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

class MissingKeyError extends Error {}

export type Backend =
  | { kind: 'anthropic'; client: Anthropic }
  // `model` writes text; `visionModel` is used whenever images are sent
  | { kind: 'openai'; cfg: OAConfig; model: string; visionModel: string };

export async function getBackend(): Promise<Backend> {
  const s = await loadSettings();
  if (s.provider === 'openai') {
    if (!s.openaiKey || !s.openaiBaseURL.trim() || !s.openaiModel.trim()) {
      throw new MissingKeyError('请先在「设置」里填写 OpenAI 兼容接口的 Base URL、API Key 和模型名');
    }
    const model = s.openaiModel.trim();
    return { kind: 'openai', cfg: { apiKey: s.openaiKey, baseURL: s.openaiBaseURL }, model, visionModel: s.openaiVisionModel.trim() || model };
  }
  if (!s.apiKey) throw new MissingKeyError('请先在「设置」里填写 Claude API Key');
  return { kind: 'anthropic', client: new Anthropic({ apiKey: s.apiKey, baseURL: s.baseURL.trim() || undefined, maxRetries: 2 }) };
}

// A stored trip photo as an API image block. With `fit`, a copy whose long edge exceeds maxEdge is shrunk first —
// image tokens scale with pixel count, so this trades detail for cost.
export async function photoImageBlock(file: string, fit?: { width: number; height: number; maxEdge: number }) {
  let data: string;
  if (fit && Math.max(fit.width, fit.height) > fit.maxEdge) {
    const size = fit.width >= fit.height ? { width: fit.maxEdge } : { height: fit.maxEdge };
    const image = await ImageManipulator.manipulate(photoUri(file)).resize(size).renderAsync();
    const saved = await image.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
    data = saved.base64!;
  } else {
    data = await photoBase64(file);
  }
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } };
}

export function describeError(e: unknown): string {
  if (e instanceof MissingKeyError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return 'API Key 无效，请到设置里检查';
  if (e instanceof Anthropic.PermissionDeniedError) return '这个 API Key 没有权限使用该模型';
  if (e instanceof Anthropic.RateLimitError) return '请求太频繁，稍等一会儿再试';
  if (e instanceof Anthropic.APIConnectionError) return '连不上 Claude 服务，检查网络或设置里的 Base URL';
  if (e instanceof Anthropic.APIError) return `Claude 返回错误（${e.status ?? '?'}）：${e.message}`;
  if (e instanceof OpenAIError) {
    if (e.status === 401) return 'API Key 无效，请到设置里检查';
    if (e.status === 403) return `这个 API Key 没有权限使用该模型：${e.message}`;
    if (e.status === 404) return `接口地址或模型名不对，检查设置里的 Base URL 和模型名：${e.message}`;
    if (e.status === 429) return '请求太频繁或额度用完了，稍等一会儿再试';
    if (e.status == null) return `连不上模型服务，检查网络或设置里的 Base URL：${e.message}`;
    return `模型服务返回错误（${e.status}）：${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function assertUsable(stopReason: string | null) {
  if (stopReason === 'refusal') throw new Error('这次请求被模型拒绝了，换个说法再试试');
  if (stopReason === 'max_tokens') throw new Error('内容太长被截断了，请减少素材后重试');
}

// OpenAI finish_reason in Anthropic stop_reason terms
export function assertOAUsable(finishReason: string | null) {
  assertUsable(finishReason === 'length' ? 'max_tokens' : finishReason === 'content_filter' ? 'refusal' : null);
}
