import { fetchDailyWeather } from './openMeteo';
import { listDays, listPhotos, upsertDays } from '@/db/repo';
import { mapLimit } from '@/utils/pool';
import { localParts, todayISO } from '@/utils/time';

// Fill missing per-day weather using the first located photo of each day
export async function refreshWeather(tripId: string) {
  const have = new Set(listDays(tripId).map((d) => d.date));
  const today = todayISO();
  const firstByDate = new Map<string, { lat: number; lng: number }>();
  for (const p of listPhotos(tripId)) {
    if (p.taken_at == null || p.lat == null || p.lng == null) continue;
    const date = localParts(p.taken_at, p.offset_min).date;
    if (!have.has(date) && date <= today && !firstByDate.has(date)) firstByDate.set(date, { lat: p.lat, lng: p.lng });
  }
  // Weather is decorative; skip days that fail
  const fetched = await mapLimit([...firstByDate], 3, ([date, pos]) => fetchDailyWeather(pos.lat, pos.lng, date, date).catch(() => []));
  const rows = fetched.flat();
  if (rows.length) upsertDays(tripId, rows);
}
