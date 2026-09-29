import type { LatLng } from './distance';

const A = 6378245.0;
const EE = 0.00669342162296594323;

// [north, west, south, east] boxes covering mainland China minus neighbours
const INCLUDE = [
  [49.2204, 79.4462, 42.8899, 96.33],
  [54.1415, 109.6872, 39.3742, 135.0002],
  [42.8899, 73.1246, 29.5297, 124.143255],
  [29.5297, 82.9684, 26.7186, 97.0352],
  [29.5297, 97.0253, 20.414096, 124.367395],
  [20.414096, 107.975793, 17.871542, 111.744104],
];
// Taiwan, Hong Kong and Macau keep WGS-84 on Apple Maps; the rest are border countries
const EXCLUDE = [
  [25.398623, 119.921265, 21.785006, 122.497559],
  [22.57, 113.82, 22.13, 114.44],
  [22.22, 113.52, 22.1, 113.6],
  [22.284, 101.8652, 20.0988, 106.665],
  [21.5422, 106.4525, 20.4878, 108.051],
  [55.8175, 109.0323, 50.3257, 119.127],
  [55.8175, 127.4568, 49.5574, 137.0227],
  [44.8922, 131.2662, 42.5692, 137.0227],
];

const inBox = ({ lat, lng }: LatLng, [n, w, s, e]: number[]) => lat <= n && lat >= s && lng >= w && lng <= e;

export function inMainlandChina(p: LatLng) {
  return INCLUDE.some((b) => inBox(p, b)) && !EXCLUDE.some((b) => inBox(p, b));
}

function tLat(x: number, y: number) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
}

function tLng(x: number, y: number) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
}

export function wgs84ToGcj02(p: LatLng): LatLng {
  if (!inMainlandChina(p)) return p;
  let dLat = tLat(p.lng - 105, p.lat - 35);
  let dLng = tLng(p.lng - 105, p.lat - 35);
  const radLat = (p.lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

export type TileSource = 'amap' | 'osm';

// AMap tiles cover mainland China but use GCJ-02 and are blank abroad; elsewhere use OpenStreetMap (WGS-84)
export function chooseTiles(points: LatLng[]): TileSource {
  return points.some(inMainlandChina) ? 'amap' : 'osm';
}

// Photo GPS is WGS-84; shift into GCJ-02 only when drawing on AMap tiles
export function toTileCoord(p: LatLng, tiles: TileSource): LatLng {
  return tiles === 'amap' ? wgs84ToGcj02(p) : { lat: p.lat, lng: p.lng };
}
