import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

const TABS = [
  { key: 'feed', label: '动态', path: '' },
  { key: 'journal', label: '游记', path: '/journal' },
  { key: 'map', label: '地图', path: '/map' },
] as const;

export type TripTab = (typeof TABS)[number]['key'];

export function TripTabs({ tripId, active }: { tripId: string; active: TripTab }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => !on && router.replace(`/trip/${tripId}${t.path}`)}>
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line, backgroundColor: Colors.paper },
  tab: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabOn: { borderBottomWidth: 3, borderBottomColor: Colors.accent },
  label: { fontFamily: Fonts.display, fontSize: 16, color: Colors.muted },
  labelOn: { color: Colors.accent },
});
