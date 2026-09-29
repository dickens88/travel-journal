import { StyleSheet, Text, View } from 'react-native';

import { Card, Display } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import type { TripStats } from '@/stats/tripStats';

export function statItems(s: TripStats) {
  return [
    { value: String(s.days), unit: '天', label: '在路上' },
    { value: String(s.cities), unit: '座', label: '城市' },
    { value: String(s.km), unit: 'km', label: '总里程' },
    { value: String(s.photos), unit: '张', label: '照片' },
    { value: s.maxAltitude == null ? '-' : String(s.maxAltitude), unit: s.maxAltitude == null ? '' : 'm', label: '最高海拔' },
    { value: s.earliest ?? '-', unit: '', label: '最早出发' },
  ];
}

export function StatsCard({ stats }: { stats: TripStats }) {
  return (
    <Card style={styles.grid}>
      {statItems(stats).map((it) => (
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
