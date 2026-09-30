import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseJournal } from '@/ai/generateJournal';
import type { Journal } from '@/ai/schemas';
import { AskBuddyButton } from '@/components/buddy/AskBuddyButton';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Display, Icon, Serif, type IconName } from '@/components/common/ui';
import { EditBox, EditPhotos, XhsEditor } from '@/components/trip/JournalEdit';
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

type Section = Journal['days'][number]['sections'][number];

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

  // Leaving the page mid-edit keeps what was typed
  const latestDraft = useRef<Journal | null>(null);
  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  useEffect(
    () => () => {
      if (latestDraft.current) saveJournal(id, latestDraft.current);
    },
    [id],
  );

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

  const edit = (patch: Partial<Journal>) => setDraft((j) => j && { ...j, ...patch });

  // `null` deletes the section, and the day with it once it has none left
  const editSection = (d: number, s: number, patch: Partial<Section> | null) =>
    setDraft(
      (j) =>
        j && {
          ...j,
          days: j.days
            .map((day, i) =>
              i !== d ? day : { ...day, sections: patch ? day.sections.map((sec, k) => (k !== s ? sec : { ...sec, ...patch })) : day.sections.filter((_, k) => k !== s) },
            )
            .filter((day) => day.sections.length),
        },
    );

  const deleteSection = (d: number, s: number, heading: string) =>
    Alert.alert('删除这一节？', heading ? `「${heading}」的文字会从游记里去掉，照片还在旅行里。` : undefined, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => editSection(d, s, null) },
    ]);

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
              {journal && !jobs.generating ? (
                <Pressable style={[styles.round, { width: 'auto', paddingHorizontal: 14 }, editing && { backgroundColor: Colors.accent }]} onPress={toggleEdit} accessibilityRole="button">
                  <Text style={{ fontSize: 14, fontWeight: '600', color: editing ? Colors.onDark : Colors.ink }}>{editing ? '完成' : '编辑'}</Text>
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
            {editing ? (
              <TextInput value={draft.title} onChangeText={(title) => edit({ title })} placeholder="游记标题" placeholderTextColor="rgba(255,253,248,0.6)" style={styles.titleEdit} accessibilityLabel="游记标题" />
            ) : (
              <Display variant="title" style={{ color: Colors.onDark, fontSize: 30, lineHeight: 40 }}>{journal?.title ?? trip.title}</Display>
            )}
          </View>
        </View>
        <TripTabs tripId={id} active="journal" />
        <View style={styles.body}>
          <StatsCard stats={stats} />
          {/* Regenerating mid-edit would be overwritten by the draft on 完成 */}
          {editing ? (
            <Text style={styles.muted}>点文字直接修改，改完点右上角「完成」。重新生成游记时会尽量保留你改过的内容。</Text>
          ) : (
            <JournalStatusCard tripId={id} hasJournal={!!journal} hasPhotos={photos.length > 0} pending={pending} jobs={jobs} />
          )}
          {editing ? (
            <EditBox value={draft.summary} onChangeText={(summary) => edit({ summary })} placeholder="全程概述" style={styles.summary} />
          ) : journal?.summary ? (
            <Serif style={styles.summary}>{journal.summary}</Serif>
          ) : null}
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
                        {editing ? (
                          <>
                            <EditBox value={sec.heading} onChangeText={(heading) => editSection(di, si, { heading })} placeholder="小标题" multiline={false} style={styles.headingEdit} />
                            <Pressable onPress={() => deleteSection(di, si, sec.heading)} hitSlop={8} accessibilityRole="button" accessibilityLabel="删除这一节">
                              <Text style={styles.delete}>删除</Text>
                            </Pressable>
                          </>
                        ) : (
                          <Display variant="subheading" style={{ flex: 1 }}>{sec.heading}</Display>
                        )}
                      </View>
                      {editing ? (
                        <>
                          <EditBox value={sec.text} onChangeText={(text) => editSection(di, si, { text })} style={styles.para} />
                          <EditPhotos photos={secPhotos} onRemove={(pid) => editSection(di, si, { photo_ids: sec.photo_ids.filter((x) => x !== pid) })} />
                        </>
                      ) : (
                        <>
                          <Serif style={styles.para}>{sec.text}</Serif>
                          <JournalPhotos photos={secPhotos} />
                        </>
                      )}
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
          {editing ? <XhsEditor xhs={draft.xhs} onChange={(xhs) => edit({ xhs })} /> : null}
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <AskBuddyButton kind="secondary" onPress={() => router.push(`/trip/${id}/buddy`)} style={{ flex: 1 }} />
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
  titleEdit: { fontFamily: Fonts.display, color: Colors.onDark, fontSize: 28, paddingVertical: 4, borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,253,248,0.7)' },
  headingEdit: { flex: 1, fontFamily: Fonts.display, fontSize: 18, lineHeight: 24, paddingVertical: 6, paddingHorizontal: 10 },
  delete: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
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
