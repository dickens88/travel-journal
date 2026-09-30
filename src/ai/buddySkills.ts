import { photoPlace } from './tripContext';
import type { IconName } from '@/components/common/icons';
import type { Photo, Trip } from '@/db/types';
import { currentPlace } from '@/geo/place';
import type { Messages } from '@/i18n';
import { photoAnalysis } from '@/trip/derive';
import { localParts, todayISO } from '@/utils/time';

// One-tap asks offered in the buddy sheet, so opening it never starts from a blank input.
// Each prompt is sent as the user's own message, so it reads like something a traveller would say.

export type SkillId = 'guide' | 'story' | 'food' | 'shots' | 'plan' | 'recap' | 'trivia' | 'phrases';

export type BuddySkill = {
  id: SkillId;
  icon: IconName;
  title: string;
  hint: string;
  // photo: the user picks a trip photo first; place: the prompt names where the user is
  needs?: 'photo' | 'place';
  // Only offered when the trip has photos / is still under way
  needsPhotos?: boolean;
  openOnly?: boolean;
};

// Where "nearby" means: the device right now on an open trip, otherwise the last photo with a location
export type Spot = { label: string; lat: number; lng: number; live: boolean };

type SkillDef = Omit<BuddySkill, 'title' | 'hint'>;

// Titles and hints come from the dictionary (t.skills[id])
const SKILLS: SkillDef[] = [
  { id: 'guide', icon: 'compass', needs: 'place' },
  { id: 'story', icon: 'scroll', needs: 'photo', needsPhotos: true },
  { id: 'food', icon: 'food', needs: 'place' },
  { id: 'shots', icon: 'camera', needs: 'place' },
  // Planning ahead only helps while still travelling
  { id: 'plan', icon: 'path', openOnly: true },
  { id: 'recap', icon: 'sparkle', needsPhotos: true },
  { id: 'trivia', icon: 'lightbulb' },
  { id: 'phrases', icon: 'translate' },
];

// Still travelling: no end date yet, or one that hasn't passed
const isOpen = (trip: Trip) => !trip.end_date || trip.end_date >= todayISO();

// Recap today rather than the whole trip: still travelling and photos were taken today
function recapToday(trip: Trip, photos: Photo[]) {
  if (!isOpen(trip)) return false;
  const today = todayISO();
  return photos.some((p) => p.taken_at != null && localParts(p.taken_at, p.offset_min).date === today);
}

// Skills that make sense for this trip right now, with hints adjusted to its state
export function buddySkills(trip: Trip, photos: Photo[], t: Messages): BuddySkill[] {
  return SKILLS.filter((s) => (!s.needsPhotos || photos.length > 0) && (!s.openOnly || isOpen(trip))).map((s) => ({
    ...s,
    title: t.skills[s.id].title,
    hint: s.id === 'recap' && recapToday(trip, photos) ? t.skills.recapTodayHint : t.skills[s.id].hint,
  }));
}

// The city most photos were taken in, else the trip's own title
export function destinationOf(trip: Trip, photos: Photo[], t: Messages) {
  const counts = new Map<string, number>();
  for (const p of photos) {
    const city = p.city || photoAnalysis(p)?.city;
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [city, n] of counts) if (!best || n > counts.get(best)!) best = city;
  return best ?? t.skills.destinationOf(trip.title);
}

export function lastPhotoSpot(photos: Photo[]): Spot | null {
  const p = photos.findLast((x) => x.lat != null && x.lng != null);
  if (!p) return null;
  return { label: photoPlace(p) || photoAnalysis(p)?.place || '', lat: p.lat!, lng: p.lng!, live: false };
}

// Device location can take a while indoors; fall back to the photos rather than keep the user waiting
export async function resolveSpot(trip: Trip, photos: Photo[]): Promise<Spot | null> {
  if (isOpen(trip)) {
    const here = await currentPlace({ timeoutMs: 6000 });
    if (here) return { label: [here.place, here.city].filter(Boolean).join('，'), lat: here.lat, lng: here.lng, live: true };
  }
  return lastPhotoSpot(photos);
}

function where(spot: Spot | null, destination: string, t: Messages) {
  const k = t.skills;
  if (!spot) return k.atDestination(destination);
  const coord = `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
  if (spot.live) return spot.label ? k.hereNamed(spot.label, coord) : k.hereCoord(coord);
  return spot.label ? k.lastNamed(spot.label, coord) : k.lastCoord(coord);
}

export type SkillInput = { trip: Trip; photos: Photo[]; spot?: Spot | null; t: Messages };

// The ask sent as the user's message, in the app's language
export function skillPrompt(id: SkillId, { trip, photos, spot = null, t }: SkillInput): string {
  const p = t.skills.prompts;
  const dest = destinationOf(trip, photos, t);
  switch (id) {
    case 'guide':
      return p.guide(where(spot, dest, t));
    case 'story':
      return p.story;
    case 'food':
      return p.food(where(spot, dest, t));
    case 'shots':
      return p.shots(where(spot, dest, t));
    case 'plan':
      return p.plan;
    case 'recap':
      return recapToday(trip, photos) ? p.recapToday : p.recapTrip;
    case 'trivia':
      return p.trivia(dest);
    case 'phrases':
      return p.phrases(dest);
  }
}
