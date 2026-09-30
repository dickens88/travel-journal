import { router } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice } from '@/components/common/ErrorNotice';
import { Button, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { generateJournal } from '@/ai/generateJournal';
import { useT, type Messages } from '@/i18n';
import { setJob, type TripJobs } from '@/trip/jobs';

type Pending = { photos: number; notes: number; chats: number };

function pendingText(p: Pending, t: Messages) {
  const c = t.journalCard;
  const parts = [p.photos && c.pendingPhotos(p.photos), p.notes && c.pendingNotes(p.notes), p.chats && c.pendingChats(p.chats)].filter(Boolean);
  return parts.join(t.common.listSep);
}

// `onJournal`: shown on the journal page itself, where "View" would go nowhere, so it offers a fresh rewrite instead
export function JournalStatusCard({ tripId, hasJournal, hasPhotos, pending, jobs, onJournal }: { tripId: string; hasJournal: boolean; hasPhotos: boolean; pending: Pending; jobs: TripJobs; onJournal?: boolean }) {
  const t = useT();
  const c = t.journalCard;
  const fresh = pendingText(pending, t);
  let title: string;
  let sub: string;
  let action: { label: string; run: () => void } | null = null;
  if (jobs.generating) {
    title = hasJournal ? c.updating : c.writing;
    sub = jobs.analyzing ? c.analyzingFirst(jobs.analyzing.done, jobs.analyzing.total) : c.takesAWhile;
  } else if (!hasJournal) {
    title = c.none;
    sub = hasPhotos ? c.ready : c.addPhotosFirst;
    if (hasPhotos) action = { label: c.generate, run: () => generateJournal(tripId) };
  } else if (fresh) {
    title = c.draft;
    sub = c.notYetIn(fresh);
    action = { label: c.update, run: () => generateJournal(tripId) };
  } else {
    title = c.upToDate;
    sub = c.keepAdding;
    action = onJournal
      ? {
          label: c.regenerate,
          run: () =>
            Alert.alert(c.regenerateTitle, c.regenerateText, [
              { text: t.common.cancel, style: 'cancel' },
              { text: c.regenerate, style: 'destructive', onPress: () => generateJournal(tripId, { fresh: true }) },
            ]),
        }
      : { label: c.view, run: () => router.replace(`/trip/${tripId}/journal`) };
  }
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.card}>
        {jobs.generating ? <ActivityIndicator color={Colors.sun} /> : <Icon name="journal" size={28} color={Colors.sun} duo={Colors.pop} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
        {action ? <Button compact label={action.label} onPress={action.run} /> : null}
      </View>
      {jobs.error ? (
        <ErrorNotice
          title={jobs.error.title}
          message={jobs.error.message}
          onDismiss={() => setJob(tripId, { error: undefined })}
          onRetry={jobs.error.retry}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: Colors.pop, backgroundColor: Colors.popSoft },
  title: { fontFamily: Fonts.display, color: Colors.ink, fontSize: 17 },
  sub: { color: Colors.inkSoft, fontSize: 12, lineHeight: 17 },
});
