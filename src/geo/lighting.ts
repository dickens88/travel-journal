import { getPosition } from 'suncalc';

import type { ParsedExif } from '@/photos/exif';

function sunAltitudeDeg(ms: number, lat: number, lng: number) {
  // suncalc 2.x returns apparent altitude in degrees
  return getPosition(new Date(ms), lat, lng).altitude;
}

// Combine sun position with EXIF exposure hints into a short Chinese tag
export function describeLighting(takenAt: number | null, lat: number | null, lng: number | null, exif: ParsedExif): string {
  const alt = takenAt != null && lat != null && lng != null ? sunAltitudeDeg(takenAt, lat, lng) : null;
  const dim = exif.brightness !== undefined ? exif.brightness < 1 : (exif.iso ?? 0) >= 1600;
  let tag: string;
  if (alt === null) tag = dim ? '弱光' : '';
  else if (alt < -6) tag = '夜景';
  else if (alt < -4) tag = '蓝调时刻';
  else if (alt < 6) tag = '黄金时刻';
  else if (dim) tag = '室内或阴天';
  else if (alt > 50) tag = '正午强光';
  else tag = '日光';
  if (exif.flash) tag = tag ? `${tag} · 闪光` : '闪光';
  return tag;
}
