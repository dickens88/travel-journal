import { blocksOf, isUserTurn, savedNoteTexts, textOf, usedWebSearch } from '@/ai/chatContent';
import type { ChatRow, Note, Photo } from '@/db/types';
import { photoPlace } from '@/photos/describe';
import { localParts } from '@/utils/time';

export type FeedItem =
  | { kind: 'photos'; key: string; time: number; hm: string; photos: Photo[]; places: string[] }
  | { kind: 'note'; key: string; time: number; hm: string; note: Note }
  | {
      kind: 'chat';
      key: string;
      time: number;
      hm: string;
      firstRowId: number;
      turns: number;
      question: string;
      answer: string;
      usedSearch: boolean;
      savedNotes: number;
      photoId: string | null;
    };

export type FeedDay = { date: string; items: FeedItem[] };

const SESSION_GAP_MS = 30 * 60_000;

// Local day a photo belongs to in the feed: shot time at its own offset, else when it was added
export function photoDate(p: Photo) {
  return localParts(p.taken_at ?? p.added_at, p.taken_at != null ? p.offset_min : undefined).date;
}

export function buildFeed(photos: Photo[], notes: Note[], chats: ChatRow[]): FeedDay[] {
  const byDay = new Map<string, FeedItem[]>();
  const push = (date: string, item: FeedItem) => {
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(item);
  };

  const batches = new Map<string, { date: string; photos: Photo[] }>();
  for (const p of photos) {
    const date = photoDate(p);
    const key = `${p.batch_id}|${date}`;
    if (!batches.has(key)) batches.set(key, { date, photos: [] });
    batches.get(key)!.photos.push(p);
  }
  for (const [key, b] of batches) {
    const first = b.photos[0];
    const t = first.taken_at ?? first.added_at;
    const places = [...new Set(b.photos.map(photoPlace).filter(Boolean) as string[])];
    push(b.date, { kind: 'photos', key, time: t, hm: localParts(t, first.taken_at != null ? first.offset_min : undefined).hm, photos: b.photos, places });
  }

  for (const n of notes) {
    const parts = localParts(n.created_at);
    push(parts.date, { kind: 'note', key: n.id, time: n.created_at, hm: parts.hm, note: n });
  }

  let session: ChatRow[] = [];
  const flush = () => {
    if (!session.length) return;
    const userTurns = session.filter(isUserTurn);
    const assistantBlocks = session.filter((r) => r.role === 'assistant').flatMap((r) => blocksOf(r.content_json));
    const firstUser = userTurns[0] ? blocksOf(userTurns[0].content_json) : [];
    const lastAnswer = [...session].reverse().find((r) => r.role === 'assistant' && textOf(blocksOf(r.content_json)));
    const parts = localParts(session[0].created_at);
    push(parts.date, {
      kind: 'chat',
      key: `chat-${session[0].id}`,
      time: session[0].created_at,
      hm: parts.hm,
      firstRowId: session[0].id,
      turns: userTurns.length,
      question: textOf(firstUser),
      answer: lastAnswer ? textOf(blocksOf(lastAnswer.content_json)) : '',
      usedSearch: usedWebSearch(assistantBlocks),
      savedNotes: savedNoteTexts(assistantBlocks).length,
      photoId: firstUser.find((b) => b.type === 'trip_photo')?.photo_id ?? null,
    });
    session = [];
  };
  for (const row of chats) {
    const prev = session[session.length - 1];
    if (prev && row.created_at - prev.created_at > SESSION_GAP_MS) flush();
    session.push(row);
  }
  flush();

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items: items.sort((a, b) => b.time - a.time) }));
}
