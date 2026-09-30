import type { ParsedExif } from './exif';
import type { Photo } from '@/db/types';
import { lightingText } from '@/geo/lighting';
import type { Messages } from '@/i18n';
import { photoAnalysis } from '@/trip/derive';
import { formatDateDots, localParts } from '@/utils/time';

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

// "挪威 · 奥斯陆": country and city from the geocoder, else from the photo analysis; null when neither knows
export function photoArea(p: Photo) {
  // Skip parsing the analysis when the geocoder already knows both
  const a = p.country && p.city ? null : photoAnalysis(p);
  const country = p.country ?? a?.country;
  const city = p.city ?? a?.city ?? p.region ?? a?.region;
  const parts = [country, city].filter(Boolean) as string[];
  return parts.length ? [...new Set(parts)].join(' · ') : null;
}

// Where the photo was taken, for a one-line label; null when there's no position at all
export function locationLabel(p: Photo, t: Messages) {
  if (p.lat == null || p.lng == null) return null;
  const name = photoPlace(p) ?? photoArea(p) ?? formatCoord(p.lat, p.lng);
  return p.loc_estimated ? t.photo.about(name) : name;
}

function exposure(s: number) {
  return s >= 1 ? `${Math.round(s * 10) / 10}s` : `1/${Math.round(1 / s)}s`;
}

// "60mm · 1/2336s · f/2 · ISO 50", focal length as its 35 mm equivalent when known
export function cameraSummary(ex: ParsedExif, t: Messages) {
  const focal = ex.focal35 ?? ex.focalLength;
  return [
    focal ? `${Math.round(focal)}mm` : null,
    ex.exposureTime ? exposure(ex.exposureTime) : null,
    ex.fNumber ? `f/${Math.round(ex.fNumber * 10) / 10}` : null,
    ex.iso ? `ISO ${Math.round(ex.iso)}` : null,
    ex.exposureBias ? `${ex.exposureBias > 0 ? '+' : ''}${Math.round(ex.exposureBias * 10) / 10} EV` : null,
    ex.flash ? t.photo.flash : null,
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

function focalDetail(ex: ParsedExif, t: Messages) {
  if (!ex.focalLength) return ex.focal35 ? t.photo.focal35(Math.round(ex.focal35)) : null;
  const real = `${Math.round(ex.focalLength * 100) / 100}mm`;
  return ex.focal35 ? t.photo.focalWith35(real, Math.round(ex.focal35)) : real;
}

export type Detail = { label: string; value: string };

export function photoDetails(p: Photo, t: Messages): Detail[] {
  const l = t.photo;
  const ex = photoExif(p);
  const a = photoAnalysis(p);
  const out: Detail[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) out.push({ label, value });
  };
  if (p.taken_at != null) {
    const d = localParts(p.taken_at, p.offset_min);
    const off = p.offset_min;
    const tz = `UTC${off >= 0 ? '+' : '-'}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? `:${String(Math.abs(off) % 60).padStart(2, '0')}` : ''}`;
    add(l.takenAt, `${formatDateDots(d.date)} ${d.hm} (${tz})`);
  } else {
    add(l.takenAt, l.noTime);
  }
  add(l.place, photoPlace(p));
  add(l.area, [p.country ?? a?.country, p.region ?? a?.region, p.city ?? a?.city].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · '));
  if (p.lat != null && p.lng != null) add(l.coords, `${formatCoord(p.lat, p.lng)}${p.loc_estimated ? l.estimated : ''}`);
  else add(l.coords, l.noCoords);
  // Cameras write 0 m when they had no GPS fix, so only trust altitude alongside a real position
  if (p.altitude != null && p.lat != null && !p.loc_estimated) add(l.altitude, `${Math.round(p.altitude)} m`);
  add(l.camera, cameraName(ex));
  add(l.lens, ex.lens);
  add(l.focal, focalDetail(ex, t));
  add(l.settings, cameraSummary({ ...ex, focalLength: undefined, focal35: undefined }, t));
  add(l.light, p.lighting_tag ? lightingText(p.lighting_tag, t) : a?.light);
  add(l.scene, a?.scene);
  add(l.subjects, a?.subjects?.join(t.common.listSep));
  add(l.mood, a?.mood);
  add(l.size, p.width && p.height ? `${p.width} × ${p.height}` : null);
  return out;
}
