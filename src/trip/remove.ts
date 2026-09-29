import { deleteTrip, listPhotos } from '@/db/repo';
import { deletePhotoFile } from '@/photos/storage';

// Delete a trip's rows (children cascade), then its stored photo copies
export function removeTrip(id: string) {
  const files = listPhotos(id).map((p) => p.file);
  deleteTrip(id);
  files.forEach(deletePhotoFile);
}
