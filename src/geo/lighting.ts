import { getPosition } from 'suncalc';

import type { ParsedExif } from '@/photos/exif';

function sunAltitudeDeg(ms: number, lat: number, lng: number) {
  // suncalc 2.x returns apparent altitude in degrees
  return getPosition(new Date(ms), lat, lng).altitude;
}

// Scene brightness as EV at ISO 100, from the exposure the camera actually chose
function ev100(exif: ParsedExif) {
  const { exposureTime: t, fNumber: n, iso } = exif;
  if (!t || !n || !iso) return undefined;
  return Math.log2((n * n) / t) - Math.log2(iso / 100);
}

// Combine sun position with EXIF exposure hints into a short Chinese tag
export function describeLighting(takenAt: number | null, lat: number | null, lng: number | null, exif: ParsedExif): string {
  const alt = takenAt != null && lat != null && lng != null ? sunAltitudeDeg(takenAt, lat, lng) : null;
  // Prefer the exposure triangle: some phones write BrightnessValue 0 as a placeholder
  const ev = ev100(exif);
  const dim = ev !== undefined ? ev < 7 : exif.brightness !== undefined ? exif.brightness < 1 : (exif.iso ?? 0) >= 1600;
  let tag: string;
  // EV 12+ only happens outdoors in daylight
  if (alt === null) tag = dim ? '弱光' : ev !== undefined && ev >= 12 ? '日光' : '';
  else if (alt < -6) tag = '夜景';
  else if (alt < -4) tag = '蓝调时刻';
  else if (alt < 6) tag = '黄金时刻';
  else if (dim) tag = '室内或阴天';
  else if (alt > 50) tag = '正午强光';
  else tag = '日光';
  if (exif.flash) tag = tag ? `${tag} · 闪光` : '闪光';
  return tag;
}
