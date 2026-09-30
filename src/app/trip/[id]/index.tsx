import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isUserTurn } from '@/ai/chatContent';
import { AskBuddyButton } from '@/components/buddy/AskBuddyButton';
import { Button, Display, Icon, ProgressBar } from '@/components/common/ui';
import { FeedItemView } from '@/components/trip/FeedItems';
import { JournalStatusCard } from '@/components/trip/JournalStatusCard';
import { TripTabs } from '@/components/trip/TripTabs';
import { WeatherChip } from '@/components/trip/WeatherChip';
import { Colors } from '@/constants/theme';
import { getJournal, getTrip, listChat, listDays, listNotes, listPhotos, pendingCounts, updateTrip } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { useT } from '@/i18n';
import { buildFeed } from '@/trip/feed';
import { useJobs } from '@/trip/jobs';
import { removeTrip } from '@/trip/remove';
import { formatDateDots, formatDayLabel, tripDayNumber } from '@/utils/time';

export default function TripFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const notes = useQuery(`listNotes:${id}`, () => listNotes(id));
  const chats = useQuery(`listChat:${id}`, () => listChat(id));
  const days = useQuery(`listDays:${id}`, () => listDays(id));
  const hasJournal = useQuery(`hasJournal:${id}`, () => !!getJournal(id));
  const pending = useQuery(`pendingCounts:${id}`, () => pendingCounts(id));
  const jobs = useJobs(id);
  const t = useT();
  const [renaming, setRenaming] = useState<string | null>(null);
  // Job progress re-renders this screen per photo; only rebuild when the data changes
  const feed = useMemo(() => buildFeed(photos, notes, chats), [photos, notes, chats]);
  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const weather = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const userTurns = useMemo(() => chats.filter(isUserTurn).length, [chats]);

  if (!trip) return null;

  const confirmDelete = () =>
    Alert.alert(t.trip.deleteTitle, t.trip.deleteText, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () => {
          removeTrip(id);
          router.back();
        },
      },
    ]);

  const openMenu = () =>
    Alert.alert(trip.title, undefined, [
      { text: t.trip.rename, onPress: () => setRenaming(trip.title) },
      { text: t.trip.deleteTrip, style: 'destructive', onPress: confirmDelete },
      { text: t.common.cancel, style: 'cancel' },
    ]);

  const saveName = () => {
    if (renaming?.trim()) updateTrip(id, { title: renaming.trim() });
    setRenaming(null);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={openMenu} accessibilityLabel={t.trip.more} hitSlop={10}>
              <Icon name="more" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 170 }} stickyHeaderIndices={[1]}>
        <View style={styles.header}>
          <Display variant="title">{trip.title}</Display>
          <Text style={styles.meta}>
            {t.trip.meta(formatDateDots(trip.start_date), photos.length, notes.length, userTurns)}
          </Text>
        </View>
        <TripTabs tripId={id} active="feed" />
        <View style={styles.body}>
          <JournalStatusCard tripId={id} hasJournal={hasJournal} hasPhotos={photos.length > 0} pending={pending} jobs={jobs} />
          {jobs.importing ? (
            <View style={styles.importing}>
              <Text style={styles.meta}>{t.trip.importing(jobs.importing.done, jobs.importing.total)}</Text>
              <ProgressBar value={jobs.importing.done / jobs.importing.total} />
            </View>
          ) : null}
          {feed.length === 0 && !jobs.importing ? (
            <View style={styles.empty}>
              <Icon name="footprints" size={44} color={Colors.muted} />
              <Display variant="subheading" style={{ marginTop: 8 }}>{t.trip.emptyTitle}</Display>
              <Text style={styles.meta}>{t.trip.emptyText}</Text>
            </View>
          ) : null}
          {feed.map((day) => {
            const n = tripDayNumber(trip.start_date, day.date);
            return (
              <View key={day.date} style={{ gap: 12 }}>
                <View style={styles.dayHead}>
                  <View style={styles.dayTitle}>
                    {n >= 1 ? <Display>{t.time.dayN(n)}</Display> : null}
                    <Text style={styles.dayDate}>{formatDayLabel(day.date, t)}</Text>
                  </View>
                  <WeatherChip day={weather.get(day.date)} />
                </View>
                {day.items.map((item) => (
                  <FeedItemView key={item.key} item={item} tripId={id} jobs={jobs} photos={photoMap} />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <AskBuddyButton
        onPress={() => router.push(`/trip/${id}/buddy`)}
        style={[styles.fab, { bottom: insets.bottom + 84 }]}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <Button kind="secondary" label={t.trip.addPhotos} icon="addPhoto" onPress={() => router.push(`/trip/${id}/pick`)} style={{ flex: 1 }} loading={!!jobs.importing} />
        <Button kind="secondary" label={t.trip.note} icon="note" onPress={() => router.push(`/trip/${id}/note`)} style={{ flex: 1 }} />
      </View>
      <Modal visible={renaming !== null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Display>{t.trip.renameTitle}</Display>
            <TextInput autoFocus value={renaming ?? ''} onChangeText={setRenaming} onSubmitEditing={saveName} style={styles.nameInput} accessibilityLabel={t.newTrip.name} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="secondary" label={t.common.cancel} onPress={() => setRenaming(null)} style={{ flex: 1 }} />
              <Button label={t.common.save} onPress={saveName} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,12,0.45)', justifyContent: 'center', padding: 28 },
  dialog: { backgroundColor: Colors.paper, borderRadius: 20, padding: 20, gap: 16 },
  nameInput: { height: 48, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.card, paddingHorizontal: 12, fontSize: 16, color: Colors.ink },
  screen: { flex: 1, backgroundColor: Colors.paper },
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  meta: { fontSize: 13, color: Colors.muted, marginTop: 4 },
  body: { padding: 20, paddingTop: 16, gap: 16 },
  importing: { gap: 6 },
  empty: { paddingVertical: 40, alignItems: 'center' },
  dayHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 6 },
  dayTitle: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dayDate: { fontSize: 13, color: Colors.muted },
  fab: { position: 'absolute', right: 20, height: 54, borderRadius: 27, shadowColor: Colors.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: Colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.line,
  },
});
