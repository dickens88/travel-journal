import * as Location from 'expo-location';

import { addNote } from '@/db/repo';
import { placeName } from '@/geo/place';

async function currentPlace() {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude, longitude } = pos.coords;
    const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
    return { lat: latitude, lng: longitude, place: addr ? placeName(addr) : null };
  } catch {
    return null;
  }
}

export async function addManualNote(tripId: string, text: string) {
  const createdAt = Date.now();
  const here = await currentPlace();
  return addNote({
    trip_id: tripId,
    text,
    lat: here?.lat ?? null,
    lng: here?.lng ?? null,
    place_name: here?.place ?? null,
    source: 'manual',
    created_at: createdAt,
  });
}
