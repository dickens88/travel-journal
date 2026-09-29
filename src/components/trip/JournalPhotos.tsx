import { StyleSheet, Text, View } from 'react-native';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import type { Photo } from '@/db/types';
import { photoAnalysis } from '@/trip/derive';

function caption(p: Photo) {
  return [p.lighting_tag, photoAnalysis(p)?.caption].filter(Boolean).join(' · ');
}

function Figure({ photo, height, flex }: { photo: Photo; height: number; flex?: boolean }) {
  const text = caption(photo);
  return (
    <View style={[{ height, borderRadius: 14, overflow: 'hidden' }, flex && { flex: 1 }]}>
      <PhotoThumb file={photo.file} style={StyleSheet.absoluteFill} />
      {text ? (
        <Text style={styles.caption} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

export function JournalPhotos({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null;
  if (photos.length === 1) {
    const p = photos[0];
    const ratio = p.width && p.height ? p.height / p.width : 0.66;
    return <Figure photo={p} height={Math.min(420, Math.max(200, 350 * ratio))} />;
  }
  const rows: Photo[][] = photos.length === 3 ? [[photos[0]], photos.slice(1)] : [photos.slice(0, 2), photos.slice(2, 4)].filter((r) => r.length);
  return (
    <View style={{ gap: 6 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((p) => (
            <Figure key={p.id} photo={p} height={row.length === 1 ? 210 : 200} flex />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '90%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,16,12,0.62)',
    color: '#FFFDF8',
    fontSize: 11,
  },
});
