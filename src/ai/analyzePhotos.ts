import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

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

const running = new Map<string, Promise<void>>();

// Analyse photos that have no analysis yet; concurrent callers share one run per trip
export function analyzePending(tripId: string) {
  const existing = running.get(tripId);
  if (existing) return existing;
  const run = doAnalyze(tripId).finally(() => running.delete(tripId));
  running.set(tripId, run);
  return run;
}

async function analyzeBatch(backend: Backend, content: BetaContentBlockParam[]): Promise<PhotoAnalysis[]> {
  if (backend.kind === 'openai') {
    // TEMP DEBUG: compare request shapes
    const parts = toOAParts(content);
    const img = parts.filter((p) => p.type === 'image_url');
    const txt = parts.filter((p) => p.type === 'text').map((p: any) => p.text).join('\n');
    const variants: Record<string, any[]> = {
      A_current: [{ role: 'user', content: [...parts, { type: 'text', text: jsonInstruction(PhotoAnalysisSchema) }] }],
      B_system: [{ role: 'system', content: '你是看图助手。' }, { role: 'user', content: [...parts, { type: 'text', text: jsonInstruction(PhotoAnalysisSchema) }] }],
      C_noSchema: [{ role: 'user', content: [...parts, { type: 'text', text: '只输出一个 JSON 对象：{"photos":[{"id","scene","place","city","region","country","subjects","mood","light","caption","cover_worthy"}]}' }] }],
      D_imageFirst: [{ role: 'user', content: [...img, { type: 'text', text: txt + '\n' + jsonInstruction(PhotoAnalysisSchema) }] }],
      E_describe: [{ role: 'user', content: [...img, { type: 'text', text: '描述这张照片' }] }],
    };
    for (const [k, messages] of Object.entries(variants)) {
      for (const mt of [8000, 2000]) {
        try {
          const r = await chatCompletion(backend.cfg, { model: backend.visionModel, max_tokens: mt, messages });
          console.log('DBG', k, mt, r.finishReason, JSON.stringify(r.text.slice(0, 160)));
        } catch (e) {
          console.log('DBG', k, mt, 'ERR', String(e).slice(0, 160));
        }
      }
    }
    const res = await chatCompletion(backend.cfg, {
      model: backend.visionModel,
      max_tokens: 8000,
      messages: [{ role: 'user', content: [...toOAParts(content), { type: 'text', text: jsonInstruction(PhotoAnalysisSchema) }] }],
    });
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
      const photos = await analyzeBatch(backend, content);
      const patches: PhotoPatch[] = [];
      for (const a of photos) {
        const p = batch.find((b) => b.id === a.id);
        if (!p) continue;
        // Android phones without Google services often can't reverse-geocode; fall back to the model's reading
        const fill = p.lat != null && !p.city;
        patches.push({
          id: a.id,
          fields: {
            analysis_json: JSON.stringify(a),
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
