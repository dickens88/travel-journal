import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { newId } from '@/utils/id';

// Settings store an uploaded avatar as `photo:<file>`; the file lives in the app's documents, like trip photos
const PHOTO = 'photo:';
const SIZE = 256;

export function avatarPhotoFile(value: string) {
  return value.startsWith(PHOTO) ? value.slice(PHOTO.length) : null;
}

export function avatarUri(file: string) {
  return new File(Paths.document, 'avatars', file).uri;
}

// Opens the system picker with a square crop; resolves to the settings value, or null if cancelled
export async function pickAvatarPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled) return null;
  const a = res.assets[0];
  // Center-crop anyway: not every Android cropper honors the aspect ratio
  const side = Math.min(a.width, a.height);
  const image = await ImageManipulator.manipulate(a.uri)
    .crop({ originX: (a.width - side) / 2, originY: (a.height - side) / 2, width: side, height: side })
    .resize({ width: Math.min(side, SIZE), height: null })
    .renderAsync();
  const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  const dir = new Directory(Paths.document, 'avatars');
  dir.create({ intermediates: true, idempotent: true });
  // A fresh name each time, so the image cache never shows the previous picture
  const file = `buddy-${newId()}.jpg`;
  await new File(saved.uri).move(new File(dir, file));
  return PHOTO + file;
}

export function deleteAvatarPhoto(value: string) {
  const file = avatarPhotoFile(value);
  if (!file) return;
  const f = new File(Paths.document, 'avatars', file);
  if (f.exists) f.delete();
}
