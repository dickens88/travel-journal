import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { LeafletMap, type LeafletMapHandle, type MapLine } from '@/components/map/LeafletMap';
import { Display, Icon } from '@/components/common/ui';
import { WeatherChip } from '@/components/trip/WeatherChip';
import { Colors } from '@/constants/theme';
import { getTrip, listDays, listPhotos } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import type { Stop } from '@/geo/cluster';
import type { LatLng } from '@/geo/distance';
import { useThumbs } from '@/photos/thumbs';
import { stopsFromPhotos } from '@/trip/derive';
import { formatDayLabel, localParts, tripDayNumber } from '@/utils/time';

// Bulge long flights into an arc so they read differently from ground legs
function arc(a: LatLng, b: LatLng, n = 24): LatLng[] {
  const c = { lat: (a.lat + b.lat) / 2 - (b.lng - a.lng) * 0.2, lng: (a.lng + b.lng) / 2 + (b.lat - a.lat) * 0.2 };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return { lat: u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng };
  });
}

function Legend() {
  return (
    <View style={styles.legend}>
      <View style={styles.legendRow}>
        <Svg width={26} height={6}><Line x1={2} y1={3} x2={24} y2={3} stroke={Colors.teal} strokeWidth={3} strokeLinecap="round" /></Svg>
        <Text style={styles.legendText}>步行</Text>
      </View>
      <View style={styles.legendRow}>
        <Svg width={26} height={6}><Line x1={2} y1={3} x2={24} y2={3} stroke={Colors.teal} strokeWidth={3} strokeDasharray="5 4" strokeLinecap="round" /></Svg>
        <Text style={styles.legendText}>乘车</Text>
      </View>
      <View style={styles.legendRow}>
        <Svg width={26} height={12}><Path d="M2 10 Q 13 -2 24 10" stroke={Colors.accent} strokeWidth={2.5} fill="none" strokeDasharray="2 4" strokeLinecap="round" /></Svg>
        <Text style={styles.legendText}>飞行</Text>
      </View>
    </View>
  );
}

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const map = useRef<LeafletMapHandle>(null);
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const days = useQuery(`listDays:${id}`, () => listDays(id));
  const [day, setDay] = useState<string | null>(null);

  const allStops = stopsFromPhotos(photos);
  const dates = [...new Set(allStops.map((s) => s.date))];
  const stops = day ? allStops.filter((s) => s.date === day) : allStops;
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  const weather = new Map(days.map((d) => [d.date, d]));
  const firstFiles = stops.map((s) => photoMap.get(s.photoIds[0])?.file).filter((f): f is string => !!f);
  const thumbs = useThumbs(firstFiles);
  if (!trip) return null;

  const lines: MapLine[] = stops.slice(0, -1).map((s, i) => {
    const t = s.toNext?.transport ?? 'transit';
    if (t === 'flight') return { points: arc(s, stops[i + 1]), color: Colors.accent, width: 3, dash: '2 8' };
    return { points: [s, stops[i + 1]], color: Colors.teal, width: 4, dash: t === 'transit' ? '8 8' : undefined };
  });
  const markers = stops.map((s, i) => {
    const file = photoMap.get(s.photoIds[0])?.file;
    return { id: s.id, lat: s.lat, lng: s.lng, label: String(i + 1), image: file ? thumbs[file] : undefined };
  });
  const km = (t: string) => stops.slice(0, -1).filter((s) => s.toNext?.transport === t).reduce((sum, s) => sum + (s.toNext?.km ?? 0), 0);
  const focus = (s: Stop) => map.current?.focus(s, 16);

  return (
    <View style={styles.screen}>
      <LeafletMap
        ref={map}
        style={StyleSheet.absoluteFill}
        markers={markers}
        lines={lines}
        padding={{ top: insets.top + 130, right: 50, bottom: 300, left: 50 }}
        onMarkerPress={(sid) => {
          const s = stops.find((x) => x.id === sid);
          if (s) focus(s);
        }}
      />

      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable style={styles.round} onPress={() => router.replace(`/trip/${id}`)} accessibilityLabel="返回旅行">
            <Icon name="back" size={20} />
          </Pressable>
          <View style={styles.titleChip}>
            <Display variant="subheading" style={{ fontSize: 16, lineHeight: 21 }} numberOfLines={1}>{trip.title}</Display>
            <Text style={{ fontSize: 12, color: Colors.muted }}>{allStops.length} 个停留点</Text>
          </View>
          <Pressable style={styles.round} onPress={() => map.current?.fit()} accessibilityLabel="显示全部">
            <Icon name="fit" size={20} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[null, ...dates].map((d) => {
            const on = d === day;
            const label = d ? `第${tripDayNumber(trip.start_date, d)}天` : '全部';
            return (
              <Pressable key={d ?? 'all'} onPress={() => setDay(d)} style={[styles.dayChip, on && { backgroundColor: Colors.ink }]}>
                <Text style={{ fontSize: 13, color: on ? Colors.onDark : Colors.ink }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={[styles.legendWrap, { bottom: 272 }]}>
        <Legend />
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Display>{day ? `第 ${tripDayNumber(trip.start_date, day)} 天 · ${formatDayLabel(day)}` : '全程'}</Display>
            <Text style={{ fontSize: 12, color: Colors.muted, marginTop: 2 }}>
              {stops.length} 个停留点 · 步行 {km('walk').toFixed(1)} km · 乘车 {km('transit').toFixed(1)} km
              {km('flight') ? ` · 飞行 ${Math.round(km('flight'))} km` : ''}
            </Text>
          </View>
          {day ? <WeatherChip day={weather.get(day)} /> : null}
        </View>
        {stops.length === 0 ? (
          <Text style={{ fontSize: 14, color: Colors.muted, paddingVertical: 20 }}>还没有带定位的照片</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
            {stops.map((s, i) => {
              const t = localParts(s.start, s.offsetMin);
              return (
                <Pressable key={s.id} style={{ width: 148, gap: 6 }} onPress={() => focus(s)}>
                  <PhotoThumb file={photoMap.get(s.photoIds[0])?.file} style={{ height: 96, borderRadius: 12 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{i + 1} · {s.placeName ?? '未知地点'}</Text>
                  <Text style={{ fontSize: 12, color: Colors.muted }}>{day ? t.hm : `${t.date.slice(5)} ${t.hm}`} · {s.photoIds.length} 张</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EFE8D8' },
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16, gap: 12 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', shadowColor: '#1E140A', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  titleChip: { flex: 1, height: 44, borderRadius: 22, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center', shadowColor: '#1E140A', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  dayChip: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: Colors.card, justifyContent: 'center' },
  legendWrap: { position: 'absolute', left: 16 },
  legend: { padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,253,248,0.94)', gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 12, color: Colors.ink },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingLeft: 20, gap: 12, backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#1E140A', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -6 } },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingRight: 20 },
});
