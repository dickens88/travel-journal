import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ICON_PATHS, type IconName } from '@/components/common/icons';
import { Colors, Type } from '@/constants/theme';

export type { IconName };

// Phosphor duotone: outline in `color` over a marker-pen fill in `duo`. Small sizes switch to the bold outline to stay legible.
export function Icon({ name, size = 20, color = Colors.ink, duo = Colors.pop }: { name: IconName; size?: number; color?: string; duo?: string | null }) {
  const p = ICON_PATHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      {duo ? <Path d={p.duo} fill={duo} /> : null}
      <Path d={size < 18 ? p.bold : p.line} fill={color} />
    </Svg>
  );
}

type TextProps = { style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number };

// Headings in the display face. `marker` draws a highlighter stroke behind the text, for page titles.
export function Display({ variant = 'heading', marker, style, children, numberOfLines }: TextProps & { variant?: 'hero' | 'title' | 'heading' | 'subheading'; marker?: boolean }) {
  const text = (
    <Text style={[Type[variant], style, { fontWeight: 'normal' }]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
  if (!marker) return text;
  return (
    <View style={styles.markerWrap}>
      <View style={styles.marker} />
      {text}
    </View>
  );
}

// Long-form reading text
export function Serif({ style, children, numberOfLines }: TextProps) {
  return (
    <Text style={[Type.reading, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Chip({ icon, iconColor, label, tone = 'plain' }: { icon?: IconName; iconColor?: string; label: string; tone?: 'plain' | 'teal' | 'accent' }) {
  const bg = tone === 'teal' ? Colors.tealSoft : tone === 'accent' ? Colors.accentSoft : Colors.chip;
  const fg = tone === 'teal' ? Colors.teal : tone === 'accent' ? Colors.accent : Colors.ink;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={13} color={iconColor ?? fg} /> : null}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function Button({ label, icon, onPress, kind = 'primary', loading, disabled, style, compact }: ButtonProps) {
  const primary = kind === 'primary';
  const color = primary ? Colors.onDark : Colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        primary ? styles.primary : styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={color} /> : icon ? <Icon name={icon} size={compact ? 15 : 18} color={color} /> : null}
      <Text style={[styles.buttonText, compact && { fontSize: 13 }, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Tab-style toggle between a few fixed options
export function Segmented<T extends string | boolean>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[seg.row, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[seg.btn, on && seg.on]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[seg.text, on && seg.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: Colors.chip },
  btn: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: Colors.card },
  text: { fontSize: 14, color: Colors.muted },
  textOn: { fontWeight: '700', color: Colors.ink },
});

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  markerWrap: { alignSelf: 'flex-start' },
  marker: { position: 'absolute', left: -6, right: -8, bottom: 6, height: '38%', borderRadius: 6, backgroundColor: Colors.popSoft, transform: [{ rotate: '-1.5deg' }] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26, borderRadius: 999, alignSelf: 'flex-start' },
  chipText: { fontSize: 12 },
  button: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18 },
  buttonCompact: { height: 36, borderRadius: 18, paddingHorizontal: 12 },
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: Colors.line },
  buttonText: { fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#3C2814',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  track: { height: 5, borderRadius: 3, backgroundColor: Colors.chip, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: Colors.accent },
});
