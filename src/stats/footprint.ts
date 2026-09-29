import { localParts } from '@/utils/time';

export type FootPhoto = {
  trip_id: string;
  taken_at: number | null;
  offset_min: number;
  lat: number | null;
  lng: number | null;
  country: string | null;
  region: string | null;
  city: string | null;
};

type Place = { country: string; region: string; cities: string[]; firstDate: string | null; lat: number; lng: number };

export type Footprint = {
  countries: string[];
  regions: Place[];
  cityCount: number;
  travelDays: number;
  cityPoints: { key: string; name: string; lat: number; lng: number }[];
};

// Aggregate every located photo across trips into countries, regions and cities
export function computeFootprint(photos: FootPhoto[]): Footprint {
  const regions = new Map<string, Place & { n: number; citySet: Set<string> }>();
  const cities = new Map<string, { name: string; lat: number; lng: number; n: number }>();
  const tripDays = new Set<string>();
  for (const p of photos) {
    if (p.lat == null || p.lng == null) continue;
    const date = p.taken_at != null ? localParts(p.taken_at, p.offset_min).date : null;
    if (date) tripDays.add(`${p.trip_id}|${date}`);
    const country = p.country ?? '未知';
    const region = p.region ?? p.city ?? '未知';
    const rKey = `${country}|${region}`;
    let r = regions.get(rKey);
    if (!r) {
      r = { country, region, cities: [], firstDate: date, lat: 0, lng: 0, n: 0, citySet: new Set() };
      regions.set(rKey, r);
    }
    r.lat += p.lat;
    r.lng += p.lng;
    r.n += 1;
    if (date && (!r.firstDate || date < r.firstDate)) r.firstDate = date;
    if (p.city) {
      r.citySet.add(p.city);
      const cKey = `${rKey}|${p.city}`;
      const c = cities.get(cKey) ?? { name: p.city, lat: 0, lng: 0, n: 0 };
      c.lat += p.lat;
      c.lng += p.lng;
      c.n += 1;
      cities.set(cKey, c);
    }
  }
  const regionList = [...regions.values()]
    .map(({ n, citySet, ...r }) => ({ ...r, cities: [...citySet], lat: r.lat / n, lng: r.lng / n }))
    .sort((a, b) => (a.firstDate ?? '').localeCompare(b.firstDate ?? ''));
  return {
    countries: [...new Set(regionList.map((r) => r.country))],
    regions: regionList,
    cityCount: cities.size,
    travelDays: tripDays.size,
    cityPoints: [...cities.entries()].map(([key, c]) => ({ key, name: c.name, lat: c.lat / c.n, lng: c.lng / c.n })),
  };
}
