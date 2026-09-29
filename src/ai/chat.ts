import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import * as Speech from 'expo-speech';
import { z } from 'zod';

import { blocksOf, textOf, type StoredBlock } from './chatContent';
import { assertOAUsable, assertUsable, FALLBACK, getBackend, MODEL, photoImageBlock, type Backend } from './client';
import { chatCompletion, toOAParts, type OAContentPart, type OAMessage, type OATool, type OAToolCall } from './openai';
import { buildTripContext } from './tripContext';
import { addChatMessage, addNote, getTrip, listChat, listDays, listNotes, listPhotos } from '@/db/repo';
import type { ChatRow, Photo } from '@/db/types';
import { loadSettings } from '@/settings/settings';
import { stopsFromPhotos } from '@/trip/derive';
import { localParts } from '@/utils/time';

// Default buddy persona; the user can replace it in Settings. The trip material is appended after it either way.
export const BUDDY_PROMPT = `你是用户这趟旅行的「旅行搭子」，一个懂行、说话自然的中文旅伴。
- 用户在手机上阅读，回答口语化、简洁，通常 3–6 句；需要列清单时用短列表，不用 markdown 标题。
- 下面 <trip> 里是这趟旅行的素材（停留点、照片内容、随手记、天气），回答时优先结合它。用户发来的照片前会标注照片 id。
- 涉及实时信息（天气预报、营业时间、交通、票价、活动）时使用 web_search，并说明信息来自搜索。
- 用户想记录一句感受或经历时（例如「记一下……」「帮我记……」），调用 save_note 保存，然后用一句话确认。
- 不确定的事实就直说不确定，不要编造店名、价格或时间。`;

// OpenAI-compatible endpoints get no web search tool
const NO_SEARCH = '当前没有联网搜索工具：涉及实时信息时直接说明查不到最新情况，建议用户出发前再核实。';

const SaveNoteInput = z.object({ text: z.string().min(1), related_photo_id: z.string() });

const SAVE_NOTE = {
  name: 'save_note',
  description: '把用户想记下来的一句话保存为这趟旅行的随手记。用户说「记一下」「帮我记」「记录」之类的话时调用。',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: '要保存的内容，保留用户原话的意思，去掉「记一下」这类指令词' },
      related_photo_id: {
        type: 'string',
        description: '如果能从时间、地点或内容判断这条记录对应哪张照片，填照片 id；判断不了填空字符串',
      },
    },
    required: ['text', 'related_photo_id'],
    additionalProperties: false,
  },
};

const TOOLS: BetaToolUnion[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
  { ...SAVE_NOTE, strict: true, eager_input_streaming: true },
];
const OA_TOOLS: OATool[] = [
  { type: 'function', function: { name: SAVE_NOTE.name, description: SAVE_NOTE.description, parameters: SAVE_NOTE.input_schema } },
];

// Stored rows -> API messages: expand trip photos to images, merge same-role neighbours
async function toApiMessages(rows: ChatRow[], photoById: Map<string, Photo>, image: (file: string) => Promise<unknown>): Promise<BetaMessageParam[]> {
  const out: BetaMessageParam[] = [];
  for (const r of rows) {
    const content: any[] = [];
    for (const b of blocksOf(r.content_json)) {
      if (b.type === 'trip_photo') {
        const photo = photoById.get(b.photo_id);
        if (!photo) continue;
        content.push({ type: 'text', text: `（照片 id=${photo.id}）` });
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

function runSaveNote(tripId: string, input: unknown, photoById: Map<string, Photo>): string {
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
  return photo?.place_name ? `已保存，并关联到 ${photo.place_name}` : '已保存';
}

// Stored rows -> OpenAI messages. Only text, trip photos and save_note calls carry over; Anthropic web search blocks are dropped.
async function toOAMessages(rows: ChatRow[], photoById: Map<string, Photo>, image: (file: string) => Promise<StoredBlock>): Promise<OAMessage[]> {
  const out: OAMessage[] = [];
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
    for (const b of blocks) {
      if (b.type === 'text') parts.push({ type: 'text', text: b.text });
      if (b.type === 'trip_photo') {
        const photo = photoById.get(b.photo_id);
        if (!photo) continue;
        parts.push({ type: 'text', text: `（照片 id=${photo.id}）` }, ...toOAParts([await image(photo.file)]));
      }
    }
    if (!parts.length) continue;
    if (prev?.role === 'user' && Array.isArray(prev.content)) prev.content.push(...parts);
    else out.push({ role: 'user', content: parts });
  }
  return out;
}

type Reply = { content: StoredBlock[]; pause: boolean };

async function anthropicTurn(client: Anthropic, system: string, now: string, messages: BetaMessageParam[], onText: (text: string) => void): Promise<Reply> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: now },
    ],
    tools: TOOLS,
    output_config: { effort: 'medium' },
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

async function openaiTurn(backend: Extract<Backend, { kind: 'openai' }>, system: string, now: string, history: OAMessage[], onText: (text: string) => void): Promise<Reply> {
  const seesImages = history.some((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
  const res = await chatCompletion(
    backend.cfg,
    {
      model: seesImages ? backend.visionModel : backend.model,
      max_tokens: 8000,
      tools: OA_TOOLS,
      messages: [{ role: 'system', content: `${system}\n\n${now}\n${NO_SEARCH}` }, ...history],
    },
    onText,
  );
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

export async function sendBuddyMessage(tripId: string, text: string, photoId: string | null, onText: (text: string) => void) {
  const trip = getTrip(tripId);
  if (!trip) return;
  const backend = await getBackend();
  const userBlocks: StoredBlock[] = [];
  if (photoId) userBlocks.push({ type: 'trip_photo', photo_id: photoId });
  userBlocks.push({ type: 'text', text });
  addChatMessage(tripId, 'user', userBlocks);

  const photos = listPhotos(tripId);
  const photoById = new Map(photos.map((p) => [p.id, p]));
  // History images are re-sent every turn; read each file once per message
  const images = new Map<string, ReturnType<typeof photoImageBlock>>();
  const image = (file: string) => {
    if (!images.has(file)) images.set(file, photoImageBlock(file));
    return images.get(file)!;
  };
  const context = buildTripContext(trip, photos, stopsFromPhotos(photos), listDays(tripId), listNotes(tripId));
  const { buddyPrompt, tts } = await loadSettings();
  const system = `${buddyPrompt.trim() || BUDDY_PROMPT}\n\n<trip>\n${context}\n</trip>`;
  const nowParts = localParts(Date.now());
  const now = `现在是用户手机上的 ${nowParts.date} ${nowParts.hm}。`;

  let answer = '';
  for (let turn = 0; turn < 6; turn++) {
    // Earlier turns are already saved rows; stream only the current turn's text
    onText('');
    const rows = listChat(tripId);
    const reply =
      backend.kind === 'openai'
        ? await openaiTurn(backend, system, now, await toOAMessages(rows, photoById, image), onText)
        : await anthropicTurn(backend.client, system, now, await toApiMessages(rows, photoById, image), onText);
    if (reply.content.length) addChatMessage(tripId, 'assistant', reply.content);
    answer = textOf(reply.content);

    if (reply.pause) continue;
    const uses = reply.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) break;
    const results: BetaToolResultBlockParam[] = uses.map((b) => {
      const out = b.name === 'save_note' ? runSaveNote(tripId, b.input, photoById) : `未知工具 ${b.name}`;
      return { type: 'tool_result', tool_use_id: b.id, content: out, is_error: out === 'INVALID_INPUT' };
    });
    addChatMessage(tripId, 'user', results);
  }

  if (tts && answer) speak(answer);
}

export function speak(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'zh-CN' });
}
