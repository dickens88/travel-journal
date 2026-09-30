import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Card, Chip, Icon, Serif } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { deleteNote } from '@/db/repo';
import type { Photo } from '@/db/types';
import { lightingText } from '@/geo/lighting';
import { useT } from '@/i18n';
import { cameraSummary, photoExif } from '@/photos/describe';
import { useSettings } from '@/settings/settings';
import { photoAnalysis } from '@/trip/derive';
import type { FeedItem } from '@/trip/feed';
import type { TripJobs } from '@/trip/jobs';
import { recognizePhotos } from '@/trip/recognize';
import { localParts } from '@/utils/time';

function Time({ hm }: { hm: string }) {
  return <Text style={styles.time}>{hm}</Text>;
}

function openPhoto(tripId: string, photoId: string) {
  router.push({ pathname: '/trip/[id]/photo', params: { id: tripId, photo: photoId } });
}

function PhotoStrip({ photos, tripId }: { photos: Photo[]; tripId: string }) {
  const t = useT();
  const shown = photos.slice(0, photos.length > 4 ? 3 : 4);
  return (
    <View style={styles.strip}>
      {shown.map((p) => (
        <Pressable key={p.id} onPress={() => openPhoto(tripId, p.id)} style={styles.thumb} accessibilityRole="imagebutton" accessibilityLabel={t.feed.viewPhoto}>
          <PhotoThumb file={p.file} style={StyleSheet.absoluteFill} />
          {p.lat != null ? (
            <View style={styles.pin}>
              <Icon name="pin" size={11} color={Colors.onDark} duo={null} />
            </View>
          ) : null}
        </Pressable>
      ))}
      {photos.length > 4 ? (
        <Pressable onPress={() => openPhoto(tripId, photos[3].id)} style={[styles.thumb, styles.more]} accessibilityRole="button" accessibilityLabel={t.feed.morePhotos}>
          <Text style={styles.moreText}>+{photos.length - 3}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Country and city rather than coordinates; spot names only when the area is still unknown
function PhotoMeta({ photos, area, places }: { photos: Photo[]; area: string | null; places: string[] }) {
  const t = useT();
  const located = photos.filter((p) => p.lat != null);
  let where = area ?? places.slice(0, 2).join(t.common.listSep);
  if (where && located.length && located.every((p) => p.loc_estimated)) where = t.photo.about(where);
  const missing = photos.length - located.length;

  const times = photos.flatMap((p) => (p.taken_at != null ? [localParts(p.taken_at, p.offset_min).hm] : []));
  const range = times.length > 1 && times[0] !== times[times.length - 1] ? `${times[0]}–${times[times.length - 1]}` : times[0];
  const tags = [...new Set(photos.map((p) => p.lighting_tag).filter((v): v is string => !!v))].slice(0, 2);
  const light = tags.map((tag) => lightingText(tag, t)).join(t.common.listSep);
  const camera = photos.length === 1 ? cameraSummary(photoExif(photos[0]), t) : '';
  const caption = photos.length === 1 ? photoAnalysis(photos[0])?.caption : undefined;
  const info = [range ? t.feed.takenAt(range) : null, light, camera].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 3 }}>
      <View style={styles.metaRow}>
        <Icon name="pin" size={13} color={where ? Colors.accent : Colors.muted} duo={null} />
        <Text style={[styles.sub, { flex: 1 }]} numberOfLines={1}>
          {where || (located.length ? t.feed.placePending : t.feed.noLocation)}
          {where && missing ? t.feed.unlocated(missing) : ''}
        </Text>
      </View>
      {caption ? <Text style={styles.caption} numberOfLines={2}>{caption}</Text> : null}
      {info ? <Text style={styles.sub} numberOfLines={1}>{info}</Text> : null}
    </View>
  );
}

function PhotosCard({ item, jobs, tripId }: { item: Extract<FeedItem, { kind: 'photos' }>; jobs: TripJobs; tripId: string }) {
  const t = useT();
  const unanalyzed = item.photos.filter((p) => !p.analysis_json).length;
  const included = item.photos.every((p) => p.journal_included_at != null);
  let chip = null;
  if (unanalyzed && jobs.analyzing) chip = <Chip tone="accent" icon="sparkle" busy label={t.feed.recognizing(item.photos.length - unanalyzed, item.photos.length)} />;
  else if (unanalyzed)
    chip = (
      <Pressable onPress={() => recognizePhotos(tripId)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.feed.recognizeA11y(unanalyzed)}>
        <Chip tone="accent" icon="sparkle" label={t.feed.recognize(unanalyzed)} />
      </Pressable>
    );
  else if (included) chip = <Text style={styles.done}>{t.feed.inJournal}</Text>;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.headRow}>
        <Icon name="photos" size={20} color={Colors.inkSoft} />
        <Text style={styles.headText}>{t.feed.photosAdded(item.photos.length)}</Text>
        {chip}
      </View>
      <PhotoStrip photos={item.photos} tripId={tripId} />
      <PhotoMeta photos={item.photos} area={item.area} places={item.places} />
    </Card>
  );
}

function NoteCard({ item }: { item: Extract<FeedItem, { kind: 'note' }> }) {
  const t = useT();
  const n = item.note;
  const confirmDelete = () =>
    Alert.alert(t.feed.deleteNote, n.text, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => deleteNote(n.id) },
    ]);
  return (
    <Pressable onLongPress={confirmDelete}>
      <Card style={{ flexDirection: 'row', gap: 10 }}>
        <Icon name="note" size={22} color={Colors.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <Serif style={{ fontSize: 15, lineHeight: 25 }}>“{n.text}”</Serif>
          <Text style={styles.sub}>
            {t.feed.note}{n.source === 'buddy' ? t.feed.fromBuddy : ''}
            {n.place_name ? ` · ${n.place_name}` : ''}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function ChatCard({ item, tripId, photos }: { item: Extract<FeedItem, { kind: 'chat' }>; tripId: string; photos: Map<string, Photo> }) {
  const { buddyAvatar } = useSettings();
  const t = useT();
  const photo = item.photoId ? photos.get(item.photoId) : undefined;
  return (
    <Pressable onPress={() => router.push(`/trip/${tripId}/buddy`)} accessibilityRole="button">
      <Card style={{ gap: 8 }}>
        <View style={styles.headRow}>
          <BuddyAvatar value={buddyAvatar} size={22} />
          <Text style={[styles.headText, { color: Colors.teal, fontSize: 13 }]}>{t.feed.chatTurns(Math.max(item.turns, 1))}</Text>
          <Icon name="next" size={14} color={Colors.muted} duo={null} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {photo ? <PhotoThumb file={photo.file} style={{ width: 52, height: 52, borderRadius: 10 }} /> : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.question} numberOfLines={2}>{item.question || t.feed.photoOnly}</Text>
            {item.answer ? <Text style={styles.answer} numberOfLines={2}>{t.feed.buddySaid(item.answer)}</Text> : null}
          </View>
        </View>
        {item.usedSearch || item.savedNotes ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {item.usedSearch ? <Chip tone="teal" icon="web" label={t.feed.webSearch} /> : null}
            {item.savedNotes ? <Chip tone="accent" icon="note" label={t.feed.notesSaved(item.savedNotes)} /> : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function FeedItemView({ item, tripId, jobs, photos }: { item: FeedItem; tripId: string; jobs: TripJobs; photos: Map<string, Photo> }) {
  return (
    <View style={styles.row}>
      <Time hm={item.hm} />
      <View style={{ flex: 1 }}>
        {item.kind === 'photos' ? <PhotosCard item={item} jobs={jobs} tripId={tripId} /> : null}
        {item.kind === 'note' ? <NoteCard item={item} /> : null}
        {item.kind === 'chat' ? <ChatCard item={item} tripId={tripId} photos={photos} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  time: { width: 40, paddingTop: 15, fontSize: 12, color: Colors.muted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.ink },
  sub: { fontSize: 12, color: Colors.muted },
  done: { fontSize: 11, color: Colors.teal },
  strip: { flexDirection: 'row', gap: 4 },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  pin: { position: 'absolute', left: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(20,16,12,0.55)', alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  caption: { fontSize: 13, lineHeight: 19, color: Colors.inkSoft },
  more: { backgroundColor: Colors.muted, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.onDark, fontSize: 15, fontWeight: '700' },
  question: { fontSize: 14, fontWeight: '500', lineHeight: 21, color: Colors.ink },
  answer: { fontSize: 13, lineHeight: 20, color: '#4A433B' },
});
