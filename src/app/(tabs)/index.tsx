import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Display, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { listTrips, type TripSummary } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { useT, type Messages } from '@/i18n';
import { formatTripRange, localParts, tripDayNumber } from '@/utils/time';

function tripMeta(trip: TripSummary, t: Messages) {
  const lastDate = trip.end_date ?? (trip.last_taken ? localParts(trip.last_taken).date : null);
  const end = lastDate && lastDate > trip.start_date ? lastDate : null;
  const range = formatTripRange(trip.start_date, end, t);
  const days = end ? tripDayNumber(trip.start_date, end) : 1;
  return [range, t.trips.days(days), t.trips.photos(trip.photo_count)];
}

function status(trip: TripSummary, t: Messages) {
  if (!trip.has_journal) return { label: trip.photo_count ? t.trips.noJournal : t.trips.justCreated, accent: true };
  if (trip.pending_count > 0) return { label: t.trips.pending(trip.pending_count), accent: false };
  return { label: t.trips.journalDone, accent: false };
}

export default function TripsScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const trips = useQuery('listTrips', listTrips);
  const photoTotal = trips.reduce((sum, trip) => sum + trip.photo_count, 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 160, paddingHorizontal: 20, gap: 16 }}>
        <Text style={styles.brand}>{t.common.appName}</Text>
        <View>
          <Display variant="hero" marker>{t.trips.title}</Display>
          <Text style={styles.sub}>{trips.length ? t.trips.summary(trips.length, photoTotal) : t.trips.intro}</Text>
        </View>
        {trips.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="suitcase" size={48} color={Colors.muted} />
            <Display variant="subheading" style={{ marginTop: 8 }}>{t.trips.emptyTitle}</Display>
            <Text style={styles.sub}>{t.trips.emptyText}</Text>
          </View>
        ) : null}
        {trips.map((trip) => {
          const s = status(trip, t);
          return (
            <Pressable key={trip.id} style={styles.card} onPress={() => router.push(`/trip/${trip.id}`)} accessibilityRole="button" accessibilityLabel={trip.title}>
              <View>
                <PhotoThumb file={trip.cover_file} style={styles.cover} />
                <View style={[styles.badge, s.accent && { backgroundColor: Colors.accent }]}>
                  <Text style={styles.badgeText}>{s.label}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Display variant="heading" numberOfLines={1}>{trip.title}</Display>
                <View style={styles.metaRow}>
                  {tripMeta(trip, t).map((m) => (
                    <Text key={m} style={styles.meta}>{m}</Text>
                  ))}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button label={t.trips.newTrip} icon="add" onPress={() => router.push('/trip/new')} style={[styles.fab, { bottom: insets.bottom + 70 }]} />
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
