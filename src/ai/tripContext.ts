import { blocksOf, isToolResultTurn, textOf } from './chatContent';
import type { ChatRow, DayWeather, Note, Photo, Trip } from '@/db/types';
import type { Stop } from '@/geo/cluster';
import { TRANSPORT_LABEL } from '@/geo/transport';
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

export function buildTripContext(trip: Trip, photos: Photo[], stops: Stop[], days: DayWeather[], notes: Note[]) {
  const lines: string[] = [];
  lines.push(`旅行名称：${trip.title}`);
  lines.push(`日期：${trip.start_date} 起${trip.end_date ? `，${trip.end_date} 结束` : '，旅行还在进行中'}`);

  if (days.length) {
    lines.push('', '每日天气：');
    for (const d of days) lines.push(`- ${d.date} ${weatherLabel(d.code).label} ${Math.round(d.tmax)}°/${Math.round(d.tmin)}°`);
  }

  if (stops.length) {
    lines.push('', '停留点（按时间顺序，根据照片定位聚合）：');
    stops.forEach((s, i) => {
      const next = s.toNext ? `；之后${TRANSPORT_LABEL[s.toNext.transport]} ${s.toNext.km.toFixed(1)} km 到下一站` : '';
      const end = localParts(s.end, s.offsetMin).hm;
      lines.push(`${i + 1}. ${fmtLocal(s.start, s.offsetMin)}–${end} ${s.placeName ?? '未知地点'}，${s.photoIds.length} 张照片${next}`);
    });
  }

  if (photos.length) {
    lines.push('', '照片（id｜当地时间｜地点｜光线｜内容）：');
    for (const p of photos) {
      const a = photoAnalysis(p);
      const time = p.taken_at != null ? fmtLocal(p.taken_at, p.offset_min) : '时间未知';
      const place = photoPlace(p) || '地点未知';
      const content = a ? `${a.scene}；${a.caption}；氛围：${a.mood}；光线：${a.light}` : '尚未识别';
      lines.push(`${p.id}｜${time}｜${place}${p.loc_estimated ? '（估算）' : ''}｜${p.lighting_tag || '-'}｜${content}`);
    }
  }

  if (notes.length) {
    lines.push('', '随手记：');
    for (const n of notes) {
      lines.push(`- ${fmtLocal(n.created_at)}${n.place_name ? ` @${n.place_name}` : ''}：${n.text}`);
    }
  }
  return lines.join('\n');
}

export function buildChatTranscript(rows: ChatRow[]) {
  const lines: string[] = [];
  for (const r of rows) {
    const blocks = blocksOf(r.content_json);
    if (isToolResultTurn(blocks)) continue;
    const text = textOf(blocks);
    if (!text) continue;
    const photo = blocks.find((b) => b.type === 'trip_photo');
    const when = fmtLocal(r.created_at);
    lines.push(`[${when}] ${r.role === 'user' ? '我' : '搭子'}${photo ? `（附照片 ${photo.photo_id}）` : ''}：${text}`);
  }
  return lines.join('\n');
}
