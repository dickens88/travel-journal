export type Transport = 'walk' | 'transit' | 'flight';

export function inferTransport(distanceKm: number, hours: number): Transport {
  const speed = hours > 0 ? distanceKm / hours : Infinity;
  if (distanceKm > 150 && speed > 180) return 'flight';
  if (distanceKm < 1.5 || speed < 6) return 'walk';
  return 'transit';
}
