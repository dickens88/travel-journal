import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { matchAnalyses } from './analysisMatch';
import { assertOAUsable, assertUsable, describeError, claudeBase, claudeEffort, getBackend, photoImageBlock, type Backend } from './client';
import { chatCompletion, jsonInstruction, parseJSONReplyOrThrow, toOAParts } from './openai';
import { photoAnalysisSchema, type PhotoAnalysis } from './schemas';
import { fmtLocal, photoPlace } from './tripContext';
import { listPhotos, updatePhotos, type PhotoPatch } from '@/db/repo';
import { lightingText } from '@/geo/lighting';
import { getT, type Messages } from '@/i18n';
import { setJob } from '@/trip/jobs';

const BATCH = 8;
// Scenes, landmarks and captions read fine at 1024px; about 40% of the image tokens of the stored 1568px copy
const ANALYZE_EDGE = 1024;

// One photo's analysis is ~150 tokens of JSON; the cap keeps a model that never stops from running for minutes
const TOKENS_PER_PHOTO = 600;
// A batch normally answers in 10–20 s
const TIMEOUT_MS = 60_000;

// A trip's recognition run: photo ids still to do, the batch in flight, and how many are done
type Run = { queue: Set<string>; batch: string[]; done: number; promise: Promise<void> };
const runs = new Map<string, Run>();

function report(tripId: string, run: Run) {
  const ids = [...run.batch, ...run.queue];
  setJob(tripId, { analyzing: { done: run.done, total: run.done + ids.length, ids } });
}

// Analyse photos that have no analysis yet: the given ones, or all of the trip's. Requests made while a run is
// going join its queue, so there is one run per trip, and it resolves once everything asked for is done.
export function analyzePending(tripId: string, photoIds?: string[]): Promise<void> {
  const ids = listPhotos(tripId)
    .filter((p) => !p.analysis_json && (!photoIds || photoIds.includes(p.id)))
    .map((p) => p.id);
  const existing = runs.get(tripId);
  if (existing) {
    for (const pid of ids) if (!existing.batch.includes(pid)) existing.queue.add(pid);
    report(tripId, existing);
    return existing.promise;
  }
  if (!ids.length) return Promise.resolve();
  const run: Run = { queue: new Set(ids), batch: [], done: 0, promise: Promise.resolve() };
  runs.set(tripId, run);
  setJob(tripId, { error: undefined });
  report(tripId, run);
  run.promise = doAnalyze(tripId, run);
  return run.promise;
}

async function analyzeBatch(backend: Backend, content: BetaContentBlockParam[], count: number, t: Messages): Promise<PhotoAnalysis[]> {
  const schema = photoAnalysisSchema(t);
  if (backend.kind === 'openai') {
    const res = await chatCompletion(
      backend.visionCfg,
      {
        model: backend.visionModel,
        max_tokens: TOKENS_PER_PHOTO * count + 200,
        // Structured output: low temperature keeps vision models on the JSON instead of drifting into noise
        temperature: 0.2,
        messages: [{ role: 'user', content: [...toOAParts(content), { type: 'text', text: jsonInstruction(schema, t) }] }],
      },
      undefined,
      { timeoutMs: TIMEOUT_MS },
    );
    assertOAUsable(res.finishReason);
    return parseJSONReplyOrThrow(schema, res.text).photos;
  }
  const res = await backend.client.beta.messages.parse({
    ...claudeBase(backend.model),
    max_tokens: 8000,
    output_config: { ...claudeEffort(backend.model, 'medium'), format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  assertUsable(res.stop_reason);
  return res.parsed_output?.photos ?? [];
}

async function doAnalyze(tripId: string, run: Run) {
  try {
    const backend = await getBackend();
    const t = getT();
    const d = t.ai.analyze;
    while (run.queue.size) {
      // Looked up afresh each time: queued photos may have been deleted in the meantime
      const batch = listPhotos(tripId)
        .filter((p) => run.queue.has(p.id) && !p.analysis_json)
        .slice(0, BATCH);
      if (!batch.length) break;
      run.batch = batch.map((p) => p.id);
      for (const p of batch) run.queue.delete(p.id);
      report(tripId, run);
      const images = await Promise.all(batch.map((p) => photoImageBlock(p.file, { width: p.width, height: p.height, maxEdge: ANALYZE_EDGE })));
      const content: BetaContentBlockParam[] = batch.flatMap((p, j) => {
        const time = p.taken_at != null ? fmtLocal(p.taken_at, p.offset_min) : t.ai.context.timeUnknown;
        const place = photoPlace(p) || t.ai.context.placeUnknown;
        const at = p.lat != null && p.lng != null ? d.coords(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, !!p.loc_estimated) : d.noCoords;
        const light = p.lighting_tag ? lightingText(p.lighting_tag, t) : d.lightUnknown;
        return [{ type: 'text' as const, text: d.photo(p.id, time, place, at, light) }, images[j]];
      });
      content.push({ type: 'text', text: d.prompt });
      const photos = await analyzeBatch(backend, content, batch.length, t);
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
      run.done += batch.length;
      run.batch = [];
      report(tripId, run);
    }
  } catch (e) {
    const failed = [...run.batch, ...run.queue];
    setJob(tripId, { error: { title: getT().errors.photoRecognitionFailed, message: describeError(e), retry: () => analyzePending(tripId, failed) } });
  } finally {
    runs.delete(tripId);
    setJob(tripId, { analyzing: undefined });
  }
}
