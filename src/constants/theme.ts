import { Platform, type TextStyle } from 'react-native';

export const Colors = {
  paper: '#F6F1E7',
  card: '#FFFDF8',
  chip: '#EDE6D6',
  line: '#E4DCCB',
  ink: '#1F1B16',
  inkSoft: '#3A342D',
  muted: '#6B6257',
  accent: '#B8432B',
  accentSoft: '#FBEDE7',
  teal: '#2E6A6E',
  tealSoft: '#E3EDEC',
  sun: '#B06A12',
  cloud: '#5C7C99',
  // Marker-pen highlight behind icons and under display headings
  pop: '#F4BC52',
  popSoft: '#FBE3B0',
  onDark: '#FFFDF8',
} as const;

export const Fonts = {
  // ZCOOL KuaiLe, embedded by the expo-font config plugin: Android names it by file, iOS by PostScript name
  display: Platform.select({ ios: 'ZCOOLKuaiLe-Regular', default: 'ZCOOLKuaiLe_400Regular' }),
  serif: Platform.select({ ios: 'Songti SC', default: 'serif' }),
};

// Display faces ship a single weight; any fontWeight makes Android synthesize a smeared bold
const display = (fontSize: number, lineHeight: number): TextStyle => ({ fontFamily: Fonts.display, fontSize, lineHeight, fontWeight: 'normal', color: Colors.ink });

export const Type = {
  // Tab screen titles
  hero: display(34, 44),
  // Trip and journal titles
  title: display(28, 38),
  // Day headers, dialog and sheet titles
  heading: display(21, 29),
  // Card titles, empty states, stat values
  subheading: display(17, 24),
  // Long-form journal text and notes
  reading: { fontFamily: Fonts.serif, fontSize: 16, lineHeight: 29, color: Colors.ink } as TextStyle,
} as const;
