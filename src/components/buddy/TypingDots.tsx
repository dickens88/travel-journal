import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const PHRASES = ['想一想…', '翻翻你的照片和足迹…', '查查资料…', '组织一下语言…'];

function Dot({ delay, size }: { delay: number; size: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 }), withTiming(0, { duration: 260 })), -1));
    return () => cancelAnimation(v);
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value, transform: [{ translateY: -size * 0.6 * v.value }] }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.accent }, style]} />;
}

export function Dots({ size = 7 }: { size?: number }) {
  return (
    <View style={[styles.dots, { gap: size * 0.7, paddingTop: size * 0.6 }]}>
      {[0, 150, 300].map((d) => (
        <Dot key={d} delay={d} size={size} />
      ))}
    </View>
  );
}

// Bouncing dots with a hint that changes every few seconds; pass `label` to pin one hint
export function TypingDots({ label }: { label?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setN((x) => (x + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
  }, [label]);
  return (
    <View style={styles.row} accessibilityLabel="搭子正在回复" accessibilityLiveRegion="polite">
      <Dots />
      <Text style={styles.label}>{label ?? PHRASES[n]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { flexDirection: 'row', alignItems: 'center', height: 16 },
  label: { fontSize: 14, color: Colors.muted },
});
