import type { ParsedExif } from './exif';
import type { Photo } from '@/db/types';
import { photoAnalysis } from '@/trip/derive';
import { localParts } from '@/utils/time';

// "31.2304°N 121.4737°E"
export function formatCoord(lat: number, lng: number) {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} ${f(lng, 'E', 'W')}`;
}

export function photoExif(p: Photo): ParsedExif {
  try {
    return p.exif_json ? JSON.parse(p.exif_json) : {};
  } catch {
    return {};
  }
}

// Geocoded name first, then what the photo analysis recognised
export function photoPlace(p: Photo) {
  const a = photoAnalysis(p);
  return p.place_name || a?.place || a?.city || null;
}

// Where the photo was taken, for a one-line label; null when there's no position at all
export function locationLabel(p: Photo) {
  if (p.lat == null || p.lng == null) return null;
  const name = photoPlace(p) ?? formatCoord(p.lat, p.lng);
  return p.loc_estimated ? `约 ${name}` : name;
}

function exposure(s: number) {
  return s >= 1 ? `${Math.round(s * 10) / 10}s` : `1/${Math.round(1 / s)}s`;
}

// "60mm · 1/2336s · f/2 · ISO 50", focal length as its 35 mm equivalent when known
export function cameraSummary(ex: ParsedExif) {
  const focal = ex.focal35 ?? ex.focalLength;
  return [
    focal ? `${Math.round(focal)}mm` : null,
    ex.exposureTime ? exposure(ex.exposureTime) : null,
    ex.fNumber ? `f/${Math.round(ex.fNumber * 10) / 10}` : null,
    ex.iso ? `ISO ${Math.round(ex.iso)}` : null,
    ex.exposureBias ? `${ex.exposureBias > 0 ? '+' : ''}${Math.round(ex.exposureBias * 10) / 10} EV` : null,
    ex.flash ? '闪光' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// "HUAWEI Mate 60 Pro"; many models already start with the brand
export function cameraName(ex: ParsedExif) {
  if (!ex.model) return ex.make ?? null;
  if (!ex.make || ex.model.toLowerCase().startsWith(ex.make.toLowerCase())) return ex.model;
  return `${ex.make} ${ex.model}`;
}

function focalDetail(ex: ParsedExif) {
  if (!ex.focalLength) return ex.focal35 ? `等效 ${Math.round(ex.focal35)}mm` : null;
  const real = `${Math.round(ex.focalLength * 100) / 100}mm`;
  return ex.focal35 ? `${real}（等效 ${Math.round(ex.focal35)}mm）` : real;
}

export type Detail = { label: string; value: string };

export function photoDetails(p: Photo): Detail[] {
  const ex = photoExif(p);
  const a = photoAnalysis(p);
  const out: Detail[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) out.push({ label, value });
  };
  if (p.taken_at != null) {
    const t = localParts(p.taken_at, p.offset_min);
    const off = p.offset_min;
    const tz = `UTC${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, '0')}` : ''}`;
    add('拍摄时间', `${t.date.replaceAll('-', '.')} ${t.hm}（${tz}）`);
  } else {
    add('拍摄时间', '照片里没有记录');
  }
  add('地点', photoPlace(p));
  add('地区', [p.country ?? a?.country, p.region ?? a?.region, p.city ?? a?.city].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · '));
  if (p.lat != null && p.lng != null) add('坐标', `${formatCoord(p.lat, p.lng)}${p.loc_estimated ? '（按前后照片推算）' : ''}`);
  else add('坐标', '照片里没有位置信息');
  // Cameras write 0 m when they had no GPS fix, so only trust altitude alongside a real position
  if (p.altitude != null && p.lat != null && !p.loc_estimated) add('海拔', `${Math.round(p.altitude)} m`);
  add('相机', cameraName(ex));
  add('镜头', ex.lens);
  add('焦距', focalDetail(ex));
  add('参数', cameraSummary({ ...ex, focalLength: undefined, focal35: undefined }));
  add('光线', p.lighting_tag || a?.light);
  add('画面', a?.scene);
  add('主体', a?.subjects?.join('、'));
  add('氛围', a?.mood);
  add('存档尺寸', p.width && p.height ? `${p.width} × ${p.height}` : null);
  return out;
}
