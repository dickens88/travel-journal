import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { createSignal } from '@/utils/signal';

type Toast = { id: number; ok: boolean; text: string };

let current: Toast | null = null;
let nextId = 0;
const changed = createSignal();

// Shows a short message near the bottom of the screen that fades away on its own. A newer toast replaces the one showing.
export function toast(text: string, ok = true) {
  current = { id: ++nextId, ok, text };
  changed.notify();
}

// Mounted once in the root layout, above every screen
export function ToastHost() {
  const t = useSyncExternalStore(changed.subscribe, () => current);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!t) return;
    // Errors tend to be longer and matter more, so they stay up a little longer
    const timer = setTimeout(() => {
      if (current?.id === t.id) {
        current = null;
        changed.notify();
      }
    }, t.ok ? 2000 : 3500);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <Animated.View
      key={t.id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="none"
      style={[styles.toast, { bottom: insets.bottom + 90, backgroundColor: t.ok ? Colors.ink : Colors.accent }]}>
      <Text style={styles.text}>{t.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22 },
  text: { color: Colors.onDark, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
