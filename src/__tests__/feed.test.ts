import { describe, expect, it } from '@jest/globals';

import type { ChatRow, Note, Photo } from '@/db/types';
import { buildFeed } from '@/trip/feed';

const JST = 540;
const t0 = Date.parse('2025-11-11T20:48:00Z');

function photo(id: string, takenAt: number, batch: string): Photo {
  return {
    id, trip_id: 't', asset_id: null, file: `${id}.jpg`, width: 1, height: 1, taken_at: takenAt, offset_min: JST,
    lat: 35, lng: 135, loc_estimated: 0, altitude: null, place_name: '伏见稻荷大社', country: null, region: null, city: null,
    exif_json: null, lighting_tag: null, analysis_json: null, batch_id: batch, added_at: takenAt, journal_included_at: null,
  };
}

function chat(id: number, role: ChatRow['role'], content: unknown, createdAt: number): ChatRow {
  return { id, trip_id: 't', role, content_json: JSON.stringify(content), created_at: createdAt, journal_included_at: null };
}

describe('buildFeed', () => {
  it('groups photos by batch and day, and chats into sessions', () => {
    const notes: Note[] = [];
    const chats = [
      chat(1, 'user', [{ type: 'trip_photo', photo_id: 'p1' }, { type: 'text', text: '这些门为什么是红色的？' }], t0 + 60_000),
      chat(2, 'assistant', [{ type: 'server_tool_use', name: 'web_search' }, { type: 'text', text: '这是千本鸟居。' }], t0 + 70_000),
      chat(3, 'user', [{ type: 'text', text: '记一下：很累' }], t0 + 80_000),
      chat(4, 'assistant', [{ type: 'tool_use', name: 'save_note', input: { text: '很累' } }], t0 + 81_000),
      chat(5, 'user', [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }], t0 + 82_000),
      chat(6, 'assistant', [{ type: 'text', text: '记好了' }], t0 + 83_000),
      chat(7, 'user', [{ type: 'text', text: '明天呢？' }], t0 + 5 * 3600_000),
    ];
    const feed = buildFeed(
      [photo('p1', t0, 'b1'), photo('p2', t0 + 600_000, 'b1'), photo('p3', t0 + 86_400_000, 'b2')],
      notes,
      chats,
    );
    expect(feed.map((d) => d.date)).toEqual(['2025-11-13', '2025-11-12']);
    const day1 = feed[1].items;
    const photosItem = day1.find((i) => i.kind === 'photos');
    expect(photosItem && photosItem.kind === 'photos' && photosItem.photos).toHaveLength(2);
    const sessions = day1.filter((i) => i.kind === 'chat');
    expect(sessions).toHaveLength(2);
    const first = sessions.find((s) => s.kind === 'chat' && s.firstRowId === 1);
    expect(first).toMatchObject({ turns: 2, question: '这些门为什么是红色的？', answer: '记好了', usedSearch: true, savedNotes: 1, photoId: 'p1' });
  });

  it('splits one upload into cards by city, newest first, labelled with country and city', () => {
    const at = (id: string, minutes: number, city: string | null) => ({ ...photo(id, t0 + minutes * 60_000, 'b1'), country: city ? '日本' : null, city });
    const feed = buildFeed([at('a', 0, '京都市'), at('b', 10, '京都市'), at('c', 120, '大阪市'), at('d', 130, '京都市')], [], []);
    const cards = feed[0].items.flatMap((i) => (i.kind === 'photos' ? [{ area: i.area, ids: i.photos.map((p) => p.id) }] : []));
    expect(cards).toEqual([
      { area: '日本 · 京都市', ids: ['d'] },
      { area: '日本 · 大阪市', ids: ['c'] },
      { area: '日本 · 京都市', ids: ['a', 'b'] },
    ]);
  });

  it('splits photos with no known city when they are far apart', () => {
    const at = (id: string, minutes: number, lat: number) => ({ ...photo(id, t0 + minutes * 60_000, 'b1'), lat });
    const feed = buildFeed([at('a', 0, 35), at('b', 10, 35.01), at('c', 120, 36)], [], []);
    const cards = feed[0].items.flatMap((i) => (i.kind === 'photos' ? [i.photos.map((p) => p.id)] : []));
    expect(cards).toEqual([['c'], ['a', 'b']]);
  });
});
