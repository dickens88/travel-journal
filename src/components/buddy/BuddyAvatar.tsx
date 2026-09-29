import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { avatarPhotoFile, avatarUri } from '@/settings/avatar';

const INK = '#3A2E26';
const BLUSH = '#F4A6A0';
const CREAM = '#FFF6E8';

// Round shiny eye
const Eye = ({ x, y, r = 2.8 }: { x: number; y: number; r?: number }) => (
  <G>
    <Circle cx={x} cy={y} r={r} fill={INK} />
    <Circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.33} fill="#FFFFFF" />
  </G>
);

const Blush = ({ x, y }: { x: number; y: number }) => <Ellipse cx={x} cy={y} rx={3.6} ry={2.2} fill={BLUSH} opacity={0.75} />;

// Little "ω" mouth
const Mouth = ({ y }: { y: number }) => <Path d={`M28.8 ${y} q1.6 1.9 3.2 0 q1.6 1.9 3.2 0`} stroke={INK} strokeWidth={1.4} strokeLinecap="round" fill="none" />;

// Faces are drawn on a 64×64 canvas over a round tinted background
export const AVATAR_PRESETS: { id: string; label: string; bg: string; face: ReactNode }[] = [
  {
    id: 'cat',
    label: '猫咪',
    bg: Colors.popSoft,
    face: (
      <G>
        <Path d="M13 32 L16 9 L29 21 Z M51 32 L48 9 L35 21 Z" fill="#F2A65A" strokeLinejoin="round" stroke="#F2A65A" strokeWidth={3} />
        <Path d="M17.5 24 L18.8 15 L25 20.5 Z M46.5 24 L45.2 15 L39 20.5 Z" fill="#F7C9A8" />
        <Ellipse cx={32} cy={38} rx={20} ry={17} fill="#F2A65A" />
        <Path d="M32 22 v5.5 M26.5 23 l1 4.5 M37.5 23 l-1 4.5" stroke="#D9823A" strokeWidth={2} strokeLinecap="round" />
        <Ellipse cx={32} cy={45} rx={8} ry={5.5} fill={CREAM} />
        <Eye x={24} y={37} />
        <Eye x={40} y={37} />
        <Path d="M30.4 41.6 h3.2 l-1.6 1.9 z" fill="#E07A6A" stroke="#E07A6A" strokeLinejoin="round" />
        <Mouth y={44} />
        <Path d="M13 41 l6 1 M13 46 l6 -1.5 M51 41 l-6 1 M51 46 l-6 -1.5" stroke={INK} strokeWidth={1} strokeLinecap="round" opacity={0.45} />
        <Blush x={19.5} y={44} />
        <Blush x={44.5} y={44} />
      </G>
    ),
  },
  {
    id: 'shiba',
    label: '柴柴',
    bg: '#E9E1F2',
    face: (
      <G>
        <Path d="M14 29 L17 10 L29 20 Z M50 29 L47 10 L35 20 Z" fill="#E8A25E" strokeLinejoin="round" stroke="#E8A25E" strokeWidth={3} />
        <Path d="M18.5 23 L19.5 15.5 L25 20 Z M45.5 23 L44.5 15.5 L39 20 Z" fill={CREAM} />
        <Ellipse cx={32} cy={37} rx={20} ry={18} fill="#E8A25E" />
        <Ellipse cx={32} cy={46} rx={14} ry={9} fill={CREAM} />
        <Circle cx={25} cy={31} r={2} fill={CREAM} />
        <Circle cx={39} cy={31} r={2} fill={CREAM} />
        <Eye x={25} y={37.5} />
        <Eye x={39} y={37.5} />
        <Ellipse cx={32} cy={42.5} rx={3} ry={2.2} fill={INK} />
        <Mouth y={45.5} />
        <Blush x={19} y={44} />
        <Blush x={45} y={44} />
      </G>
    ),
  },
  {
    id: 'bunny',
    label: '兔兔',
    bg: Colors.accentSoft,
    face: (
      <G>
        <Ellipse cx={23} cy={19} rx={6.5} ry={13} fill="#FFFFFF" stroke="#EAD8CB" strokeWidth={1.5} transform="rotate(-12 23 19)" />
        <Ellipse cx={41} cy={19} rx={6.5} ry={13} fill="#FFFFFF" stroke="#EAD8CB" strokeWidth={1.5} transform="rotate(12 41 19)" />
        <Ellipse cx={23} cy={20} rx={3} ry={9} fill="#F7B8B0" transform="rotate(-12 23 20)" />
        <Ellipse cx={41} cy={20} rx={3} ry={9} fill="#F7B8B0" transform="rotate(12 41 20)" />
        <Ellipse cx={32} cy={42} rx={19} ry={16} fill="#FFFFFF" stroke="#EAD8CB" strokeWidth={1.5} />
        <Eye x={25} y={40} />
        <Eye x={39} y={40} />
        <Path d="M30.4 44 h3.2 l-1.6 1.8 z" fill="#E88E88" stroke="#E88E88" strokeLinejoin="round" />
        <Mouth y={46.5} />
        <Blush x={20.5} y={46} />
        <Blush x={43.5} y={46} />
      </G>
    ),
  },
  {
    id: 'panda',
    label: '熊猫',
    bg: '#DDEBD9',
    face: (
      <G>
        <Circle cx={16} cy={22} r={7} fill="#2F2A26" />
        <Circle cx={48} cy={22} r={7} fill="#2F2A26" />
        <Ellipse cx={32} cy={38} rx={20.5} ry={17.5} fill="#FFFFFF" />
        <Ellipse cx={24} cy={37.5} rx={5} ry={6.5} fill="#2F2A26" transform="rotate(-28 24 37.5)" />
        <Ellipse cx={40} cy={37.5} rx={5} ry={6.5} fill="#2F2A26" transform="rotate(28 40 37.5)" />
        <Circle cx={24.8} cy={36.6} r={1.9} fill="#FFFFFF" />
        <Circle cx={39.2} cy={36.6} r={1.9} fill="#FFFFFF" />
        <Ellipse cx={32} cy={43.5} rx={2.8} ry={2} fill="#2F2A26" />
        <Mouth y={46.3} />
        <Blush x={18} y={45} />
        <Blush x={46} y={45} />
      </G>
    ),
  },
  {
    id: 'fox',
    label: '狐狸',
    bg: Colors.tealSoft,
    face: (
      <G>
        <Path d="M12 32 L15 8 L29 20 Z M52 32 L49 8 L35 20 Z" fill="#E8793A" strokeLinejoin="round" stroke="#E8793A" strokeWidth={3} />
        <Path d="M16.5 24 L17.5 14 L24.5 19.5 Z M47.5 24 L46.5 14 L39.5 19.5 Z" fill="#5A3A2A" />
        <Path d="M11 33 Q12 20 32 20 Q52 20 53 33 Q52 46 32 54 Q12 46 11 33 Z" fill="#E8793A" />
        <Path d="M11.5 35 Q24 35 32 45 Q40 35 52.5 35 Q50 47 32 54 Q14 47 11.5 35 Z" fill={CREAM} />
        <Path d="M21.5 35.5 q2.5 -3 5 0 M37.5 35.5 q2.5 -3 5 0" stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none" />
        <Ellipse cx={32} cy={47} rx={2.5} ry={1.9} fill={INK} />
        <Blush x={20} y={41} />
        <Blush x={44} y={41} />
      </G>
    ),
  },
  {
    id: 'penguin',
    label: '企鹅',
    bg: '#DCE8F2',
    face: (
      <G>
        <Path d="M29.5 19 q1.5 -6 6.5 -4.5 q-3.5 1.2 -2.2 4.2 z" fill="#34495E" />
        <Ellipse cx={32} cy={37} rx={20.5} ry={19} fill="#34495E" />
        <Circle cx={25} cy={38} r={9} fill="#FFFFFF" />
        <Circle cx={39} cy={38} r={9} fill="#FFFFFF" />
        <Ellipse cx={32} cy={44} rx={13} ry={9} fill="#FFFFFF" />
        <Eye x={26} y={37} />
        <Eye x={38} y={37} />
        <Path d="M28.5 42 Q32 39.5 35.5 42 Q32 46.5 28.5 42 Z" fill="#F4A640" />
        <Blush x={20} y={44} />
        <Blush x={44} y={44} />
      </G>
    ),
  },
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
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {preset.face}
        </Svg>
      ) : (
        <Icon name="buddy" size={Math.round(size * 0.62)} color={Colors.ink} />
      )}
    </View>
  );
}
