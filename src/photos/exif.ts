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
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: number;
  focal35?: number;
  exposureBias?: number;
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

// GPS clock "13:07:00", "13:07:00.00" or Android's "13/1,7/1,0/1" -> seconds of day
function parseGpsTime(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const parts = v.split(/[:,]/).map((p) => num(p) ?? NaN);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Zone of the shot, from how far the camera's wall clock is from the GPS (UTC) clock
function offsetFromGps(wall: number, date: unknown, time: unknown): number | undefined {
  const day = typeof date === 'string' ? /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(date.trim()) : null;
  const secs = parseGpsTime(time);
  if (!day || secs === undefined) return undefined;
  const utc = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])) + secs * 1000;
  const offset = Math.round((wall - utc) / 900_000) * 15;
  return Math.abs(offset) <= 14 * 60 ? offset : undefined;
}

function str(v: unknown) {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// iOS nests tags under "{TIFF}" / "{Exif}" / "{GPS}"; Android and some pickers use flat keys
export function parseExif(raw: Dict | null | undefined, fallbackOffsetMin: (wallMs: number) => number): ParsedExif {
  if (!raw) return {};
  const exif: Dict = { ...raw, ...(raw['{TIFF}'] ?? {}), ...(raw['{Exif}'] ?? {}) };
  const gps: Dict = raw['{GPS}'] ?? {};
  const out: ParsedExif = {};

  const wall = parseExifDate(exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime);
  if (wall !== undefined) {
    const offset =
      parseOffset(exif.OffsetTimeOriginal ?? exif.OffsetTime) ??
      offsetFromGps(wall, gps.DateStamp ?? exif.GPSDateStamp, gps.TimeStamp ?? exif.GPSTimeStamp) ??
      fallbackOffsetMin(wall);
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
  out.make = str(exif.Make);
  out.model = str(exif.Model);
  out.lens = str(exif.LensModel);
  // Android reports absent numeric tags as 0
  out.focalLength = num(exif.FocalLength) || undefined;
  out.focal35 = num(exif.FocalLengthIn35mmFilm ?? exif.FocalLenIn35mmFilm) || undefined;
  out.exposureBias = num(exif.ExposureBiasValue);
  return out;
}
