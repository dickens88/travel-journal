export type ParsedExif = {
  takenAt?: number;
  offsetMin?: number;
  lat?: number;
  lng?: number;
  altitude?: number;
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  brightness?: number;
  flash?: boolean;
};

type Dict = Record<string, any>;

// Android ExifInterface returns rationals as strings like "1/120"
function num(v: unknown): number | undefined {
  if (Array.isArray(v)) return num(v[0]);
  if (typeof v === 'string') {
    const r = /^\s*(-?[\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(v);
    if (r) return Number(r[2]) ? Number(r[1]) / Number(r[2]) : undefined;
  }
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

// Decimal degrees, or Android's "deg/1,min/1,sec/100" rational triple
function coord(v: unknown): number | undefined {
  if (typeof v === 'string' && v.includes(',')) {
    const [d, m = 0, s = 0] = v.split(',').map((p) => num(p) ?? NaN);
    const out = d + m / 60 + s / 3600;
    return Number.isFinite(out) ? out : undefined;
  }
  return num(v);
}

// "+09:00" -> 540
export function parseOffset(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}

// "2025:11:12 05:48:10" -> wall-clock ms as if UTC
function parseExifDate(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, se);
}

// iOS nests tags under "{Exif}" / "{GPS}"; Android and some pickers use flat keys
export function parseExif(raw: Dict | null | undefined, fallbackOffsetMin: (wallMs: number) => number): ParsedExif {
  if (!raw) return {};
  const exif: Dict = { ...raw, ...(raw['{Exif}'] ?? {}) };
  const gps: Dict = raw['{GPS}'] ?? {};
  const out: ParsedExif = {};

  const wall = parseExifDate(exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime);
  if (wall !== undefined) {
    const offset = parseOffset(exif.OffsetTimeOriginal ?? exif.OffsetTime) ?? fallbackOffsetMin(wall);
    out.offsetMin = offset;
    out.takenAt = wall - offset * 60_000;
  }

  let lat = coord(gps.Latitude ?? exif.GPSLatitude);
  let lng = coord(gps.Longitude ?? exif.GPSLongitude);
  const latRef = gps.LatitudeRef ?? exif.GPSLatitudeRef;
  const lngRef = gps.LongitudeRef ?? exif.GPSLongitudeRef;
  if (lat !== undefined && lng !== undefined && !(lat === 0 && lng === 0)) {
    if (latRef === 'S') lat = -Math.abs(lat);
    if (lngRef === 'W') lng = -Math.abs(lng);
    out.lat = lat;
    out.lng = lng;
  }
  const alt = num(gps.Altitude ?? exif.GPSAltitude);
  if (alt !== undefined) {
    const below = Number(gps.AltitudeRef ?? exif.GPSAltitudeRef) === 1;
    out.altitude = below ? -alt : alt;
  }

  out.exposureTime = num(exif.ExposureTime);
  out.fNumber = num(exif.FNumber);
  out.iso = num(exif.ISOSpeedRatings ?? exif.PhotographicSensitivity ?? exif.ISO);
  out.brightness = num(exif.BrightnessValue);
  const flash = num(exif.Flash);
  if (flash !== undefined) out.flash = (flash & 1) === 1;
  return out;
}
