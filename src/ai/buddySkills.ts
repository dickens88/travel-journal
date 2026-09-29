import { photoPlace } from './tripContext';
import type { IconName } from '@/components/common/icons';
import type { Photo, Trip } from '@/db/types';
import { currentPlace } from '@/geo/place';
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

const SKILLS: BuddySkill[] = [
  { id: 'guide', icon: 'compass', title: '当导游', hint: '带我逛逛附近的景点', needs: 'place' },
  { id: 'story', icon: 'scroll', title: '照片里的故事', hint: '挑张照片，讲讲背后的历史', needs: 'photo', needsPhotos: true },
  { id: 'food', icon: 'food', title: '吃点啥', hint: '附近地道的当地美食', needs: 'place' },
  { id: 'shots', icon: 'camera', title: '出片机位', hint: '哪里好拍、几点光线好', needs: 'place' },
  // Planning ahead only helps while still travelling
  { id: 'plan', icon: 'path', title: '接下来去哪', hint: '按天气和足迹排行程', openOnly: true },
  { id: 'recap', icon: 'sparkle', title: '回顾一下', hint: '聊聊这趟的亮点', needsPhotos: true },
  { id: 'trivia', icon: 'lightbulb', title: '冷知识', hint: '关于这里的意想不到' },
  { id: 'phrases', icon: 'translate', title: '学句当地话', hint: '方言和常用语' },
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
export function buddySkills(trip: Trip, photos: Photo[]): BuddySkill[] {
  return SKILLS.filter((s) => (!s.needsPhotos || photos.length > 0) && (!s.openOnly || isOpen(trip))).map((s) =>
    s.id === 'recap' && recapToday(trip, photos) ? { ...s, hint: '聊聊今天的亮点' } : s,
  );
}

// The city most photos were taken in, else the trip's own title
export function destinationOf(trip: Trip, photos: Photo[]) {
  const counts = new Map<string, number>();
  for (const p of photos) {
    const city = p.city || photoAnalysis(p)?.city;
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [city, n] of counts) if (!best || n > counts.get(best)!) best = city;
  return best ?? `「${trip.title}」这趟的目的地`;
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

function where(spot: Spot | null, destination: string) {
  if (!spot) return `我在${destination}`;
  const coord = `坐标 ${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
  if (spot.live) return spot.label ? `我现在在${spot.label}（${coord}）` : `我现在的位置是${coord}`;
  return spot.label ? `我最近到过${spot.label}（${coord}）` : `我最近到过${coord}附近`;
}

export const STORY_PROMPT = '以这张照片为线索，给我讲讲这里的历史故事吧：它的来历、经历过哪些事、有没有传说或名人轶事。像导游现场讲解那样，讲得有意思一点。';

export type SkillInput = { trip: Trip; photos: Photo[]; spot?: Spot | null };

export function skillPrompt(id: SkillId, { trip, photos, spot = null }: SkillInput): string {
  const dest = destinationOf(trip, photos);
  switch (id) {
    case 'guide':
      return `当回导游吧！${where(spot, dest)}，附近有什么值得去的？挑 3–5 个，说说各自的看点、离这儿多远、大概玩多久，顺路的话帮我排个小路线。`;
    case 'story':
      return STORY_PROMPT;
    case 'food':
      return `${where(spot, dest)}，附近有什么地道的当地吃的？推荐几样招牌菜或小吃，说说大概价位、去哪吃、什么时候吃最合适。`;
    case 'shots':
      return `${where(spot, dest)}，附近有哪些好出片的机位？结合这几天的天气和光线，说说什么时间去、站哪儿、怎么拍更好看。`;
    case 'plan':
      return '根据我这趟已经去过的地方和天气，帮我想想接下来去哪：排个半天到一天的安排，别和去过的重复，说说为什么值得去。';
    case 'recap':
      return recapToday(trip, photos)
        ? '帮我回顾一下今天吧：去了哪些地方、拍了什么、有什么亮点，轻松地聊聊。'
        : '帮我回顾一下这趟旅行吧：去了哪些地方、拍了什么、有什么亮点和难忘的瞬间，轻松地聊聊。';
    case 'trivia':
      return `讲 3 个关于${dest}的冷知识吧，越意想不到越好，能和我拍到的东西联系上就更好了。`;
    case 'phrases':
      return `教我几句${dest}当地的方言或常用语，标上读音，说说什么场合用、怎么用不会尴尬。`;
  }
}
