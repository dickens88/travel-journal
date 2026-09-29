import { describe, expect, it } from '@jest/globals';

import { computeFootprint, type FootPhoto } from '@/stats/footprint';

const p = (trip: string, iso: string, country: string, region: string, city: string, lat: number, lng: number): FootPhoto => ({
  trip_id: trip, taken_at: Date.parse(iso), offset_min: 480, lat, lng, country, region, city,
});

describe('computeFootprint', () => {
  it('counts countries, regions, cities and travel days across trips', () => {
    const f = computeFootprint([
      p('a', '2025-11-12T00:00:00Z', '日本', '京都府', '京都市', 35.0, 135.77),
      p('a', '2025-11-12T02:00:00Z', '日本', '京都府', '宇治市', 34.89, 135.8),
      p('a', '2025-11-13T02:00:00Z', '日本', '大阪府', '大阪市', 34.69, 135.5),
      p('b', '2026-07-03T02:00:00Z', '中国', '云南省', '大理市', 25.6, 100.27),
      { ...p('b', '2026-07-04T02:00:00Z', '中国', '云南省', '大理市', 0, 0), lat: null, lng: null },
    ]);
    expect(f.countries).toEqual(['日本', '中国']);
    expect(f.regions.map((r) => r.region)).toEqual(['京都府', '大阪府', '云南省']);
    expect(f.regions[0].cities).toEqual(['京都市', '宇治市']);
    expect(f.cityCount).toBe(4);
    expect(f.travelDays).toBe(3);
  });
});
