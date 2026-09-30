import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { describeError } from '@/ai/client';
import { parseJournal } from '@/ai/generateJournal';
import { Button, Card, Display, Segmented } from '@/components/common/ui';
import { cardSpecs, LongImage, XhsCard, type ShareData } from '@/components/share/ShareViews';
import { formatTags } from '@/components/trip/JournalEdit';
import { Colors } from '@/constants/theme';
import { getJournal, getTrip, listPhotos } from '@/db/repo';
import { useQuery } from '@/db/useQuery';
import { getT, useT } from '@/i18n';
import { deriveTrip } from '@/trip/derive';

async function saveToAlbum(uris: string[]) {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!granted) throw new Error(getT().share.needWritePermission);
  for (const uri of uris) await MediaLibrary.saveToLibraryAsync(uri);
}

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const t = useT();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const journalRow = useQuery(`getJournal:${id}`, () => getJournal(id));
  const [mode, setMode] = useState<'long' | 'cards'>('cards');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const longRef = useRef<View>(null);
  const cardRefs = useRef<(View | null)[]>([]);

  const journal = useMemo(() => parseJournal(journalRow?.content_json), [journalRow]);
  const derived = useMemo(() => deriveTrip(photos), [photos]);
  const data = useMemo<ShareData | null>(() => {
    if (!trip || !journal) return null;
    const photoMap = new Map(photos.map((p) => [p.id, p]));
    return { trip, journal, ...derived, photos: photoMap, cover: photoMap.get(trip.cover_photo_id ?? '') ?? photos[0] };
  }, [trip, journal, photos, derived]);
  const specs = useMemo(() => (journal ? cardSpecs(journal) : []), [journal]);
  if (!data || !journal) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.muted }}>{t.share.generateFirst}</Text>
      </View>
    );
  }
  const cardW = screenW - 90;
  const tags = formatTags(journal.xhs.tags);
  const caption = `${journal.xhs.title}\n\n${journal.xhs.body}\n\n${tags}`;

  const captureAll = async () => {
    if (mode === 'long') return [await captureRef(longRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' })];
    const out: string[] = [];
    for (const r of cardRefs.current.slice(0, specs.length)) {
      if (r) out.push(await captureRef(r, { format: 'jpg', quality: 0.92, width: 1080, height: 1440, result: 'tmpfile' }));
    }
    return out;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(t.share.failed, describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const uris = await captureAll();
      await saveToAlbum(uris);
      Alert.alert(t.share.savedToAlbum, mode === 'cards' ? t.share.cardsSaved(uris.length) : undefined);
    });

  const share = () =>
    run(async () => {
      if (mode === 'long') {
        const [uri] = await captureAll();
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: t.share.dialogTitle });
        return;
      }
      // The share sheet takes one file, so cards go through the album then Xiaohongshu
      const uris = await captureAll();
      await saveToAlbum(uris);
      await Clipboard.setStringAsync(caption);
      Alert.alert(t.share.postedTitle, t.share.postedText, [
        { text: t.common.later, style: 'cancel' },
        { text: t.share.openXhs, onPress: () => Linking.openURL('xhsdiscover://').catch(() => Alert.alert(t.share.noXhs)) },
      ]);
    });

  return (
    <View style={styles.screen}>
      <Segmented
        options={[{ value: 'long' as const, label: t.share.long }, { value: 'cards' as const, label: t.share.cards }]}
        value={mode}
        onChange={setMode}
        style={{ margin: 20, marginTop: 8 }}
      />
      {mode === 'long' ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 140 }}>
          <View style={styles.longFrame}>
            <LongImage ref={longRef} data={data} width={screenW - 40} />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
          <ScrollView
            horizontal
            snapToInterval={cardW + 12}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + 12)))}
            scrollEventThrottle={32}>
            {specs.map((s, i) => (
              <XhsCard key={i} spec={s} data={data} width={cardW} ref={(r) => { cardRefs.current[i] = r; }} />
            ))}
          </ScrollView>
          <Text style={styles.pager}>{Math.min(page + 1, specs.length)} / {specs.length}</Text>
          <Card style={{ marginHorizontal: 20, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: Colors.muted }}>{t.share.caption}</Text>
              <Button compact kind="secondary" icon="copy" label={t.share.copyCaption} onPress={() => Clipboard.setStringAsync(caption).then(() => Alert.alert(t.common.copied))} />
            </View>
            <Display variant="subheading" style={{ fontSize: 16 }}>{journal.xhs.title}</Display>
            <Text style={{ fontSize: 13, lineHeight: 21, color: Colors.inkSoft }} numberOfLines={4}>{journal.xhs.body}</Text>
            <Text style={{ fontSize: 13, color: Colors.teal }}>{tags}</Text>
          </Card>
        </ScrollView>
      )}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" icon="download" label={t.share.saveToAlbum} onPress={save} disabled={busy} style={{ flex: 1 }} />
          <Button icon="share" label={mode === 'long' ? t.share.shareTo : t.share.postXhs} onPress={share} loading={busy} style={{ flex: 1 }} />
        </View>
        <Text style={styles.hint}>{mode === 'long' ? t.share.longHint : t.share.cardsHint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.paper },
  longFrame: { borderRadius: 16, overflow: 'hidden', shadowColor: '#1E140A', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  pager: { textAlign: 'center', fontSize: 12, color: Colors.muted, marginVertical: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, gap: 6, backgroundColor: Colors.paper },
  hint: { textAlign: 'center', fontSize: 12, color: Colors.muted },
});
