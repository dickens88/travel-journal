import { describe, expect, it } from '@jest/globals';

import { clusterStops } from '@/geo/cluster';
import { chooseTiles, inMainlandChina, toTileCoord, wgs84ToGcj02 } from '@/geo/coord';
import { haversineKm } from '@/geo/distance';
import { interpolateMissing } from '@/geo/interpolate';
import { describeLighting } from '@/geo/lighting';
import { inferTransport } from '@/geo/transport';
import { parseExif, parseOffset } from '@/photos/exif';
import { computeTripStats } from '@/stats/tripStats';
import { formatDayLabel, localParts } from '@/utils/time';
import { buildWeatherUrl, parseDaily, weatherLabel } from '@/weather/openMeteo';

const JST = 540;
const at = (iso: string) => Date.parse(iso);

describe('time', () => {
  it('formats local parts at an offset', () => {
    expect(localParts(at('2025-11-11T20:48:00Z'), JST)).toMatchObject({ date: '2025-11-12', hm: '05:48' });
  });
  it('labels a day', () => {
    expect(formatDayLabel('2025-11-12')).toBe('11月12日 周三');
  });
});

describe('exif', () => {
  it('parses iOS nested exif with offset and GPS refs', () => {
    const r = parseExif(
      {
        '{Exif}': { DateTimeOriginal: '2025:11:12 05:48:10', OffsetTimeOriginal: '+09:00', ExposureTime: 0.008, FNumber: 1.8, ISOSpeedRatings: [320], BrightnessValue: 3.2, Flash: 16 },
        '{GPS}': { Latitude: 34.967, LatitudeRef: 'N', Longitude: 135.772, LongitudeRef: 'E', Altitude: 233.4, AltitudeRef: 0 },
      },
      () => 0,
    );
    expect(r.takenAt).toBe(at('2025-11-11T20:48:10Z'));
    expect(r.offsetMin).toBe(JST);
    expect(r).toMatchObject({ lat: 34.967, lng: 135.772, altitude: 233.4, iso: 320, fNumber: 1.8, flash: false });
  });
  it('handles flat keys, west/south refs and fallback offset', () => {
    const r = parseExif(
      { DateTimeOriginal: '2026:07:03 10:00:00', GPSLatitude: 12.5, GPSLatitudeRef: 'S', GPSLongitude: 70, GPSLongitudeRef: 'W', Flash: 1 },
      () => 480,
    );
    expect(r.takenAt).toBe(at('2026-07-03T02:00:00Z'));
    expect(r).toMatchObject({ lat: -12.5, lng: -70, flash: true });
  });
  it('ignores 0,0 GPS and bad offsets', () => {
    expect(parseExif({ '{GPS}': { Latitude: 0, Longitude: 0 } }, () => 0).lat).toBeUndefined();
    expect(parseOffset('nope')).toBeUndefined();
    expect(parseOffset('-05:30')).toBe(-330);
  });
});

describe('coord', () => {
  it('shifts mainland China points by a few hundred metres', () => {
    const p = { lat: 39.9087, lng: 116.3975 };
    const g = wgs84ToGcj02(p);
    const km = haversineKm(p, g);
    expect(km).toBeGreaterThan(0.1);
    expect(km).toBeLessThan(0.8);
  });
  it('leaves Kyoto and Hong Kong untouched', () => {
    expect(wgs84ToGcj02({ lat: 35.0, lng: 135.77 })).toEqual({ lat: 35.0, lng: 135.77 });
    expect(inMainlandChina({ lat: 22.3, lng: 114.17 })).toBe(false);
  });
});

describe('interpolate', () => {
  it('interpolates between neighbours and copies a close single neighbour', () => {
    const r = interpolateMissing([
      { id: 'a', takenAt: 0, lat: 10, lng: 20 },
      { id: 'b', takenAt: 3600_000, lat: null, lng: null },
      { id: 'c', takenAt: 7200_000, lat: 12, lng: 22 },
      { id: 'd', takenAt: 8200_000, lat: null, lng: null },
      { id: 'e', takenAt: 90_000_000, lat: null, lng: null },
    ]);
    expect(r.get('b')).toEqual({ lat: 11, lng: 21 });
    expect(r.get('d')).toEqual({ lat: 12, lng: 22 });
    expect(r.has('e')).toBe(false);
  });
});

describe('cluster & transport', () => {
  it('infers transport modes', () => {
    expect(inferTransport(0.8, 0.3)).toBe('walk');
    expect(inferTransport(6.4, 0.4)).toBe('transit');
    expect(inferTransport(1300, 3)).toBe('flight');
  });
  it('groups nearby photos into stops and links them', () => {
    const base = at('2025-11-11T21:00:00Z');
    const stops = clusterStops([
      { id: '1', takenAt: base, offsetMin: JST, lat: 34.967, lng: 135.772, placeName: '伏见稻荷大社' },
      { id: '2', takenAt: base + 20 * 60_000, offsetMin: JST, lat: 34.968, lng: 135.773, placeName: '伏见稻荷大社' },
      { id: '3', takenAt: base + 40 * 60_000, offsetMin: JST, lat: 34.995, lng: 135.785, placeName: '清水寺' },
    ]);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toMatchObject({ date: '2025-11-12', placeName: '伏见稻荷大社', photoIds: ['1', '2'] });
    expect(stops[0].toNext?.transport).toBe('transit');
  });
});

describe('lighting', () => {
  it('tags night, golden hour and daylight in Kyoto', () => {
    expect(describeLighting(at('2025-11-12T12:00:00Z'), 35, 135.77, {})).toBe('夜景');
    expect(describeLighting(at('2025-11-11T21:40:00Z'), 35, 135.77, {})).toBe('黄金时刻');
    expect(describeLighting(at('2025-11-12T03:00:00Z'), 35, 135.77, { brightness: 7 })).toBe('日光');
    expect(describeLighting(null, null, null, { iso: 3200, flash: true })).toBe('弱光 · 闪光');
  });
});

describe('stats', () => {
  it('summarises days, cities, distance, altitude and earliest time', () => {
    const t = at('2025-11-11T20:48:00Z');
    const photos = [
      { taken_at: t, offset_min: JST, altitude: 233, city: '京都市' },
      { taken_at: t + 86_400_000, offset_min: JST, altitude: 50, city: '宇治市' },
      { taken_at: null, offset_min: 0, altitude: null, city: null },
    ];
    const stops = clusterStops([
      { id: 'a', takenAt: t, offsetMin: JST, lat: 34.967, lng: 135.772 },
      { id: 'b', takenAt: t + 86_400_000, offsetMin: JST, lat: 34.889, lng: 135.807 },
    ]);
    expect(computeTripStats(photos, stops)).toEqual({ days: 2, cities: 2, km: 9, photos: 3, maxAltitude: 233, earliest: '05:48' });
  });
});

describe('open-meteo', () => {
  it('picks archive for old dates and forecast for recent ones', () => {
    expect(buildWeatherUrl(35, 135.77, '2025-11-12', '2025-11-16', '2026-09-29')).toContain('archive-api');
    expect(buildWeatherUrl(35, 135.77, '2026-09-26', '2026-09-28', '2026-09-29')).toContain('api.open-meteo.com/v1/forecast');
  });
  it('parses daily rows and maps codes', () => {
    const rows = parseDaily({ daily: { time: ['2025-11-12', '2025-11-13'], weather_code: [0, 61], temperature_2m_max: [18, 16], temperature_2m_min: [9, null] } });
    expect(rows).toEqual([{ date: '2025-11-12', code: 0, tmax: 18, tmin: 9 }]);
    expect(weatherLabel(61).label).toBe('雨');
  });
});

describe('android exif', () => {
  it('reads rational strings and DMS triples from ExifInterface', () => {
    const ex = parseExif(
      {
        DateTimeOriginal: '2025:11:12 05:48:10',
        OffsetTimeOriginal: '+09:00',
        GPSLatitude: '34/1,58/1,1714/100',
        GPSLatitudeRef: 'N',
        GPSLongitude: '135/1,46/1,2172/100',
        GPSLongitudeRef: 'E',
        ExposureTime: '1/120',
        FNumber: '18/10',
        ISOSpeedRatings: '320',
      },
      () => 0,
    );
    expect(ex.takenAt).toBe(Date.parse('2025-11-11T20:48:10Z'));
    expect(ex.lat).toBeCloseTo(34.9714, 3);
    expect(ex.lng).toBeCloseTo(135.7727, 3);
    expect(ex.exposureTime).toBeCloseTo(1 / 120);
    expect(ex.fNumber).toBeCloseTo(1.8);
    expect(ex.iso).toBe(320);
  });
});

describe('map tiles', () => {
  it('uses AMap with GCJ-02 shift inside mainland China, OSM elsewhere, and both for mixed trips', () => {
    const beijing = { lat: 39.9087, lng: 116.3975 };
    const kyoto = { lat: 34.9671, lng: 135.7727 };
    expect(chooseTiles([kyoto])).toBe('osm');
    expect(chooseTiles([beijing])).toBe('amap');
    expect(chooseTiles([kyoto, beijing])).toBe('mixed');
    expect(toTileCoord(kyoto, 'amap')).toEqual(kyoto);
    expect(toTileCoord(kyoto, 'mixed')).toEqual(kyoto);
    expect(toTileCoord(beijing, 'mixed')).toEqual(toTileCoord(beijing, 'amap'));
    const shifted = toTileCoord(beijing, 'amap');
    expect(shifted.lat).not.toBeCloseTo(beijing.lat, 4);
    expect(toTileCoord(beijing, 'osm')).toEqual(beijing);
  });
});
