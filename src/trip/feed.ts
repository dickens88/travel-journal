import { blocksOf, isUserTurn, savedNoteTexts, textOf, usedWebSearch } from '@/ai/chatContent';
import type { ChatRow, Note, Photo } from '@/db/types';
import { haversineKm } from '@/geo/distance';
import { photoArea, photoPlace } from '@/photos/describe';
import { stripMarkdown } from '@/utils/markdown';
import { localParts } from '@/utils/time';

export type FeedItem =
  | { kind: 'photos'; key: string; time: number; hm: string; photos: Photo[]; area: string | null; places: string[] }
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
export type PhotoGroup = { date: string; area: string | null; photos: Photo[] };

const SESSION_GAP_MS = 30 * 60_000;
// Photos with no known city still start a new card when they are this far from the previous shot
const UNNAMED_SPLIT_KM = 30;

// Local day a photo belongs to in the feed: shot time at its own offset, else when it was added
function photoDate(p: Photo) {
  return localParts(p.taken_at ?? p.added_at, p.taken_at != null ? p.offset_min : undefined).date;
}

// Distance between two shots; 0 when either has no position
function apartKm(a: Photo, b: Photo) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  return haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

// Feed cards for photos: each upload, split by local day, then into runs of consecutive shots in the same city
// (or, while the city is unknown, near each other). Expects photos in shot order, as listPhotos returns them.
export function photoGroups(photos: Photo[]): PhotoGroup[] {
  const batches = new Map<string, { date: string; photos: Photo[] }>();
  for (const p of photos) {
    const date = photoDate(p);
    const key = `${p.batch_id}|${date}`;
    if (!batches.has(key)) batches.set(key, { date, photos: [] });
    batches.get(key)!.photos.push(p);
  }
  const groups: PhotoGroup[] = [];
  for (const batch of batches.values()) {
    let run: PhotoGroup | null = null;
    for (const p of batch.photos) {
      const area = photoArea(p);
      const prev = run?.photos[run.photos.length - 1];
      if (!run || run.area !== area || (!area && prev && apartKm(prev, p) > UNNAMED_SPLIT_KM)) {
        run = { date: batch.date, area, photos: [] };
        groups.push(run);
      }
      run.photos.push(p);
    }
  }
  return groups;
}

export function buildFeed(photos: Photo[], notes: Note[], chats: ChatRow[]): FeedDay[] {
  const byDay = new Map<string, FeedItem[]>();
  const push = (date: string, item: FeedItem) => {
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(item);
  };

  for (const g of photoGroups(photos)) {
    const first = g.photos[0];
    const t = first.taken_at ?? first.added_at;
    const places = [...new Set(g.photos.map(photoPlace).filter(Boolean) as string[])];
    const hm = localParts(t, first.taken_at != null ? first.offset_min : undefined).hm;
    push(g.date, { kind: 'photos', key: `photos-${first.id}`, time: t, hm, photos: g.photos, area: g.area, places });
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
      answer: lastAnswer ? stripMarkdown(textOf(blocksOf(lastAnswer.content_json))) : '',
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
