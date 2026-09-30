import { Image, type ImageSource } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { avatarPhotoFile, avatarUri } from '@/settings/avatar';

// Mascots from the free IP as Logo library (https://ipaslogo.com), resized to 256px. `bg` matches each
// picture's backdrop and shows while it loads. Keep the ids stable: settings store the chosen id
export const AVATAR_PRESETS: { id: string; label: string; bg: string; image: ImageSource }[] = [
  { id: 'cat', label: '黑猫', bg: '#FCF9F3', image: require('../../../assets/images/buddy/cat.webp') },
  { id: 'panda', label: '熊猫', bg: '#E23755', image: require('../../../assets/images/buddy/panda.webp') },
  { id: 'fox', label: '狐狸', bg: '#E8F9AF', image: require('../../../assets/images/buddy/fox.webp') },
  { id: 'penguin', label: '企鹅', bg: '#D9C2FC', image: require('../../../assets/images/buddy/penguin.webp') },
  { id: 'deer', label: '小鹿', bg: '#5774CE', image: require('../../../assets/images/buddy/deer.webp') },
  { id: 'koala', label: '考拉', bg: '#D1E49E', image: require('../../../assets/images/buddy/koala.webp') },
  { id: 'raccoon', label: '浣熊', bg: '#021860', image: require('../../../assets/images/buddy/raccoon.webp') },
  { id: 'pig', label: '小猪', bg: '#E7F9A7', image: require('../../../assets/images/buddy/pig.webp') },
  { id: 'bear', label: '小熊', bg: '#02216D', image: require('../../../assets/images/buddy/bear.webp') },
  { id: 'bunny', label: '兔兔', bg: '#0273BF', image: require('../../../assets/images/buddy/bunny.webp') },
];

const PRESETS = new Map(AVATAR_PRESETS.map((p) => [p.id, p]));

// The buddy's face: the default icon, a preset animal, or the user's uploaded picture
export function BuddyAvatar({ value, size, style }: { value: string; size: number; style?: StyleProp<ViewStyle> }) {
  const photo = avatarPhotoFile(value);
  const preset = PRESETS.get(value);
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: preset?.bg ?? Colors.popSoft, alignItems: 'center', justifyContent: 'center' }, style]}>
      {photo ? (
        <Image source={{ uri: avatarUri(photo) }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : preset ? (
        <Image source={preset.image} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Icon name="buddy" size={Math.round(size * 0.62)} color={Colors.ink} />
      )}
    </View>
  );
}
