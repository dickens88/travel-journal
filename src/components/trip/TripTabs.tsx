import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useT } from '@/i18n';

const TABS = [
  { key: 'feed', path: '' },
  { key: 'journal', path: '/journal' },
  { key: 'map', path: '/map' },
] as const;

export type TripTab = (typeof TABS)[number]['key'];

export function TripTabs({ tripId, active }: { tripId: string; active: TripTab }) {
  const t = useT();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => !on && router.replace(`/trip/${tripId}${tab.path}`)}>
            <Text style={[styles.label, on && styles.labelOn]}>{t.trip.tabs[tab.key]}</Text>
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
