import { addNote } from '@/db/repo';
import { currentPlace } from '@/geo/place';

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
