import Anthropic from '@anthropic-ai/sdk';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { OAConfig } from './openai';
import { photoBase64, photoUri } from '@/photos/storage';
import { loadSettings } from '@/settings/settings';

export const DEFAULT_MODEL = 'claude-opus-5-5';

// Choices offered in settings; any other model ID can still be typed in
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: '推荐，效果和价格最均衡' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: '更快，价格约一半' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: '最快最便宜，游记质量一般' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', note: '最强，价格约 Opus 的 2.5 倍' },
];

// Server-side fallback re-runs a declined request on Anthropic's recommended model; only the 5.x family accepts it
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

// Model plus the fields that depend on it
export function claudeBase(model: string) {
  return /^claude-(fable-5-1|opus-5|opus-5-5|sonnet-5-5)$/.test(model) ? { model, ...FALLBACK } : { model };
}

// Haiku rejects the effort setting
export function claudeEffort<E extends 'low' | 'medium' | 'high'>(model: string, effort: E): { effort?: E } {
  return model.includes('haiku') ? {} : { effort };
}

class MissingKeyError extends Error {}

export type Backend =
  | { kind: 'anthropic'; client: Anthropic; model: string }
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
  return {
    kind: 'anthropic',
    client: new Anthropic({ apiKey: s.apiKey, baseURL: s.baseURL.trim() || undefined, maxRetries: 2 }),
    model: s.anthropicModel.trim() || DEFAULT_MODEL,
  };
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

// The error's own message, shown as-is
export function describeError(e: unknown): string {
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
