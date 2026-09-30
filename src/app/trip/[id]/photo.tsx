import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskBuddyButton } from '@/components/buddy/AskBuddyButton';
import { Dots } from '@/components/buddy/TypingDots';
import { Button, Icon } from '@/components/common/ui';
import { Pulse, ScanSweep } from '@/components/common/Working';
import { LeafletMap } from '@/components/map/LeafletMap';
import { Colors } from '@/constants/theme';
import { listPhotos } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { useT } from '@/i18n';
import { locationLabel, photoDetails } from '@/photos/describe';
import { nameLocation } from '@/photos/importPhotos';
import { photoUri } from '@/photos/storage';
import { photoAnalysis } from '@/trip/derive';
import { photoGroups } from '@/trip/feed';
import { useJobs } from '@/trip/jobs';
import { recognizePhotos } from '@/trip/recognize';

export default function PhotoViewer() {
  const { id, photo } = useLocalSearchParams<{ id: string; photo: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const all = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const jobs = useJobs(id);
  const t = useT();
  // Page through the photos of the tapped feed card
  const photos = useMemo(() => photoGroups(all).find((g) => g.photos.some((p) => p.id === photo))?.photos ?? [], [all, photo]);
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === photo)));
  const [immersive, setImmersive] = useState(false);
  const [pageHeight, setPageHeight] = useState(0);
  const current = photos[index];

  // The geocoder may have been offline during import; try again for the photo on screen
  useEffect(() => {
    if (current) nameLocation(current);
  }, [current]);

  if (!current) return null;

  const where = locationLabel(current, t);
  const caption = photoAnalysis(current)?.caption;
  const details = photoDetails(current, t);
  const located = current.lat != null && current.lng != null;
  const scanning = !!jobs.analyzing && !current.analysis_json;
  // One tap: the buddy describes the scene; the other attaches the photo and waits for the user's question
  const askBuddy = (ask?: 'describe') =>
    router.push({ pathname: '/trip/[id]/buddy', params: { id, photo: current.id, ...(ask ? { ask } : {}) } });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" hidden={immersive} />
      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}>
        {pageHeight ? (
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Pressable onPress={() => setImmersive((v) => !v)} style={{ width, height: pageHeight }} accessibilityLabel={immersive ? t.photo.showInfo : t.photo.hideInfo}>
                <Image source={{ uri: photoUri(item.file) }} style={StyleSheet.absoluteFill} contentFit="contain" recyclingKey={item.id} transition={120} />
              </Pressable>
            )}
          />
        ) : null}
        {scanning && pageHeight ? <ScanSweep height={pageHeight} /> : null}
      </View>

      {immersive ? null : (
        <>
          <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t.common.close} style={styles.close}>
              <Icon name="close" size={22} color={Colors.onDark} duo={null} />
            </Pressable>
            {photos.length > 1 ? <Text style={styles.counter}>{index + 1} / {photos.length}</Text> : null}
          </View>
          <View style={styles.panel}>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
              <View style={styles.whereRow}>
                <Icon name="pin" size={16} color={located ? Colors.pop : Colors.muted} duo={null} />
                <Text style={styles.where} numberOfLines={2}>{where ?? t.photo.noLocation}</Text>
              </View>
              {caption ? <Text style={styles.caption}>{caption}</Text> : null}
              {!current.analysis_json ? (
                <View style={styles.recognize}>
                  <Pulse active={!!jobs.analyzing}>
                    <Icon name="sparkle" size={14} color={Colors.pop} duo={null} />
                  </Pulse>
                  <Text style={styles.recognizeText} numberOfLines={3}>
                    {jobs.analyzing ? t.photo.analyzing(jobs.analyzing.done, jobs.analyzing.total) : jobs.error ? `${jobs.error.title}: ${jobs.error.message}` : t.photo.notAnalyzed}
                  </Text>
                  {jobs.analyzing ? (
                    <Dots size={5} />
                  ) : (
                    <Pressable onPress={() => recognizePhotos(id)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.recognizeBtn}>{jobs.error ? t.common.retry : t.photo.recognize}</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
              {located ? (
                <Pressable onPress={() => router.push(`/trip/${id}/map`)} style={styles.map} accessibilityLabel={t.photo.viewOnMap}>
                  {/* Static preview: taps open the trip map instead of panning this one */}
                  <View pointerEvents="none" style={{ flex: 1 }}>
                    <LeafletMap markers={[{ id: current.id, lat: current.lat!, lng: current.lng!, label: where ?? '', kind: 'dot' }]} />
                  </View>
                </Pressable>
              ) : null}
              <View style={{ gap: 6 }}>
                {details.map((d) => (
                  <View key={d.label} style={styles.detail}>
                    <Text style={styles.label}>{d.label}</Text>
                    <Text style={styles.value}>{d.value}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            {/* Pinned below the details so the buddy actions stay in reach */}
            <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
              <Button compact icon="sparkle" label={t.photo.askDescribe} onPress={() => askBuddy('describe')} style={{ flex: 1 }} />
              <AskBuddyButton compact kind="secondary" onPress={() => askBuddy()} style={{ flex: 1 }} />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  counter: { color: Colors.onDark, fontSize: 14, fontVariant: ['tabular-nums'], paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { maxHeight: '48%', backgroundColor: '#15120F' },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  where: { flex: 1, color: Colors.onDark, fontSize: 16, fontWeight: '500' },
  caption: { color: '#D9D1C4', fontSize: 14, lineHeight: 21 },
  recognize: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(244,188,82,0.12)' },
  recognizeText: { flex: 1, color: '#D9D1C4', fontSize: 13, lineHeight: 18 },
  recognizeBtn: { color: Colors.pop, fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3A342D' },
  map: { height: 130, borderRadius: 12, overflow: 'hidden' },
  detail: { flexDirection: 'row', gap: 12 },
  label: { width: 64, color: '#8F867A', fontSize: 13 },
  value: { flex: 1, color: '#E9E2D6', fontSize: 13, lineHeight: 19 },
});
