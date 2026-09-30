import { StyleSheet, Text, View } from 'react-native';

import { Card, Display } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { useT, type Messages } from '@/i18n';
import type { TripStats } from '@/stats/tripStats';

export function statItems(s: TripStats, t: Messages) {
  return [
    { value: String(s.days), unit: t.stats.dayUnit(s.days), label: t.stats.days },
    { value: String(s.cities), unit: t.stats.cityUnit(s.cities), label: t.stats.cities },
    { value: String(s.km), unit: 'km', label: t.stats.distance },
    { value: String(s.photos), unit: t.stats.photoUnit(s.photos), label: t.stats.photos },
    { value: s.maxAltitude == null ? '-' : String(s.maxAltitude), unit: s.maxAltitude == null ? '' : 'm', label: t.stats.altitude },
    { value: s.earliest ?? '-', unit: '', label: t.stats.earliest },
  ];
}

export function StatsCard({ stats }: { stats: TripStats }) {
  const t = useT();
  return (
    <Card style={styles.grid}>
      {statItems(stats, t).map((it) => (
        <View key={it.label} style={styles.cell}>
          <Display style={styles.value}>
            {it.value}
            {it.unit ? <Text style={styles.unit}> {it.unit}</Text> : null}
          </Display>
          <Text style={styles.label}>{it.label}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, paddingVertical: 18 },
  cell: { width: '33.33%', alignItems: 'center' },
  value: { fontSize: 23, lineHeight: 30 },
  unit: { fontSize: 12 },
  label: { fontSize: 12, color: Colors.muted, marginTop: 2 },
});
