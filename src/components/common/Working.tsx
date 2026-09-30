import { useEffect, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

// Wobbles and breathes its children, for an icon that marks work in progress (e.g. the sparkle while photos are recognised).
// With `active` false the children sit still.
export function Pulse({ children, style, active = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; active?: boolean }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      v.value = 0;
      return;
    }
    v.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) })), -1);
    return () => cancelAnimation(v);
  }, [v, active]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * v.value, transform: [{ scale: 0.85 + 0.3 * v.value }, { rotate: `${-12 + 24 * v.value}deg` }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// A soft band of light sweeping down over its parent, like a scanner reading the picture below. Place inside a positioned container.
export function ScanSweep({ height, color = 'rgba(244,188,82,0.35)' }: { height: number; color?: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }), -1, true);
    return () => cancelAnimation(v);
  }, [v]);
  const band = Math.max(40, height * 0.18);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: -band + (height + band) * v.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.band, { height: band }, animated]}>
      <Animated.View style={[styles.glow, { backgroundColor: color }]} />
      <Animated.View style={[styles.line, { backgroundColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'flex-end' },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.35 },
  line: { height: 2, opacity: 1 },
});
