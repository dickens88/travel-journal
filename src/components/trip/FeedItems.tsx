import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Card, Chip, Icon, Serif } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { deleteNote } from '@/db/repo';
import type { Photo } from '@/db/types';
import type { FeedItem } from '@/trip/feed';
import type { TripJobs } from '@/trip/jobs';

function Time({ hm }: { hm: string }) {
  return <Text style={styles.time}>{hm}</Text>;
}

function PhotoStrip({ photos }: { photos: Photo[] }) {
  const shown = photos.slice(0, photos.length > 4 ? 3 : 4);
  return (
    <View style={styles.strip}>
      {shown.map((p) => (
        <PhotoThumb key={p.id} file={p.file} style={styles.thumb} />
      ))}
      {photos.length > 4 ? (
        <View style={[styles.thumb, styles.more]}>
          <Text style={styles.moreText}>+{photos.length - 3}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PhotosCard({ item, jobs }: { item: Extract<FeedItem, { kind: 'photos' }>; jobs: TripJobs }) {
  const unanalyzed = item.photos.filter((p) => !p.analysis_json).length;
  const included = item.photos.every((p) => p.journal_included_at != null);
  let chip = null;
  if (unanalyzed && jobs.analyzing) chip = <Chip tone="accent" icon="sparkle" label={`识别中 ${item.photos.length - unanalyzed}/${item.photos.length}`} />;
  else if (unanalyzed) chip = <Chip label={`${unanalyzed} 张待识别`} />;
  else if (included) chip = <Text style={styles.done}>已写入游记</Text>;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.headRow}>
        <Icon name="photos" size={20} color={Colors.inkSoft} />
        <Text style={styles.headText}>添加了 {item.photos.length} 张照片</Text>
        {chip}
      </View>
      {item.places.length ? <Text style={styles.sub} numberOfLines={1}>{item.places.slice(0, 3).join('、')}</Text> : null}
      <PhotoStrip photos={item.photos} />
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
        {item.kind === 'photos' ? <PhotosCard item={item} jobs={jobs} /> : null}
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
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 8 },
  more: { backgroundColor: Colors.muted, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: Colors.onDark, fontSize: 15, fontWeight: '700' },
  question: { fontSize: 14, fontWeight: '500', lineHeight: 21, color: Colors.ink },
  answer: { fontSize: 13, lineHeight: 20, color: '#4A433B' },
});
