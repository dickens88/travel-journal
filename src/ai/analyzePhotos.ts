import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { matchAnalyses } from './analysisMatch';
import { assertOAUsable, assertUsable, describeError, claudeBase, claudeEffort, getBackend, photoImageBlock, type Backend } from './client';
import { chatCompletion, jsonInstruction, parseJSONReplyOrThrow, toOAParts } from './openai';
import { PhotoAnalysisSchema, type PhotoAnalysis } from './schemas';
import { fmtLocal, photoPlace } from './tripContext';
import { listPhotos, updatePhotos, type PhotoPatch } from '@/db/repo';
import { setJob } from '@/trip/jobs';

const BATCH = 8;
// Scenes, landmarks and captions read fine at 1024px; about 40% of the image tokens of the stored 1568px copy
const ANALYZE_EDGE = 1024;

const PROMPT = `以上是一次旅行中的照片，每张前面标了照片 id、当地拍摄时间、系统查到的地名（可能缺失）、GPS 坐标和根据太阳位置推算的光线。
请逐张描述，用于之后写游记：场景（认得出的地标写出名称）、主体、氛围、光线、一句简短图注，以及是否适合当封面。
只描述照片里看得到的内容，不确定的地标不要硬猜。所有字段用中文。`;

// One photo's analysis is ~150 tokens of JSON; the cap keeps a model that never stops from running for minutes
const TOKENS_PER_PHOTO = 600;
// A batch normally answers in 10–20 s
const TIMEOUT_MS = 60_000;

const running = new Map<string, Promise<void>>();

// Analyse photos that have no analysis yet; concurrent callers share one run per trip
export function analyzePending(tripId: string) {
  const existing = running.get(tripId);
  if (existing) return existing;
  const run = doAnalyze(tripId).finally(() => running.delete(tripId));
  running.set(tripId, run);
  return run;
}

async function analyzeBatch(backend: Backend, content: BetaContentBlockParam[], count: number): Promise<PhotoAnalysis[]> {
  if (backend.kind === 'openai') {
    const res = await chatCompletion(
      backend.visionCfg,
      {
        model: backend.visionModel,
        max_tokens: TOKENS_PER_PHOTO * count + 200,
        // Structured output: low temperature keeps vision models on the JSON instead of drifting into noise
        temperature: 0.2,
        messages: [{ role: 'user', content: [...toOAParts(content), { type: 'text', text: jsonInstruction(PhotoAnalysisSchema) }] }],
      },
      undefined,
      { timeoutMs: TIMEOUT_MS },
    );
    assertOAUsable(res.finishReason);
    return parseJSONReplyOrThrow(PhotoAnalysisSchema, res.text).photos;
  }
  const res = await backend.client.beta.messages.parse({
    ...claudeBase(backend.model),
    max_tokens: 8000,
    output_config: { ...claudeEffort(backend.model, 'medium'), format: betaZodOutputFormat(PhotoAnalysisSchema) },
    messages: [{ role: 'user', content }],
  });
  assertUsable(res.stop_reason);
  return res.parsed_output?.photos ?? [];
}

async function doAnalyze(tripId: string) {
  const pending = listPhotos(tripId).filter((p) => !p.analysis_json);
  if (!pending.length) return;
  let done = 0;
  setJob(tripId, { analyzing: { done, total: pending.length }, error: undefined });
  try {
    const backend = await getBackend();
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const images = await Promise.all(batch.map((p) => photoImageBlock(p.file, { width: p.width, height: p.height, maxEdge: ANALYZE_EDGE })));
      const content: BetaContentBlockParam[] = batch.flatMap((p, j) => {
        const time = p.taken_at != null ? fmtLocal(p.taken_at, p.offset_min) : '时间未知';
        const place = photoPlace(p) || '地名未知';
        const at = p.lat != null && p.lng != null ? `坐标 ${p.lat.toFixed(4)},${p.lng.toFixed(4)}${p.loc_estimated ? '（按时间估算）' : ''}` : '无坐标';
        return [{ type: 'text' as const, text: `照片 id=${p.id}｜${time}｜${place}｜${at}｜${p.lighting_tag || '光线未知'}` }, images[j]];
      });
      content.push({ type: 'text', text: PROMPT });
      const photos = await analyzeBatch(backend, content, batch.length);
      const patches: PhotoPatch[] = [];
      for (const [p, a] of matchAnalyses(batch, photos)) {
        // Android phones without Google services often can't reverse-geocode; fall back to the model's reading
        const fill = p.lat != null && !p.city;
        patches.push({
          id: p.id,
          fields: {
            analysis_json: JSON.stringify({ ...a, id: p.id }),
            ...(!p.place_name && a.place ? { place_name: a.place } : {}),
            ...(fill ? { city: a.city || null, region: a.region || null, country: a.country || null } : {}),
          },
        });
      }
      updatePhotos(patches);
      done += batch.length;
      setJob(tripId, { analyzing: { done, total: pending.length } });
    }
  } catch (e) {
    setJob(tripId, { error: { title: '照片识别失败', message: describeError(e), retry: () => analyzePending(tripId) } });
  } finally {
    setJob(tripId, { analyzing: undefined });
  }
}
