import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
// The legacy API is the one Expo Go ships; it also works in standalone builds
import * as MediaLibrary from 'expo-media-library/legacy';

import { parseExif, type ParsedExif } from './exif';
import { photosDir } from './storage';
import { analyzePending } from '@/ai/analyzePhotos';
import { insertPhotos, listPhotos, updatePhotos, type PhotoPatch } from '@/db/repo';
import type { Photo } from '@/db/types';
import { interpolateMissing } from '@/geo/interpolate';
import { describeLighting } from '@/geo/lighting';
import { placeName } from '@/geo/place';
import { loadSettings } from '@/settings/settings';
import { setJob } from '@/trip/jobs';
import { newId } from '@/utils/id';
import { deviceOffsetMin } from '@/utils/time';
import { refreshWeather } from '@/weather/refresh';

const MAX_EDGE = 1568;

// Fallback picker (system photo picker); it may strip GPS, so the in-app gallery is preferred
export async function pickPhotos(): Promise<ImportSource[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    exif: true,
    quality: 1,
  });
  return res.canceled ? [] : res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height, exif: a.exif, assetId: a.assetId }));
}

export type ImportSource = {
  uri: string;
  width: number;
  height: number;
  exif?: Record<string, any> | null;
  assetId?: string | null;
  location?: { latitude: number; longitude: number } | null;
  created?: number | null;
  // Already read via MediaLibrary, so location/created are as complete as they get
  fromLibrary?: boolean;
};

export function requestLibraryAccess() {
  return MediaLibrary.requestPermissionsAsync(false, ['photo']);
}

// Read an asset picked from the in-app gallery; location needs ACCESS_MEDIA_LOCATION on Android
async function sourceFromLibrary(assetId: string): Promise<ImportSource> {
  const info = await MediaLibrary.getAssetInfoAsync(assetId);
  return {
    uri: info.localUri ?? info.uri,
    width: info.width,
    height: info.height,
    exif: (info.exif as Record<string, any> | undefined) ?? null,
    assetId,
    location: info.location ?? null,
    created: info.creationTime || null,
    fromLibrary: true,
  };
}

export async function importLibrary(tripId: string, assetIds: string[]) {
  if (!assetIds.length) return;
  setJob(tripId, { importing: { done: 0, total: assetIds.length }, error: undefined });
  // Skip assets that vanished or became unreadable since the gallery loaded
  const results = await Promise.allSettled(assetIds.map(sourceFromLibrary));
  const sources = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!sources.length) {
    setJob(tripId, { importing: undefined, error: '这些照片读取不了，试试用系统相册选择' });
    return;
  }
  await importAssets(tripId, sources);
}

async function shrinkAndStore(a: ImportSource, id: string) {
  const ctx = ImageManipulator.manipulate(a.uri);
  if (Math.max(a.width, a.height) > MAX_EDGE) ctx.resize(a.width >= a.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const file = `${id}.jpg`;
  await new File(saved.uri).move(new File(photosDir(), file));
  return { file, width: saved.width, height: saved.height };
}

export async function importAssets(tripId: string, assets: ImportSource[]) {
  if (!assets.length) return;
  const batchId = newId();
  const addedAt = Date.now();
  let libraryGranted: boolean | undefined;
  const rows: Omit<Photo, 'journal_included_at'>[] = [];
  setJob(tripId, { importing: { done: 0, total: assets.length }, error: undefined });
  try {
    for (const a of assets) {
      const ex: ParsedExif = parseExif(a.exif, deviceOffsetMin);
      let takenAt = ex.takenAt ?? null;
      let offset = ex.offsetMin ?? null;
      let lat = ex.lat ?? a.location?.latitude ?? null;
      let lng = ex.lng ?? a.location?.longitude ?? null;
      if (takenAt == null && a.created) {
        takenAt = a.created;
        offset = deviceOffsetMin(a.created);
      }
      if ((lat == null || takenAt == null) && a.assetId && !a.fromLibrary) {
        libraryGranted ??= (await requestLibraryAccess().catch(() => ({ granted: false }))).granted;
        if (libraryGranted) {
          try {
            const fb = await sourceFromLibrary(a.assetId);
            if (lat == null && fb.location) ({ latitude: lat, longitude: lng } = fb.location);
            if (takenAt == null && fb.created) {
              takenAt = fb.created;
              offset = deviceOffsetMin(fb.created);
            }
          } catch {
            // Limited library access can hide the asset; keep what EXIF gave us
          }
        }
      }
      const id = newId();
      const stored = await shrinkAndStore(a, id);
      rows.push({
        id,
        trip_id: tripId,
        asset_id: a.assetId ?? null,
        ...stored,
        taken_at: takenAt,
        offset_min: offset ?? deviceOffsetMin(takenAt ?? addedAt),
        lat,
        lng,
        loc_estimated: 0,
        altitude: ex.altitude ?? null,
        place_name: null,
        country: null,
        region: null,
        city: null,
        exif_json: JSON.stringify(ex),
        lighting_tag: describeLighting(takenAt, lat, lng, ex),
        analysis_json: null,
        batch_id: batchId,
        added_at: addedAt,
      });
      setJob(tripId, { importing: { done: rows.length, total: assets.length } });
    }
    insertPhotos(rows);
    await fillLocations(tripId);
  } finally {
    setJob(tripId, { importing: undefined });
  }
  refreshWeather(tripId);
  if ((await loadSettings()).apiKey) analyzePending(tripId);
}

const geocodeCache = new Map<string, Location.LocationGeocodedAddress | null>();
let geocodeAllowed: boolean | undefined;

// Estimate missing positions, then reverse-geocode (cached per ~100 m cell)
async function fillLocations(tripId: string) {
  const photos = listPhotos(tripId);
  const estimates = interpolateMissing(photos.map((p) => ({ id: p.id, takenAt: p.taken_at, lat: p.lat, lng: p.lng })));
  const estimated: PhotoPatch[] = [];
  for (const p of photos) {
    const est = estimates.get(p.id);
    if (!est) continue;
    const ex: ParsedExif = p.exif_json ? JSON.parse(p.exif_json) : {};
    estimated.push({ id: p.id, fields: { lat: est.lat, lng: est.lng, loc_estimated: 1, lighting_tag: describeLighting(p.taken_at, est.lat, est.lng, ex) } });
    Object.assign(p, est);
  }
  updatePhotos(estimated);

  // Android's geocoder needs location permission; without it the photo analysis fills place names
  geocodeAllowed ??= (await Location.requestForegroundPermissionsAsync().catch(() => ({ granted: false }))).granted;
  if (!geocodeAllowed) return;
  const named: PhotoPatch[] = [];
  for (const p of photos) {
    if (p.lat == null || p.lng == null || p.place_name) continue;
    const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
    if (!geocodeCache.has(key)) {
      try {
        const [addr] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
        geocodeCache.set(key, addr ?? null);
      } catch {
        // Geocoder unavailable or throttled; photo analysis fills in place names instead
        break;
      }
    }
    const addr = geocodeCache.get(key);
    if (!addr) continue;
    named.push({ id: p.id, fields: { place_name: placeName(addr), country: addr.country, region: addr.region, city: addr.city ?? addr.subregion } });
  }
  updatePhotos(named);
}
