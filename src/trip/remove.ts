import { Alert } from 'react-native';

import { deletePhoto, deleteTrip, listPhotos } from '@/db/repo';
import type { Photo } from '@/db/types';
import { getT } from '@/i18n';
import { deletePhotoFile } from '@/photos/storage';

// Delete a trip's rows (children cascade), then its stored photo copies
export function removeTrip(id: string) {
  const files = listPhotos(id).map((p) => p.file);
  deleteTrip(id);
  files.forEach(deletePhotoFile);
}

export function removePhoto(photo: Pick<Photo, 'id' | 'file'>) {
  deletePhoto(photo.id);
  deletePhotoFile(photo.file);
}

// Asks first; onRemoved runs before the row goes so a viewer can move off the photo
export function confirmRemovePhoto(photo: Pick<Photo, 'id' | 'file'>, onRemoved?: () => void) {
  const t = getT();
  Alert.alert(t.photo.deleteTitle, t.photo.deleteText, [
    { text: t.common.cancel, style: 'cancel' },
    {
      text: t.common.delete,
      style: 'destructive',
      onPress: () => {
        onRemoved?.();
        removePhoto(photo);
      },
    },
  ]);
}
