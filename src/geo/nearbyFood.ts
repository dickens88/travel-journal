import { gcj02ToWgs84, inMainlandChina, wgs84ToGcj02 } from './coord';
import { haversineKm, type LatLng } from './distance';
import { getLang, getT } from '@/i18n';

// Restaurants around the user for the buddy, from whichever source covers the spot:
// AMap (高德) in mainland China, Google Places elsewhere, OpenStreetMap as the keyless fallback everywhere.
// OSM has no ratings; it is there so the buddy never has to make places up.

export type FoodSource = 'amap' | 'google' | 'osm';

export type Eatery = {
  name: string;
  // Cuisine or category, e.g. 中餐厅/火锅店, Italian Restaurant
  kind: string | null;
  rating: number | null;
  // Number of reviews behind the rating, where the source says
  reviews: number | null;
  price: string | null;
  distanceM: number;
  address: string | null;
  hours: string | null;
  // Signature dishes or features the source lists
  tag: string | null;
};

export type FoodKeys = { amap: string; google: string };
export type FoodQuery = { keyword?: string; radiusM?: number };
// radiusM is the radius actually searched, after clamping
export type FoodResult = { source: FoodSource; places: Eatery[]; radiusM: number; note?: string };

const TIMEOUT_MS = 10_000;
// The OSM services turn away generic clients, including okhttp's default user agent on Android
const USER_AGENT = 'travel-journal/1.0 (Expo app)';

async function fetchJson(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch (e) {
    throw ctrl.signal.aborted ? new Error(getT().errors.lookupTimeout) : e;
  } finally {
    clearTimeout(timer);
  }
}

// Sources send missing values as "", [] or nothing
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pos = (v: unknown) => {
  const n = Number(str(v) ?? v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---- AMap: mainland China, GCJ-02 coordinates. https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch

// Errors a user can fix in Settings are in their words; others show AMap's own info code
function assertAmapOk(json: any) {
  if (json?.status !== '1') {
    const t = getT();
    const info = String(json?.info ?? t.common.unknown);
    throw new Error(t.errors.amapCodes[info] ?? t.errors.amapError(info));
  }
}

export function parseAmap(json: any): Eatery[] {
  assertAmapOk(json);
  return (json.pois ?? []).map((p: any) => {
    const cost = pos(p.business?.cost);
    const area = str(p.business?.business_area);
    const hours = str(p.business?.opentime_today);
    return {
      name: String(p.name),
      kind: str(p.type)?.split(';').slice(1).join('/') || null,
      rating: pos(p.business?.rating),
      reviews: null,
      price: cost ? getT().ai.food.perPerson(Math.round(cost)) : null,
      distanceM: Number(p.distance) || 0,
      address: [area, str(p.address)].filter(Boolean).join(' ') || null,
      hours: hours && getT().ai.food.today(hours),
      tag: str(p.business?.tag),
    };
  });
}

async function amap(key: string, at: LatLng, keyword: string, radiusM: number) {
  const { lat, lng } = wgs84ToGcj02(at);
  const params = new URLSearchParams({
    key,
    location: `${lng.toFixed(6)},${lat.toFixed(6)}`,
    // The whole 餐饮服务 category
    types: '050000',
    radius: String(radiusM),
    // Popularity first, so the page holds the places worth re-sorting by rating
    sortrule: 'weight',
    show_fields: 'business',
    page_size: '25',
  });
  if (keyword) params.set('keywords', keyword.slice(0, 80));
  const { status, json } = await fetchJson(`https://restapi.amap.com/v5/place/around?${params}`);
  if (status !== 200) throw new Error(getT().errors.amapError(`HTTP ${status}`));
  return parseAmap(json);
}

// ---- Google Places (New): worldwide, WGS-84. https://developers.google.com/maps/documentation/places/web-service/nearby-search

const GOOGLE_FIELDS = [
  'displayName',
  'primaryTypeDisplayName',
  'rating',
  'userRatingCount',
  'priceLevel',
  'shortFormattedAddress',
  'location',
  'currentOpeningHours.openNow',
  'currentOpeningHours.weekdayDescriptions',
  'types',
]
  .map((f) => `places.${f}`)
  .join(',');

// Place types that serve food: restaurant, italian_restaurant, cafe, wine_bar, …  but not barber_shop or food_store
const EATING = /(^|_)(restaurant|cafe|coffee_shop|bakery|bar|pub|diner|bistro|brasserie|deli|food_court|meal_takeaway|tea_house|dessert_shop|ice_cream_shop)$/;

export function parseGoogle(json: any, at: LatLng, now = new Date()): Eatery[] {
  const t = getT().ai.food;
  if (json?.error) throw new Error(getT().errors.googleError(json.error.message ?? json.error.status));
  // weekdayDescriptions start on Monday
  const today = (now.getDay() + 6) % 7;
  // Text search matches words, not categories: "norwegian" also finds language schools and the opera
  const places = (json?.places ?? []).filter((p: any) => !Array.isArray(p.types) || p.types.some((t: string) => EATING.test(t)));
  return places.map((p: any) => {
    const open = p.currentOpeningHours;
    const hours = [open?.openNow === true ? t.openNow : open?.openNow === false ? t.closedNow : null, str(open?.weekdayDescriptions?.[today])];
    return {
      name: String(p.displayName?.text ?? ''),
      kind: str(p.primaryTypeDisplayName?.text),
      rating: pos(p.rating),
      reviews: pos(p.userRatingCount),
      price: t.prices[p.priceLevel] ?? null,
      distanceM: p.location ? Math.round(haversineKm(at, { lat: p.location.latitude, lng: p.location.longitude }) * 1000) : 0,
      address: str(p.shortFormattedAddress),
      hours: hours.filter(Boolean).join(t.hoursSep) || null,
      tag: null,
    };
  });
}

async function google(key: string, at: LatLng, keyword: string, radiusM: number) {
  const circle = { center: { latitude: at.lat, longitude: at.lng }, radius: radiusM };
  const languageCode = getT().ai.food.googleLanguage;
  // Nearby search takes no keyword; a dish or cuisine goes through text search biased to the same circle
  const [url, body] = keyword
    ? ['searchText', { textQuery: keyword, locationBias: { circle }, pageSize: 20, languageCode }]
    : ['searchNearby', { includedTypes: ['restaurant', 'cafe', 'bakery'], locationRestriction: { circle }, maxResultCount: 20, rankPreference: 'POPULARITY', languageCode }];
  const { json } = await fetchJson(`https://places.googleapis.com/v1/places:${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GOOGLE_FIELDS },
    body: JSON.stringify(body),
  });
  // Text search only leans towards the circle; drop what it finds across town
  return parseGoogle(json, at).filter((e) => e.distanceM <= radiusM * 2);
}

// ---- OpenStreetMap via Overpass: worldwide, no key, no ratings. https://wiki.openstreetmap.org/wiki/Overpass_API

const OSM_AMENITIES = 'restaurant|cafe|fast_food|food_court|pub|biergarten|ice_cream';

export function parseOsm(json: any, at: LatLng, keyword: string): Eatery[] {
  // OSM cuisine tags are English (italian, ramen); a Chinese keyword can't match them, so it filters nothing
  const needle = /[a-z]/i.test(keyword) ? keyword.toLowerCase() : '';
  // The name in the app's language next to the local one, where OSM has it
  const nameKey = `name:${getLang()}`;
  return (json?.elements ?? [])
    .map((el: any) => {
      const t = el.tags ?? {};
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
      return {
        name: t[nameKey] && t[nameKey] !== t.name ? `${t[nameKey]}（${t.name}）` : String(t.name ?? ''),
        kind: [t.amenity, t.cuisine?.replace(/;/g, '/')].filter(Boolean).join('/') || null,
        rating: null,
        reviews: null,
        price: null,
        distanceM: lat != null ? Math.round(haversineKm(at, { lat, lng }) * 1000) : 0,
        address: street || null,
        hours: str(t.opening_hours),
        tag: null,
        _match: `${t.name ?? ''} ${t.cuisine ?? ''}`.toLowerCase(),
      };
    })
    .filter((e: any) => e.name && (!needle || e._match.includes(needle)))
    .map(({ _match, ...e }: any) => e as Eatery);
}

async function osm(at: LatLng, keyword: string, radiusM: number) {
  const q = `[out:json][timeout:10];nwr(around:${radiusM},${at.lat},${at.lng})["amenity"~"^(${OSM_AMENITIES})$"]["name"];out center tags 300;`;
  const { status, json } = await fetchJson('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (status === 429) throw new Error(getT().errors.osmBusy);
  if (status !== 200) throw new Error(getT().errors.osmFailed(status));
  return parseOsm(json, at, keyword);
}

// ---- Choosing and ranking

// A rating backed by few reviews is pulled towards 4.0, so a 5.0 from three friends doesn't top a 4.6 from two thousand diners
function score(e: Eatery) {
  if (e.rating == null) return 0;
  if (e.reviews == null) return e.rating;
  return (e.rating * e.reviews + 4 * 30) / (e.reviews + 30);
}

// Best first; places without ratings (all of OSM) nearest first
export function rank(list: Eatery[]) {
  return [...list].sort((a, b) => score(b) - score(a) || a.distanceM - b.distanceM);
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function searchNearbyFood(keys: FoodKeys, at: LatLng, { keyword = '', radiusM = 1500 }: FoodQuery = {}): Promise<FoodResult> {
  const kw = keyword.trim();
  const radius = Math.round(Math.min(Math.max(radiusM, 200), 5000));
  const china = inMainlandChina(at);
  const primary: { source: FoodSource; run: () => Promise<Eatery[]> } | null = china
    ? keys.amap
      ? { source: 'amap', run: () => amap(keys.amap, at, kw, radius) }
      : null
    : keys.google
      ? { source: 'google', run: () => google(keys.google, at, kw, radius) }
      : null;

  let note: string | undefined;
  if (primary) {
    try {
      return { source: primary.source, places: rank(await primary.run()).slice(0, 10), radiusM: radius };
    } catch (e) {
      // Google is unreachable on mainland roaming data; OSM usually still answers
      const t = getT().ai.food;
      note = t.primaryFailed(t.sources[primary.source], reason(e));
    }
  } else {
    note = china ? getT().ai.food.noAmapKey : getT().ai.food.noGoogleKey;
  }
  return { source: 'osm', places: rank(await osm(at, kw, radius)).slice(0, 15), radiusM: radius, note };
}

// ---- Finding a named place, for when the user says where they are or asks about somewhere else

export type NamedPlace = LatLng & { label: string };

export function parseAmapPlace(json: any): NamedPlace | null {
  assertAmapOk(json);
  const p = json.pois?.[0];
  const [lng, lat] = String(p?.location ?? '').split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { ...gcj02ToWgs84({ lat, lng }), label: String(p.name) };
}

async function amapPlace(key: string, name: string) {
  const params = new URLSearchParams({ key, keywords: name.slice(0, 80), page_size: '1' });
  const { json } = await fetchJson(`https://restapi.amap.com/v5/place/text?${params}`);
  return parseAmapPlace(json);
}

async function googlePlace(key: string, name: string): Promise<NamedPlace | null> {
  const { json } = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.location' },
    body: JSON.stringify({ textQuery: name, pageSize: 1, languageCode: getT().ai.food.googleLanguage }),
  });
  if (json?.error) throw new Error(getT().errors.googleError(json.error.message ?? json.error.status));
  const p = json?.places?.[0];
  return p?.location ? { lat: p.location.latitude, lng: p.location.longitude, label: String(p.displayName?.text ?? name) } : null;
}

// OSM Nominatim: no key, one request a second. It misses Chinese renderings of foreign names (奥斯陆中央车站) and
// matches loosely, so the caller asks for local-language names and China is fenced off by country code.
async function nominatimPlace(name: string, china: boolean): Promise<NamedPlace | null> {
  const params = new URLSearchParams({ q: name, format: 'jsonv2', limit: '1', 'accept-language': getT().ai.food.googleLanguage });
  if (china) params.set('countrycodes', 'cn');
  const { status, json } = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (status !== 200) throw new Error(getT().errors.osmPlaceFailed(status));
  const p = json?.[0];
  return p ? { lat: Number(p.lat), lng: Number(p.lon), label: String(p.name || p.display_name) } : null;
}

// Coordinates (WGS-84) of a place the user named. The model says whether it is in mainland China, since the right geocoder
// depends on that and the name alone can't tell. Null when nothing matches; throws only when every source failed.
export async function findPlace(keys: FoodKeys, name: string, china: boolean): Promise<NamedPlace | null> {
  const tries = china
    ? [keys.amap && (() => amapPlace(keys.amap, name)), () => nominatimPlace(name, true)]
    : [keys.google && (() => googlePlace(keys.google, name)), () => nominatimPlace(name, false)];
  const errors: string[] = [];
  for (const run of tries) {
    if (!run) continue;
    try {
      const found = await run();
      if (found) return found;
    } catch (e) {
      errors.push(reason(e));
    }
  }
  if (errors.length === tries.filter(Boolean).length) throw new Error(errors.join(getT().common.listSep));
  return null;
}

// Compact text for the model: a header naming the source, then one line per place
export function describeFood({ source, places, radiusM, note }: FoodResult, where: string) {
  const t = getT().ai.food;
  const head = [t.source(t.sources[source]), t.centre(where), t.radius(radiusM), source === 'osm' ? t.byDistance : t.byRating].join('｜');
  const lines = places.map((e, i) => {
    const facts = [e.rating ? t.rating(e.rating, e.reviews) : null, e.price, t.distance(e.distanceM), e.hours, e.tag ? t.tag(e.tag) : null, e.address ? t.address(e.address) : null];
    return `${i + 1}. ${e.name}${e.kind ? t.kind(e.kind) : ''}｜${facts.filter(Boolean).join('｜')}`;
  });
  return [head, note, lines.length ? lines.join('\n') : t.none].filter(Boolean).join('\n');
}
