import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { generateJournal } from '@/ai/generateJournal';
import { setJob, type TripJobs } from '@/trip/jobs';

type Pending = { photos: number; notes: number; chats: number };

function pendingText(p: Pending) {
  const parts = [p.photos && `${p.photos} 张照片`, p.notes && `${p.notes} 条随手记`, p.chats && `${p.chats} 段对话`].filter(Boolean);
  return parts.join('、');
}

export function JournalStatusCard({ tripId, hasJournal, hasPhotos, pending, jobs }: { tripId: string; hasJournal: boolean; hasPhotos: boolean; pending: Pending; jobs: TripJobs }) {
  const fresh = pendingText(pending);
  let title: string;
  let sub: string;
  let action: { label: string; run: () => void } | null = null;
  if (jobs.generating) {
    title = hasJournal ? '正在更新游记…' : '正在写游记…';
    sub = jobs.analyzing ? `先识别照片 ${jobs.analyzing.done}/${jobs.analyzing.total}` : '通常需要一两分钟，可以先做别的';
  } else if (!hasJournal) {
    title = '还没有游记';
    sub = hasPhotos ? '素材够了就可以生成，之后还能继续更新' : '先添加一些照片吧';
    if (hasPhotos) action = { label: '生成游记', run: () => generateJournal(tripId) };
  } else if (fresh) {
    title = '游记草稿';
    sub = `还有 ${fresh}没写进去`;
    action = { label: '更新游记', run: () => generateJournal(tripId) };
  } else {
    title = '游记已是最新';
    sub = '继续添加照片或随手记，之后可以再更新';
    action = { label: '查看', run: () => router.replace(`/trip/${tripId}/journal`) };
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.card}>
        {jobs.generating ? <ActivityIndicator color={Colors.pop} /> : <Icon name="journal" size={28} color={Colors.pop} duo="rgba(244,188,82,0.3)" />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
        {action ? <Button compact label={action.label} onPress={action.run} /> : null}
      </View>
      {jobs.error ? (
        <Pressable style={styles.error} onPress={() => setJob(tripId, { error: undefined })}>
          <Icon name="warning" size={18} color={Colors.accent} />
          <Text style={styles.errorText}>{jobs.error}</Text>
          <Icon name="close" size={14} color={Colors.muted} duo={null} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: Colors.ink },
  title: { fontFamily: Fonts.display, color: Colors.onDark, fontSize: 17 },
  sub: { color: '#D8CFBD', fontSize: 12, lineHeight: 17 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.accentSoft },
  errorText: { flex: 1, fontSize: 13, color: Colors.ink, lineHeight: 19 },
});
