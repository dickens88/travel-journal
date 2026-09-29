export type TimedPoint = { id: string; takenAt: number | null; lat: number | null; lng: number | null };

const MAX_GAP_BOTH = 6 * 3600_000;
const MAX_GAP_ONE = 2 * 3600_000;

// Estimate positions for photos without GPS from neighbours in time
export function interpolateMissing(points: TimedPoint[]): Map<string, { lat: number; lng: number }> {
  const timed = points.filter((p) => p.takenAt != null).sort((a, b) => a.takenAt! - b.takenAt!);
  const out = new Map<string, { lat: number; lng: number }>();
  for (let i = 0; i < timed.length; i++) {
    const p = timed[i];
    if (p.lat != null && p.lng != null) continue;
    let prev: TimedPoint | undefined;
    let next: TimedPoint | undefined;
    for (let j = i - 1; j >= 0; j--) if (timed[j].lat != null) { prev = timed[j]; break; }
    for (let j = i + 1; j < timed.length; j++) if (timed[j].lat != null) { next = timed[j]; break; }
    const t = p.takenAt!;
    const dPrev = prev ? t - prev.takenAt! : Infinity;
    const dNext = next ? next.takenAt! - t : Infinity;
    if (prev && next && dPrev + dNext <= MAX_GAP_BOTH) {
      const f = dPrev + dNext === 0 ? 0 : dPrev / (dPrev + dNext);
      out.set(p.id, { lat: prev.lat! + (next.lat! - prev.lat!) * f, lng: prev.lng! + (next.lng! - prev.lng!) * f });
    } else if (Math.min(dPrev, dNext) <= MAX_GAP_ONE) {
      const src = dPrev <= dNext ? prev! : next!;
      out.set(p.id, { lat: src.lat!, lng: src.lng! });
    }
  }
  return out;
}
