import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';

import { resolveSpot, type Spot } from './buddySkills';
import { blocksOf, textOf, type StoredBlock } from './chatContent';
import { assertOAUsable, assertUsable, claudeBase, claudeEffort, describeError, getBackend, photoImageBlock, type Backend } from './client';
import { chatCompletion, OpenAIError, toOAParts, type OAContentPart, type OAMessage, type OATool, type OAToolCall } from './openai';
import { buildTripContext } from './tripContext';
import { addChatMessage, addNote, getTrip, listDays, listNotes, listPhotos, listSession } from '@/db/repo';
import type { ChatRow, Photo, Trip } from '@/db/types';
import type { LatLng } from '@/geo/distance';
import { describeFood, findPlace, searchNearbyFood, type FoodKeys } from '@/geo/nearbyFood';
import { getT, type Messages } from '@/i18n';
import { loadSettings } from '@/settings/settings';
import { photoAnalysis, stopsFromPhotos } from '@/trip/derive';
import { localParts } from '@/utils/time';

const SaveNoteInput = z.object({ text: z.string().min(1), related_photo_id: z.string() });

const saveNoteTool = (t: Messages['ai']['tools']) => ({
  name: 'save_note',
  description: t.saveNote,
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: t.saveNoteText },
      related_photo_id: { type: 'string', description: t.saveNotePhoto },
    },
    required: ['text', 'related_photo_id'],
    additionalProperties: false,
  },
});

const NearbyFoodInput = z.object({ keyword: z.string(), radius_m: z.number(), place: z.string(), in_mainland_china: z.boolean() });

const NEARBY_FOOD = 'search_nearby_food';

// Runs on the phone around where the user is: AMap in mainland China, Google Places abroad, OpenStreetMap as fallback
const nearbyFoodTool = (t: Messages['ai']['tools']) => ({
  name: NEARBY_FOOD,
  description: t.food,
  input_schema: {
    type: 'object' as const,
    properties: {
      keyword: { type: 'string', description: t.foodKeyword },
      radius_m: { type: 'integer', description: t.foodRadius },
      place: { type: 'string', description: t.foodPlace },
      in_mainland_china: { type: 'boolean', description: t.foodChina },
    },
    required: ['keyword', 'radius_m', 'place', 'in_mainland_china'],
    additionalProperties: false,
  },
});

// Tool descriptions are written in the reply language too
const functions = (t: Messages) => [saveNoteTool(t.ai.tools), nearbyFoodTool(t.ai.tools)];

// Haiku only has the basic web search tool
const tools = (model: string, t: Messages): BetaToolUnion[] => [
  model.includes('haiku') ? { type: 'web_search_20250305', name: 'web_search', max_uses: 3 } : { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
  ...functions(t).map((f) => ({ ...f, strict: true, eager_input_streaming: true })),
];
const oaTools = (t: Messages): OATool[] => functions(t).map((f) => ({ type: 'function', function: { name: f.name, description: f.description, parameters: f.input_schema } }));

// The default persona is t.ai.persona; the user can replace it in Settings. After the persona come notes that hold
// whatever it says: how to read the send times (t.ai.timeNote), looking restaurants up instead of recalling them
// (t.ai.foodNote), then the trip material and, last, the reply language (t.ai.replyLanguage).

// Send time of a user message. Derived from the stored row so earlier turns render byte-identical every request —
// a "current time" in the system prompt would change each minute and void the prompt cache for the whole history.
function sentAt(r: ChatRow, blocks: StoredBlock[], t: Messages): string | null {
  if (r.role !== 'user' || !blocks.some((b) => b.type === 'text' || b.type === 'trip_photo')) return null;
  const { date, hm } = localParts(r.created_at);
  return t.ai.sentAt(date, hm);
}

// Stored rows -> API messages: expand trip photos to images, merge same-role neighbours
async function toApiMessages(rows: ChatRow[], photoById: Map<string, Photo>, image: (file: string) => Promise<unknown>, t: Messages): Promise<BetaMessageParam[]> {
  const out: BetaMessageParam[] = [];
  for (const r of rows) {
    const blocks = blocksOf(r.content_json);
    const content: any[] = [];
    // Tool results are stored as their own rows, so a stamped row never has to lead with one
    const stamp = sentAt(r, blocks, t);
    if (stamp) content.push({ type: 'text', text: stamp });
    for (const b of blocks) {
      if (b.type === 'trip_photo') {
        const photo = photoById.get(b.photo_id);
        if (!photo) continue;
        content.push({ type: 'text', text: t.ai.photoId(photo.id) });
        content.push(await image(photo.file));
      } else {
        content.push(b);
      }
    }
    if (!content.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === r.role) (prev.content as any[]).push(...content);
    else out.push({ role: r.role, content });
  }
  return out;
}

function runSaveNote(tripId: string, input: unknown, photoById: Map<string, Photo>, t: Messages['ai']['tools']): string {
  const parsed = SaveNoteInput.safeParse(input);
  if (!parsed.success) return 'INVALID_INPUT';
  const photo = photoById.get(parsed.data.related_photo_id);
  addNote({
    trip_id: tripId,
    text: parsed.data.text,
    lat: photo?.lat ?? null,
    lng: photo?.lng ?? null,
    place_name: photo?.place_name ?? null,
    source: 'buddy',
    created_at: photo?.taken_at ?? Date.now(),
  });
  return photo?.place_name ? t.noteSavedAt(photo.place_name) : t.noteSaved;
}

async function runNearbyFood(input: unknown, spot: () => Promise<Spot | null>, keys: FoodKeys, t: Messages['ai']['tools']): Promise<string> {
  const parsed = NearbyFoodInput.safeParse(input);
  if (!parsed.success) return 'INVALID_INPUT';
  const { keyword, radius_m, place, in_mainland_china } = parsed.data;
  let at: LatLng;
  let where: string;
  if (place.trim()) {
    const found = await findPlace(keys, place.trim(), in_mainland_china);
    if (!found) return t.placeNotFound(place);
    at = found;
    where = t.placeFound(found.label, place);
  } else {
    const here = await spot();
    if (!here) return t.noPosition;
    at = here;
    const label = here.label || `${here.lat.toFixed(4)}, ${here.lng.toFixed(4)}`;
    where = here.live ? t.currentPosition(label) : t.lastPhotoPosition(label);
  }
  return describeFood(await searchNearbyFood(keys, at, { keyword, radiusM: radius_m || undefined }), where);
}

// Stored rows -> OpenAI messages. Only text, trip photos and save_note calls carry over; Anthropic web search blocks are dropped.
// Only the newest user message carries real images; earlier photos become text references, so a follow-up
// question goes to the (tool-capable) text model instead of re-sending every image to the vision model
async function toOAMessages(rows: ChatRow[], photoById: Map<string, Photo>, image: (file: string) => Promise<StoredBlock>, t: Messages): Promise<OAMessage[]> {
  const out: OAMessage[] = [];
  const latestAsk = rows.findLast((r) => sentAt(r, blocksOf(r.content_json), t) !== null);
  for (const r of rows) {
    const blocks = blocksOf(r.content_json);
    const prev = out[out.length - 1];
    if (r.role === 'assistant') {
      const text = textOf(blocks);
      const calls: OAToolCall[] = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      if (!text && !calls.length) continue;
      if (prev?.role === 'assistant') {
        prev.content = (prev.content ?? '') + text;
        if (calls.length) prev.tool_calls = [...(prev.tool_calls ?? []), ...calls];
      } else {
        out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      }
      continue;
    }
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : textOf(b.content ?? []) });
      }
    }
    const parts: OAContentPart[] = [];
    const stamp = sentAt(r, blocks, t);
    if (stamp) parts.push({ type: 'text', text: stamp });
    for (const b of blocks) {
      if (b.type === 'text') parts.push({ type: 'text', text: b.text });
      if (b.type === 'trip_photo') {
        const photo = photoById.get(b.photo_id);
        if (!photo) continue;
        if (r === latestAsk) {
          parts.push({ type: 'text', text: t.ai.photoId(photo.id) }, ...toOAParts([await image(photo.file)]));
        } else {
          const seen = photoAnalysis(photo)?.caption;
          parts.push({ type: 'text', text: t.ai.earlierPhoto(photo.id, seen) });
        }
      }
    }
    if (!parts.length) continue;
    if (prev?.role === 'user' && Array.isArray(prev.content)) prev.content.push(...parts);
    else out.push({ role: 'user', content: parts });
  }
  return out;
}

type Reply = { content: StoredBlock[]; pause: boolean };

async function anthropicTurn({ client, model }: Extract<Backend, { kind: 'anthropic' }>, system: string, messages: BetaMessageParam[], t: Messages, onText: (text: string) => void): Promise<Reply> {
  const stream = client.beta.messages.stream({
    ...claudeBase(model),
    max_tokens: 16000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    // Second breakpoint on the last block: history (with its images) is re-sent every turn and read back at cache price
    cache_control: { type: 'ephemeral' },
    tools: tools(model, t),
    output_config: claudeEffort(model, 'medium'),
    messages,
  });
  let shown = '';
  stream.on('text', (delta) => {
    shown += delta;
    onText(shown);
  });
  const msg = await stream.finalMessage();
  assertUsable(msg.stop_reason);
  return { content: msg.content as StoredBlock[], pause: msg.stop_reason === 'pause_turn' };
}

async function openaiTurn(backend: Extract<Backend, { kind: 'openai' }>, system: string, history: OAMessage[], t: Messages, onText: (text: string) => void): Promise<Reply> {
  const seesImages = history.some((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
  const cfg = seesImages ? backend.visionCfg : backend.cfg;
  const req = {
    model: seesImages ? backend.visionModel : backend.model,
    max_tokens: 8000,
    messages: [{ role: 'system' as const, content: `${system}\n${t.ai.noSearch}` }, ...history],
  };
  let res;
  try {
    res = await chatCompletion(cfg, { ...req, tools: oaTools(t) }, onText);
  } catch (e) {
    // Many hosted vision models can't call tools and reject the request outright; answer without save_note then
    if (!(e instanceof OpenAIError && e.status === 400)) throw e;
    res = await chatCompletion(cfg, req, onText);
  }
  assertOAUsable(res.finishReason);
  // Stored in Anthropic block shape so the chat UI, the journal and a later switch back to Claude all read it the same way
  const content: StoredBlock[] = res.text.trim() ? [{ type: 'text', text: res.text }] : [];
  res.toolCalls.forEach((c, i) => {
    let input: unknown = {};
    try {
      input = JSON.parse(c.function.arguments || '{}');
    } catch {}
    const id = (c.id || `call_${Date.now()}_${i}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    content.push({ type: 'tool_use', id, name: c.function.name, input });
  });
  return { content, pause: false };
}

export async function sendBuddyMessage(tripId: string, text: string, photoIds: string[], onText: (text: string) => void) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const backend = await getBackend();
  const userBlocks: StoredBlock[] = [];
  for (const id of photoIds) userBlocks.push({ type: 'trip_photo', photo_id: id });
  userBlocks.push({ type: 'text', text });
  addChatMessage(tripId, 'user', userBlocks);
  await answerLatest(tripId, trip, backend, onText);
}

// Answer again after a failed reply, reusing the question already saved instead of storing it twice
export async function retryBuddyMessage(tripId: string, onText: (text: string) => void) {
  const trip = getTrip(tripId);
  if (!trip) return;
  await answerLatest(tripId, trip, await getBackend(), onText);
}

async function answerLatest(tripId: string, trip: Trip, backend: Backend, onText: (text: string) => void) {
  const photos = listPhotos(tripId);
  const photoById = new Map(photos.map((p) => [p.id, p]));
  // History images are re-sent every turn; read each file once per message
  const images = new Map<string, ReturnType<typeof photoImageBlock>>();
  const image = (file: string) => {
    if (!images.has(file)) images.set(file, photoImageBlock(file));
    return images.get(file)!;
  };
  // Fixed for the whole answer, so a language switch mid-reply can't mix prompts
  const t = getT();
  const context = buildTripContext(trip, photos, stopsFromPhotos(photos), listDays(tripId), listNotes(tripId), t);
  const { buddyPrompt, amapKey, googlePlacesKey } = await loadSettings();
  // Located once per answer, and only if the model asks for nearby food
  let spotting: Promise<Spot | null> | null = null;
  const spot = () => (spotting ??= resolveSpot(trip, photos));
  const system = `${buddyPrompt.trim() || t.ai.persona}\n${t.ai.timeNote}\n${t.ai.foodNote}\n\n<trip>\n${context}\n</trip>\n\n${t.ai.replyLanguage}`;

  for (let turn = 0; turn < 6; turn++) {
    // Earlier turns are already saved rows; stream only the current turn's text. Only the current conversation is sent.
    onText('');
    const rows = listSession(tripId);
    const reply =
      backend.kind === 'openai'
        ? await openaiTurn(backend, system, await toOAMessages(rows, photoById, image, t), t, onText)
        : await anthropicTurn(backend, system, await toApiMessages(rows, photoById, image, t), t, onText);
    if (reply.content.length) addChatMessage(tripId, 'assistant', reply.content);

    if (reply.pause) continue;
    const uses = reply.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) break;
    // Independent lookups (e.g. two food searches in one turn) run side by side
    const results = await Promise.all(
      uses.map(async (b): Promise<BetaToolResultBlockParam> => {
        let out: string;
        let failed = false;
        try {
          out =
            b.name === 'save_note'
              ? runSaveNote(tripId, b.input, photoById, t.ai.tools)
              : b.name === NEARBY_FOOD
                ? await runNearbyFood(b.input, spot, { amap: amapKey, google: googlePlacesKey }, t.ai.tools)
                : t.ai.tools.unknownTool(b.name);
        } catch (e) {
          out = t.ai.tools.lookupFailed(describeError(e));
          failed = true;
        }
        return { type: 'tool_result', tool_use_id: b.id, content: out, is_error: failed || out === 'INVALID_INPUT' };
      }),
    );
    addChatMessage(tripId, 'user', results);
  }
}
