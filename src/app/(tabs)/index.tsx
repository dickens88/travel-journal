import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Display, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { listTrips, type TripSummary } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { formatTripRange, localParts, tripDayNumber } from '@/utils/time';

function tripMeta(t: TripSummary) {
  const lastDate = t.end_date ?? (t.last_taken ? localParts(t.last_taken).date : null);
  const end = lastDate && lastDate > t.start_date ? lastDate : null;
  const range = formatTripRange(t.start_date, end);
  const days = end ? tripDayNumber(t.start_date, end) : 1;
  return [range, `${days} 天`, `${t.photo_count} 张`];
}

function status(t: TripSummary) {
  if (!t.has_journal) return { label: t.photo_count ? '还没写游记' : '刚创建', accent: true };
  if (t.pending_count > 0) return { label: `${t.pending_count} 条新内容待写入`, accent: false };
  return { label: '游记已生成', accent: false };
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const trips = useQuery('listTrips', listTrips);
  const photoTotal = trips.reduce((s, t) => s + t.photo_count, 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 160, paddingHorizontal: 20, gap: 16 }}>
        <Text style={styles.brand}>旅迹</Text>
        <View>
          <Display variant="hero" marker>我的旅行</Display>
          <Text style={styles.sub}>{trips.length ? `${trips.length} 段旅程 · ${photoTotal} 张照片` : '把每段旅程的照片、随手记和聊天都收进来'}</Text>
        </View>
        {trips.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="suitcase" size={48} color={Colors.muted} />
            <Display variant="subheading" style={{ marginTop: 8 }}>还没有旅行</Display>
            <Text style={styles.sub}>新建一段旅行，照片可以边走边加</Text>
          </View>
        ) : null}
        {trips.map((t) => {
          const s = status(t);
          return (
            <Pressable key={t.id} style={styles.card} onPress={() => router.push(`/trip/${t.id}`)} accessibilityRole="button" accessibilityLabel={t.title}>
              <View>
                <PhotoThumb file={t.cover_file} style={styles.cover} />
                <View style={[styles.badge, s.accent && { backgroundColor: Colors.accent }]}>
                  <Text style={styles.badgeText}>{s.label}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Display variant="heading" numberOfLines={1}>{t.title}</Display>
                <View style={styles.metaRow}>
                  {tripMeta(t).map((m) => (
                    <Text key={m} style={styles.meta}>{m}</Text>
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button label="新建旅行" icon="add" onPress={() => router.push('/trip/new')} style={[styles.fab, { bottom: insets.bottom + 70 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.paper },
  brand: { fontFamily: Fonts.display, fontSize: 20, letterSpacing: 4, color: Colors.accent },
  sub: { fontSize: 14, color: Colors.muted, marginTop: 4 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  card: { backgroundColor: Colors.card, borderRadius: 20, overflow: 'hidden', shadowColor: '#3C2814', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  cover: { height: 168, width: '100%' },
  badge: { position: 'absolute', left: 14, top: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(20,16,12,0.6)' },
  badgeText: { color: Colors.onDark, fontSize: 12 },
  cardBody: { padding: 16, paddingTop: 14, gap: 6 },
  metaRow: { flexDirection: 'row', gap: 12 },
  meta: { fontSize: 13, color: Colors.muted },
  fab: { position: 'absolute', right: 20, shadowColor: Colors.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
});
