import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';

import { photoUri } from './storage';
import { mapLimit } from '@/utils/pool';

const cache = new Map<string, string>();

// Tiny base64 thumbnails for map markers; the map WebView can't read app files directly
async function thumb(file: string) {
  const hit = cache.get(file);
  if (hit) return hit;
  const image = await ImageManipulator.manipulate(photoUri(file)).resize({ width: 96 }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  const uri = `data:image/jpeg;base64,${saved.base64}`;
  cache.set(file, uri);
  return uri;
}

export function useThumbs(files: string[]) {
  const key = files.join('|');
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => Object.fromEntries(files.flatMap((f) => (cache.has(f) ? [[f, cache.get(f)!]] : []))));
  useEffect(() => {
    let cancelled = false;
    // Build all thumbs, then apply once so the map redraws a single time
    const missing = key ? key.split('|').filter((f) => !cache.has(f)) : [];
    if (!missing.length) return;
    mapLimit(missing, 3, (f) => thumb(f).catch(() => null)).then((uris) => {
      if (cancelled) return;
      setThumbs((t) => ({ ...t, ...Object.fromEntries(missing.flatMap((f, i) => (uris[i] ? [[f, uris[i]]] : []))) }));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return thumbs;
}
