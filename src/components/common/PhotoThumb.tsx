import { Image } from 'expo-image';
import type { StyleProp } from 'react-native';
import type { ImageStyle } from 'expo-image';

import { Colors } from '@/constants/theme';
import { photoUri } from '@/photos/storage';

export function PhotoThumb({ file, style }: { file: string | null | undefined; style: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={file ? { uri: photoUri(file) } : undefined}
      style={[{ backgroundColor: Colors.chip }, style]}
      contentFit="cover"
      transition={150}
      recyclingKey={file ?? undefined}
    />
  );
}
