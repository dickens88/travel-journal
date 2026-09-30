import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { analyzePending } from './analyzePhotos';
import { isUserTurn } from './chatContent';
import { assertUsable, completeJSON, describeError, claudeBase, claudeEffort, getBackend, type Backend } from './client';
import { jsonInstruction } from './openai';
import { JournalSchema, type Journal } from './schemas';
import { buildChatTranscript, buildTripContext } from './tripContext';
import { getT, type Messages } from '@/i18n';
import { getJournal, getTrip, listChat, listDays, listNotes, listPhotos, markIncluded, saveJournal, updateTrip } from '@/db/repo';
import { getJobs, setJob } from '@/trip/jobs';
import { photoAnalysis, stopsFromPhotos } from '@/trip/derive';

export function parseJournal(json: string | undefined | null): Journal | null {
  if (!json) return null;
  try {
    return JournalSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

async function writeJournal(backend: Backend, material: string, t: Messages): Promise<Journal | null> {
  if (backend.kind === 'openai') {
    return completeJSON(
      backend.cfg,
      {
        model: backend.model,
        max_tokens: 16000,
        messages: [
          { role: 'system', content: t.ai.journal.system },
          { role: 'user', content: `${material}\n\n${jsonInstruction(JournalSchema, t)}` },
        ],
      },
      JournalSchema,
    );
  }
  const stream = backend.client.beta.messages.stream({
    ...claudeBase(backend.model),
    max_tokens: 32000,
    system: t.ai.journal.system,
    output_config: { ...claudeEffort(backend.model, 'high'), format: betaZodOutputFormat(JournalSchema) },
    messages: [{ role: 'user', content: material }],
  });
  const res = await stream.finalMessage();
  assertUsable(res.stop_reason);
  return res.parsed_output;
}

// `fresh` writes from scratch instead of updating the saved journal, replacing it and any edits made to it
export async function generateJournal(tripId: string, opts: { fresh?: boolean } = {}) {
  if (getJobs(tripId).generating) return;
  setJob(tripId, { generating: true, error: undefined });
  const startedAt = Date.now();
  try {
    await analyzePending(tripId);
    const trip = getTrip(tripId);
    if (!trip) return;
    const photos = listPhotos(tripId);
    // One language for the whole run, so a switch while it writes can't mix prompts
    const t = getT();
    const j = t.ai.journal;
    if (!photos.length) throw new Error(t.errors.noPhotosForJournal);
    const notes = listNotes(tripId);
    const chats = listChat(tripId);
    const context = buildTripContext(trip, photos, stopsFromPhotos(photos), listDays(tripId), notes, t);
    const transcript = buildChatTranscript(chats, t);
    const existing = opts.fresh ? null : parseJournal(getJournal(tripId)?.content_json);

    const parts = [`<trip_material>\n${context}\n</trip_material>`];
    if (transcript) parts.push(`<buddy_chat>\n${transcript}\n</buddy_chat>`);
    if (existing) {
      const fresh = [
        ...photos.filter((p) => p.journal_included_at == null).map((p) => j.newPhoto(p.id)),
        ...notes.filter((n) => n.journal_included_at == null).map((n) => j.newNote(n.text)),
        ...chats.filter((c) => c.journal_included_at == null && isUserTurn(c)).length ? [j.newChat] : [],
      ];
      parts.push(`<existing_journal>\n${JSON.stringify(existing)}\n</existing_journal>`);
      parts.push(j.update(fresh.join(t.common.listSep) || j.nothingNew));
    } else {
      parts.push(j.write);
    }

    const journal = await writeJournal(await getBackend(), parts.join('\n\n'), t);
    if (!journal) throw new Error(t.errors.journalUnreadable);

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
    setJob(tripId, { error: { title: getT().errors.journalFailed, message: describeError(e), retry: () => generateJournal(tripId, opts) } });
  } finally {
    setJob(tripId, { generating: false });
  }
}
