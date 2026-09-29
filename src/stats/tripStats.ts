import { haversineKm } from '@/geo/distance';
import type { Stop } from '@/geo/cluster';
import { localParts } from '@/utils/time';

export type StatPhoto = {
  taken_at: number | null;
  offset_min: number;
  altitude: number | null;
  city: string | null;
};

export type TripStats = {
  days: number;
  cities: number;
  km: number;
  photos: number;
  maxAltitude: number | null;
  earliest: string | null;
};

export function computeTripStats(photos: StatPhoto[], stops: Stop[]): TripStats {
  const dates = new Set<string>();
  let earliestMin: number | null = null;
  let earliest: string | null = null;
  let maxAltitude: number | null = null;
  const cities = new Set<string>();
  for (const p of photos) {
    if (p.city) cities.add(p.city);
    if (p.altitude != null && (maxAltitude === null || p.altitude > maxAltitude)) maxAltitude = p.altitude;
    if (p.taken_at == null) continue;
    const parts = localParts(p.taken_at, p.offset_min);
    dates.add(parts.date);
    if (earliestMin === null || parts.minutesOfDay < earliestMin) {
      earliestMin = parts.minutesOfDay;
      earliest = parts.hm;
    }
  }
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += haversineKm(stops[i - 1], stops[i]);
  return {
    days: dates.size,
    cities: cities.size,
    km: Math.round(km),
    photos: photos.length,
    maxAltitude: maxAltitude === null ? null : Math.round(maxAltitude),
    earliest,
  };
}
