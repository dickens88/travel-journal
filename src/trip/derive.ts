import type { PhotoAnalysis } from '@/ai/schemas';
import { clusterStops, type Stop } from '@/geo/cluster';
import type { Photo } from '@/db/types';
import { computeTripStats } from '@/stats/tripStats';

export function stopsFromPhotos(photos: Photo[]): Stop[] {
  return clusterStops(
    photos
      .filter((p) => p.taken_at != null && p.lat != null && p.lng != null)
      .map((p) => ({ id: p.id, takenAt: p.taken_at!, offsetMin: p.offset_min, lat: p.lat!, lng: p.lng!, placeName: p.place_name })),
  );
}

export function deriveTrip(photos: Photo[]) {
  const stops = stopsFromPhotos(photos);
  return { stops, stats: computeTripStats(photos, stops) };
}

// Rows analysed by older app versions may lack newer fields
export function photoAnalysis(p: Photo): Partial<PhotoAnalysis> | null {
  if (!p.analysis_json) return null;
  try {
    return JSON.parse(p.analysis_json);
  } catch {
    return null;
  }
}
