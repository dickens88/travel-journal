import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseJournal } from '@/ai/generateJournal';
import type { Journal } from '@/ai/schemas';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Display, Icon, Serif, type IconName } from '@/components/common/ui';
import { JournalPhotos } from '@/components/trip/JournalPhotos';
import { JournalStatusCard } from '@/components/trip/JournalStatusCard';
import { StatsCard } from '@/components/trip/StatsCard';
import { TripTabs } from '@/components/trip/TripTabs';
import { WeatherChip } from '@/components/trip/WeatherChip';
import { Colors, Fonts } from '@/constants/theme';
import { getJournal, getTrip, listDays, listPhotos, pendingCounts, saveJournal } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { TRANSPORT_LABEL } from '@/geo/transport';
import { deriveTrip } from '@/trip/derive';
import { useJobs } from '@/trip/jobs';
import { formatDayLabel, formatTripRange, tripDayNumber } from '@/utils/time';

const TRANSPORT_ICON: Record<string, IconName> = { walk: 'walk', transit: 'bus', flight: 'flight' };

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const days = useQuery(`listDays:${id}`, () => listDays(id));
  const journalRow = useQuery(`getJournal:${id}`, () => getJournal(id));
  const pending = useQuery(`pendingCounts:${id}`, () => pendingCounts(id));
  const jobs = useJobs(id);
  const [draft, setDraft] = useState<Journal | null>(null);
  const saved = useMemo(() => parseJournal(journalRow?.content_json), [journalRow]);
  const { stops, stats } = useMemo(() => deriveTrip(photos), [photos]);
  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const stopByPhoto = useMemo(() => new Map(stops.flatMap((s) => s.photoIds.map((pid) => [pid, s] as const))), [stops]);

  if (!trip) return null;
  const journal = draft ?? saved;
  const weather = new Map(days.map((d) => [d.date, d]));
  const cover = photoMap.get(trip.cover_photo_id ?? '') ?? photos[0];
  const cities = [...new Set(photos.map((p) => p.city).filter(Boolean))].slice(0, 3).join(' ');
  const editing = draft !== null;

  const toggleEdit = () => {
    if (editing) {
      saveJournal(id, draft);
      setDraft(null);
    } else if (journal) {
      setDraft(journal);
    }
  };

  const editSection = (d: number, s: number, text: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      days: draft.days.map((day, i) => (i !== d ? day : { ...day, sections: day.sections.map((sec, j) => (j !== s ? sec : { ...sec, text })) })),
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} stickyHeaderIndices={[1]} keyboardShouldPersistTaps="handled">
        <View style={styles.cover}>
          <PhotoThumb file={cover?.file} style={StyleSheet.absoluteFill} />
          <View style={styles.shade} />
          <View style={[styles.topBar, { top: insets.top + 6 }]}>
            <Pressable style={styles.round} onPress={() => router.back()} accessibilityLabel="返回">
              <Icon name="back" size={20} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {journal ? (
                <Pressable style={[styles.round, { width: 'auto', paddingHorizontal: 14 }]} onPress={toggleEdit} accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{editing ? '完成' : '编辑'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.round} onPress={() => router.push(`/trip/${id}/share`)} accessibilityLabel="分享">
                <Icon name="share" size={20} />
              </Pressable>
            </View>
          </View>
          <View style={styles.coverText}>
            <Text style={{ color: Colors.onDark, fontSize: 13 }}>
              {formatTripRange(trip.start_date, trip.end_date)}
              {cities ? ` · ${cities}` : ''}
            </Text>
            <Display variant="title" style={{ color: Colors.onDark, fontSize: 30, lineHeight: 40 }}>{journal?.title ?? trip.title}</Display>
          </View>
        </View>
        <TripTabs tripId={id} active="journal" />
        <View style={styles.body}>
          <StatsCard stats={stats} />
          <JournalStatusCard tripId={id} hasJournal={!!journal} hasPhotos={photos.length > 0} pending={pending} jobs={jobs} />
          {journal?.summary ? <Serif style={styles.summary}>{journal.summary}</Serif> : null}
          {journal?.days.map((day, di) => {
            const n = tripDayNumber(trip.start_date, day.date);
            return (
              <View key={day.date + di} style={{ gap: 16 }}>
                <View style={styles.dayHead}>
                  <View>
                    <Display variant="title" style={{ fontSize: 24, lineHeight: 32 }}>{n >= 1 ? `第 ${n} 天` : day.date}</Display>
                    <Text style={styles.muted}>{formatDayLabel(day.date)}</Text>
                  </View>
                  <WeatherChip day={weather.get(day.date)} />
                </View>
                {day.sections.map((sec, si) => {
                  const secPhotos = sec.photo_ids.map((pid) => photoMap.get(pid)).filter((p) => !!p);
                  const stop = sec.photo_ids.map((pid) => stopByPhoto.get(pid)).find(Boolean);
                  const nextSec = day.sections[si + 1];
                  const nextStop = nextSec?.photo_ids.map((pid) => stopByPhoto.get(pid)).find(Boolean);
                  const leg = stop?.toNext && nextStop && nextStop.id !== stop.id ? stop.toNext : null;
                  return (
                    <View key={si} style={{ gap: 12 }}>
                      <View style={styles.secHead}>
                        <View style={styles.dot}>
                          <Text style={styles.dotText}>{si + 1}</Text>
                        </View>
                        <Display variant="subheading" style={{ flex: 1 }}>{sec.heading}</Display>
                      </View>
                      {editing ? (
                        <TextInput multiline value={sec.text} onChangeText={(t) => editSection(di, si, t)} style={[styles.para, styles.paraEdit]} />
                      ) : (
                        <Serif style={styles.para}>{sec.text}</Serif>
                      )}
                      <JournalPhotos photos={secPhotos} />
                      {leg ? (
                        <View style={styles.leg}>
                          <View style={styles.legLine} />
                          <Icon name={TRANSPORT_ICON[leg.transport]} size={20} color={Colors.teal} />
                          <Text style={{ fontSize: 13, color: Colors.teal }}>
                            {TRANSPORT_LABEL[leg.transport]} {leg.km.toFixed(1)} km{leg.minutes ? ` · ${Math.round(leg.minutes)} 分钟` : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <Button kind="secondary" label="问搭子" icon="chat" onPress={() => router.push(`/trip/${id}/buddy`)} style={{ flex: 1 }} />
        <Button label="分享游记" icon="share" onPress={() => router.push(`/trip/${id}/share`)} style={{ flex: 1 }} disabled={!journal} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.paper },
  cover: { height: 340, backgroundColor: '#2F3B4C' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, backgroundColor: 'rgba(20,16,12,0.45)' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,253,248,0.92)', alignItems: 'center', justifyContent: 'center' },
  coverText: { position: 'absolute', left: 20, right: 20, bottom: 22, gap: 6 },
  body: { padding: 20, gap: 18 },
  summary: { fontSize: 15, lineHeight: 26, color: Colors.inkSoft },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10 },
  muted: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  dotText: { fontFamily: Fonts.display, color: Colors.onDark, fontSize: 14 },
  para: { fontSize: 16, lineHeight: 30 },
  paraEdit: { fontFamily: Fonts.serif, color: Colors.ink, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12 },
  legLine: { width: 2, height: 36, borderRadius: 1, backgroundColor: Colors.tealSoft },
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
