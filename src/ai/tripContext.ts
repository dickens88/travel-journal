import { blocksOf, isToolResultTurn, textOf } from './chatContent';
import type { ChatRow, DayWeather, Note, Photo, Trip } from '@/db/types';
import type { Stop } from '@/geo/cluster';
import { lightingText } from '@/geo/lighting';
import type { Messages } from '@/i18n';
import { photoAnalysis } from '@/trip/derive';
import { localParts } from '@/utils/time';
import { weatherLabel } from '@/weather/openMeteo';

// "2025-11-12 14:30" in the given zone (device zone by default)
export function fmtLocal(ms: number, offset?: number) {
  const p = localParts(ms, offset);
  return `${p.date} ${p.hm}`;
}

export function photoPlace(p: Photo) {
  return [p.place_name, p.city].filter(Boolean).join('，');
}

export function buildTripContext(trip: Trip, photos: Photo[], stops: Stop[], days: DayWeather[], notes: Note[], t: Messages) {
  const c = t.ai.context;
  const lines: string[] = [];
  lines.push(c.trip(trip.title));
  lines.push(c.dates(trip.start_date, trip.end_date));

  if (days.length) {
    lines.push('', c.weather);
    for (const d of days) lines.push(`- ${d.date} ${weatherLabel(d.code, t).label} ${Math.round(d.tmax)}°/${Math.round(d.tmin)}°`);
  }

  if (stops.length) {
    lines.push('', c.stops);
    stops.forEach((s, i) => {
      const next = s.toNext ? c.toNext(t.transport[s.toNext.transport], s.toNext.km.toFixed(1)) : '';
      const time = `${fmtLocal(s.start, s.offsetMin)}–${localParts(s.end, s.offsetMin).hm}`;
      lines.push(c.stop(i + 1, time, s.placeName ?? t.common.unknownPlace, s.photoIds.length, next));
    });
  }

  if (photos.length) {
    lines.push('', c.photos);
    for (const p of photos) {
      const a = photoAnalysis(p);
      const time = p.taken_at != null ? fmtLocal(p.taken_at, p.offset_min) : c.timeUnknown;
      const place = photoPlace(p) || c.placeUnknown;
      const content = a ? c.analysis(a.scene ?? '', a.caption ?? '', a.mood ?? '', a.light ?? '') : c.notAnalyzed;
      const light = p.lighting_tag ? lightingText(p.lighting_tag, t) : '-';
      lines.push(`${p.id}｜${time}｜${place}${p.loc_estimated ? c.estimated : ''}｜${light}｜${content}`);
    }
  }

  if (notes.length) {
    lines.push('', c.notes);
    for (const n of notes) lines.push(c.note(fmtLocal(n.created_at), n.place_name, n.text));
  }
  return lines.join('\n');
}

export function buildChatTranscript(rows: ChatRow[], t: Messages) {
  const lines: string[] = [];
  for (const r of rows) {
    const blocks = blocksOf(r.content_json);
    if (isToolResultTurn(blocks)) continue;
    const text = textOf(blocks);
    if (!text) continue;
    const photo = blocks.find((b) => b.type === 'trip_photo');
    lines.push(t.ai.context.chatLine(fmtLocal(r.created_at), r.role === 'user', photo?.photo_id ?? null, text));
  }
  return lines.join('\n');
}
