import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Card, Chip, Icon, Serif } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { deleteNote } from '@/db/repo';
import type { Photo } from '@/db/types';
import { cameraSummary, formatCoord, photoExif } from '@/photos/describe';
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
  const shown = photos.slice(0, photos.length > 4 ? 3 : 4);
  return (
    <View style={styles.strip}>
      {shown.map((p) => (
        <Pressable key={p.id} onPress={() => openPhoto(tripId, p.id)} style={styles.thumb} accessibilityRole="imagebutton" accessibilityLabel="查看大图">
          <PhotoThumb file={p.file} style={StyleSheet.absoluteFill} />
          {p.lat != null ? (
            <View style={styles.pin}>
              <Icon name="pin" size={11} color={Colors.onDark} duo={null} />
            </View>
          ) : null}
        </Pressable>
      ))}
      {photos.length > 4 ? (
        <Pressable onPress={() => openPhoto(tripId, photos[3].id)} style={[styles.thumb, styles.more]} accessibilityRole="button" accessibilityLabel="查看更多照片">
          <Text style={styles.moreText}>+{photos.length - 3}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PhotoMeta({ photos, places }: { photos: Photo[]; places: string[] }) {
  const located = photos.filter((p) => p.lat != null);
  const first = located[0];
  let where = places.slice(0, 3).join('、');
  if (!where && first) where = formatCoord(first.lat!, first.lng!);
  if (where && located.length && located.every((p) => p.loc_estimated)) where = `约 ${where}`;
  const missing = photos.length - located.length;

  const times = photos.flatMap((p) => (p.taken_at != null ? [localParts(p.taken_at, p.offset_min).hm] : []));
  const range = times.length > 1 && times[0] !== times[times.length - 1] ? `${times[0]}–${times[times.length - 1]}` : times[0];
  const light = [...new Set(photos.map((p) => p.lighting_tag).filter(Boolean))].slice(0, 2).join('、');
  const camera = photos.length === 1 ? cameraSummary(photoExif(photos[0])) : '';
  const caption = photos.length === 1 ? photoAnalysis(photos[0])?.caption : undefined;
  const info = [range ? `拍摄于 ${range}` : null, light, camera].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 3 }}>
      <View style={styles.metaRow}>
        <Icon name="pin" size={13} color={where ? Colors.accent : Colors.muted} duo={null} />
        <Text style={[styles.sub, { flex: 1 }]} numberOfLines={1}>
          {where || '没有读取到位置信息'}
          {where && missing ? ` · ${missing} 张无定位` : ''}
        </Text>
      </View>
      {caption ? <Text style={styles.caption} numberOfLines={2}>{caption}</Text> : null}
      {info ? <Text style={styles.sub} numberOfLines={1}>{info}</Text> : null}
    </View>
  );
}

function PhotosCard({ item, jobs, tripId }: { item: Extract<FeedItem, { kind: 'photos' }>; jobs: TripJobs; tripId: string }) {
  const unanalyzed = item.photos.filter((p) => !p.analysis_json).length;
  const included = item.photos.every((p) => p.journal_included_at != null);
  let chip = null;
  if (unanalyzed && jobs.analyzing) chip = <Chip tone="accent" icon="sparkle" label={`识别中 ${item.photos.length - unanalyzed}/${item.photos.length}`} />;
  else if (unanalyzed)
    chip = (
      <Pressable onPress={() => recognizePhotos(tripId)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`识别 ${unanalyzed} 张照片`}>
        <Chip tone="accent" icon="sparkle" label={`识别 ${unanalyzed} 张`} />
      </Pressable>
    );
  else if (included) chip = <Text style={styles.done}>已写入游记</Text>;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.headRow}>
        <Icon name="photos" size={20} color={Colors.inkSoft} />
        <Text style={styles.headText}>添加了 {item.photos.length} 张照片</Text>
        {chip}
      </View>
      <PhotoStrip photos={item.photos} tripId={tripId} />
      <PhotoMeta photos={item.photos} places={item.places} />
    </Card>
  );
}

function NoteCard({ item }: { item: Extract<FeedItem, { kind: 'note' }> }) {
  const n = item.note;
  const confirmDelete = () =>
    Alert.alert('删除这条随手记？', n.text, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteNote(n.id) },
    ]);
  return (
    <Pressable onLongPress={confirmDelete}>
      <Card style={{ flexDirection: 'row', gap: 10 }}>
        <Icon name="note" size={22} color={Colors.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <Serif style={{ fontSize: 15, lineHeight: 25 }}>“{n.text}”</Serif>
          <Text style={styles.sub}>
            随手记{n.source === 'buddy' ? ' · 来自搭子对话' : ''}
            {n.place_name ? ` · ${n.place_name}` : ''}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function ChatCard({ item, tripId, photos }: { item: Extract<FeedItem, { kind: 'chat' }>; tripId: string; photos: Map<string, Photo> }) {
  const photo = item.photoId ? photos.get(item.photoId) : undefined;
  return (
    <Pressable onPress={() => router.push(`/trip/${tripId}/buddy`)} accessibilityRole="button">
      <Card style={{ gap: 8 }}>
        <View style={styles.headRow}>
          <Icon name="chat" size={20} color={Colors.teal} />
          <Text style={[styles.headText, { color: Colors.teal, fontSize: 13 }]}>和搭子聊了 {Math.max(item.turns, 1)} 轮</Text>
          <Icon name="next" size={14} color={Colors.muted} duo={null} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {photo ? <PhotoThumb file={photo.file} style={{ width: 52, height: 52, borderRadius: 10 }} /> : null}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.question} numberOfLines={2}>{item.question || '（照片）'}</Text>
            {item.answer ? <Text style={styles.answer} numberOfLines={2}>搭子：{item.answer}</Text> : null}
          </View>
        </View>
        {item.usedSearch || item.savedNotes ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {item.usedSearch ? <Chip tone="teal" icon="web" label="联网搜索" /> : null}
            {item.savedNotes ? <Chip tone="accent" icon="note" label={`存了 ${item.savedNotes} 条随手记`} /> : null}
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
