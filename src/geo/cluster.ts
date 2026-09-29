import { haversineKm } from './distance';
import { inferTransport, type Transport } from './transport';
import { localParts } from '@/utils/time';

export type ClusterPhoto = {
  id: string;
  takenAt: number;
  offsetMin: number;
  lat: number;
  lng: number;
  placeName?: string | null;
};

export type Stop = {
  id: string;
  date: string;
  lat: number;
  lng: number;
  start: number;
  end: number;
  offsetMin: number;
  placeName: string | null;
  photoIds: string[];
  toNext?: { transport: Transport; km: number; minutes: number };
};

const RADIUS_KM = 0.6;
const MAX_GAP_MS = 3 * 3600_000;

function mostCommon(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of counts) if (c > n) { best = k; n = c; }
  return best;
}

// Group time-ordered photos into stops: same place, no long gap, same local day
export function clusterStops(photos: ClusterPhoto[]): Stop[] {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  const groups: ClusterPhoto[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    const anchor = g?.[0];
    const last = g?.[g.length - 1];
    if (
      g &&
      haversineKm(anchor, p) <= RADIUS_KM &&
      p.takenAt - last.takenAt <= MAX_GAP_MS &&
      localParts(p.takenAt, p.offsetMin).date === localParts(anchor.takenAt, anchor.offsetMin).date
    ) {
      g.push(p);
    } else {
      groups.push([p]);
    }
  }
  const stops: Stop[] = groups.map((g) => ({
    id: g[0].id,
    date: localParts(g[0].takenAt, g[0].offsetMin).date,
    lat: g.reduce((s, p) => s + p.lat, 0) / g.length,
    lng: g.reduce((s, p) => s + p.lng, 0) / g.length,
    start: g[0].takenAt,
    end: g[g.length - 1].takenAt,
    offsetMin: g[0].offsetMin,
    placeName: mostCommon(g.map((p) => p.placeName)),
    photoIds: g.map((p) => p.id),
  }));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const km = haversineKm(a, b);
    const minutes = Math.max(0, (b.start - a.end) / 60_000);
    a.toNext = { transport: inferTransport(km, minutes / 60), km, minutes };
  }
  return stops;
}
