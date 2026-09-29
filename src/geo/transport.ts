export type Transport = 'walk' | 'transit' | 'flight';

export const TRANSPORT_LABEL: Record<Transport, string> = { walk: '步行', transit: '乘车', flight: '飞行' };

export function inferTransport(distanceKm: number, hours: number): Transport {
  const speed = hours > 0 ? distanceKm / hours : Infinity;
  if (distanceKm > 150 && speed > 180) return 'flight';
  if (distanceKm < 1.5 || speed < 6) return 'walk';
  return 'transit';
}
