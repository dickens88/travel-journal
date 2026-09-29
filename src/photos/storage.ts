import { Directory, File, Paths } from 'expo-file-system';

// Store only file names in the DB; the app container path changes between installs
export function photosDir() {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function photoUri(file: string) {
  return new File(Paths.document, 'photos', file).uri;
}

export function photoBase64(file: string) {
  return new File(Paths.document, 'photos', file).base64();
}

export function deletePhotoFile(file: string) {
  const f = new File(Paths.document, 'photos', file);
  if (f.exists) f.delete();
}
