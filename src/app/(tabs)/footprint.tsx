import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Display, Icon } from '@/components/common/ui';
import { LeafletMap } from '@/components/map/LeafletMap';
import { Colors } from '@/constants/theme';
import { countTrips, listAllLocatedPhotos } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { computeFootprint } from '@/stats/footprint';

export default function FootprintScreen() {
  const insets = useSafeAreaInsets();
  const photos = useQuery('listAllLocatedPhotos', listAllLocatedPhotos);
  const tripCount = useQuery('countTrips', countTrips);
  const f = computeFootprint(photos);
  const byCountry = f.countries.map((c) => ({ country: c, regions: f.regions.filter((r) => r.country === c) }));
  const stats = [
    { v: tripCount, l: '段旅程' },
    { v: f.travelDays, l: '天在路上' },
    { v: photos.length, l: '张照片' },
    { v: f.cityCount, l: '座城市' },
  ];

  return (
    <ScrollView style={{ backgroundColor: Colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 16 }}>
      <View>
        <Display variant="hero" marker>足迹</Display>
        <Text style={styles.sub}>
          {f.countries.length} 个国家 · {f.regions.length} 个省级地区 · {f.cityCount} 座城市
        </Text>
      </View>
      <View style={styles.mapBox}>
        {f.cityPoints.length ? (
          <LeafletMap
            markers={f.cityPoints.map((c) => ({ id: c.key, lat: c.lat, lng: c.lng, label: c.name, kind: 'dot' as const }))}
            padding={{ top: 40, right: 60, bottom: 30, left: 30 }}
          />
        ) : (
          <View style={styles.mapEmpty}>
            <Icon name="map" size={44} color={Colors.muted} />
            <Text style={styles.sub}>添加带定位的照片后，去过的地方会出现在这里</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map((s) => (
          <Card key={s.l} style={styles.stat}>
            <Display variant="heading">{s.v}</Display>
            <Text style={{ fontSize: 11, color: Colors.muted }}>{s.l}</Text>
          </Card>
        ))}
      </View>
      {byCountry.map((g) => (
        <View key={g.country} style={{ gap: 10 }}>
          <Text style={styles.sub}>{g.country}</Text>
          {g.regions.map((r) => (
            <Card key={r.region} style={styles.row}>
              <Icon name="pin" size={18} color={Colors.accent} />
              <Text style={{ flex: 1, fontSize: 15, color: Colors.ink }}>
                {r.region}
                {r.cities.length ? ` · ${r.cities.join('、')}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.muted }}>{r.firstDate?.slice(0, 7).replace('-', '.')}</Text>
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, color: Colors.muted, marginTop: 4 },
  mapBox: { height: 280, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E4EDEE' },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
