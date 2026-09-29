import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { analyzePending } from './analyzePhotos';
import { isUserTurn } from './chatContent';
import { assertOAUsable, assertUsable, describeError, claudeBase, claudeEffort, getBackend, type Backend } from './client';
import { chatCompletion, jsonInstruction, parseJSONReplyOrThrow } from './openai';
import { JournalSchema, type Journal } from './schemas';
import { buildChatTranscript, buildTripContext } from './tripContext';
import { getJournal, getTrip, listChat, listDays, listNotes, listPhotos, markIncluded, saveJournal, updateTrip } from '@/db/repo';
import { getJobs, setJob } from '@/trip/jobs';
import { photoAnalysis, stopsFromPhotos } from '@/trip/derive';

const SYSTEM = `你是一位擅长写中文旅行随笔的作者，帮用户把旅途素材整理成图文游记。
写作要求：
- 第一人称，真诚、克制、有画面感，避免空泛的形容词堆砌和说教式结尾。
- 按天组织；每天分成若干小节，每节对应一个停留点或一段经历，正文 80–220 字。
- 只写素材能支撑的内容：地点、时间、照片里的画面、天气、随手记和对话里提到的经历与感受。不要编造素材里没有的事件、人名、店名、价格。随手记里的原话可以直接引用。搭子在对话里提供的背景知识可以少量点缀。
- 每节从给出的照片 id 里挑 1–4 张最贴合文字的照片，写入 photo_ids；每张照片全文最多用一次，只能使用给出的 id。
- date 用 YYYY-MM-DD，和素材里的当地日期一致；heading 写停留点名称或一个简短小标题。
- summary 是 2–3 句的全程概述。
- xhs 是配套的小红书文案：title 不超过 20 字；body 300 字以内，分短段，可以用少量 emoji；tags 5–8 个，不带 # 号。`;

export function parseJournal(json: string | undefined | null): Journal | null {
  if (!json) return null;
  try {
    return JournalSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

async function writeJournal(backend: Backend, material: string): Promise<Journal | null> {
  if (backend.kind === 'openai') {
    const res = await chatCompletion(backend.cfg, {
      model: backend.model,
      max_tokens: 16000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${material}\n\n${jsonInstruction(JournalSchema)}` },
      ],
    });
    assertOAUsable(res.finishReason);
    return parseJSONReplyOrThrow(JournalSchema, res.text);
  }
  const stream = backend.client.beta.messages.stream({
    ...claudeBase(backend.model),
    max_tokens: 32000,
    system: SYSTEM,
    output_config: { ...claudeEffort(backend.model, 'high'), format: betaZodOutputFormat(JournalSchema) },
    messages: [{ role: 'user', content: material }],
  });
  const res = await stream.finalMessage();
  assertUsable(res.stop_reason);
  return res.parsed_output;
}

export async function generateJournal(tripId: string) {
  if (getJobs(tripId).generating) return;
  setJob(tripId, { generating: true, error: undefined });
  const startedAt = Date.now();
  try {
    await analyzePending(tripId);
    const trip = getTrip(tripId);
    if (!trip) return;
    const photos = listPhotos(tripId);
    if (!photos.length) throw new Error('先添加一些照片再生成游记');
    const notes = listNotes(tripId);
    const chats = listChat(tripId);
    const context = buildTripContext(trip, photos, stopsFromPhotos(photos), listDays(tripId), notes);
    const transcript = buildChatTranscript(chats);
    const existing = parseJournal(getJournal(tripId)?.content_json);

    const parts = [`<trip_material>\n${context}\n</trip_material>`];
    if (transcript) parts.push(`<buddy_chat>\n${transcript}\n</buddy_chat>`);
    if (existing) {
      const fresh = [
        ...photos.filter((p) => p.journal_included_at == null).map((p) => `照片 ${p.id}`),
        ...notes.filter((n) => n.journal_included_at == null).map((n) => `随手记「${n.text}」`),
        ...chats.filter((c) => c.journal_included_at == null && isUserTurn(c)).length ? ['新的搭子对话'] : [],
      ];
      parts.push(`<existing_journal>\n${JSON.stringify(existing)}\n</existing_journal>`);
      parts.push(`这是更新：已有游记里的段落尽量保留原文和风格，把新增素材（${fresh.join('、') || '无'}）写进对应的日期和小节，必要时新增小节或调整衔接，输出完整的新版游记。`);
    } else {
      parts.push('请根据以上素材写出完整游记。');
    }

    const journal = await writeJournal(await getBackend(), parts.join('\n\n'));
    if (!journal) throw new Error('游记格式解析失败，请重试');

    // Drop hallucinated or duplicate photo ids
    const valid = new Set(photos.map((p) => p.id));
    const used = new Set<string>();
    for (const day of journal.days) {
      for (const s of day.sections) {
        s.photo_ids = s.photo_ids.filter((id) => valid.has(id) && !used.has(id) && used.add(id));
      }
    }
    saveJournal(tripId, journal);
    markIncluded(tripId, startedAt);
    if (!trip.cover_photo_id) {
      const cover = photos.find((p) => photoAnalysis(p)?.cover_worthy) ?? photos[0];
      updateTrip(tripId, { cover_photo_id: cover.id });
    }
  } catch (e) {
    setJob(tripId, { error: { title: '游记生成失败', message: describeError(e), retry: () => generateJournal(tripId) } });
  } finally {
    setJob(tripId, { generating: false });
  }
}
