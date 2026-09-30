import { router, useLocalSearchParams } from 'expo-router';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buddySkills, resolveSpot, skillPrompt, type BuddySkill } from '@/ai/buddySkills';
import { retryBuddyMessage, sendBuddyMessage } from '@/ai/chat';
import { blocksOf, isToolResultTurn, isUserTurn, photoIdsOf, savedNoteTexts, textOf, usedWebSearch } from '@/ai/chatContent';
import { describeError } from '@/ai/client';
import { speak } from '@/ai/speech';
import { AttachSheet } from '@/components/buddy/AttachSheet';
import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { Composer } from '@/components/buddy/Composer';
import { SkillGrid, SkillStrip } from '@/components/buddy/Skills';
import { Dots, TypingDots } from '@/components/buddy/TypingDots';
import { ErrorNotice } from '@/components/common/ErrorNotice';
import { Markdown } from '@/components/common/Markdown';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Chip, Display, Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { getTrip, listNotes, listPhotos, listSession, startNewChat } from '@/db/repo';
import type { ChatRow, Photo } from '@/db/types';
import { useQuery } from '@/db/useQuery';
import { useT } from '@/i18n';
import { importAssets, pickPhotos, takePhoto, type ImportSource } from '@/photos/importPhotos';
import { aiConfigured, saveSettings, useSettings, useSettingsReady } from '@/settings/settings';
import { formatDayTime, localParts } from '@/utils/time';

// Memoized: the sheet re-renders on every streamed token
const Bubble = memo(function Bubble({ row, photos }: { row: ChatRow; photos: Map<string, Photo> }) {
  const t = useT();
  const blocks = blocksOf(row.content_json);
  if (isToolResultTurn(blocks)) return null;
  const text = textOf(blocks);
  if (row.role === 'user') {
    const attached = photoIdsOf(blocks).map((pid) => photos.get(pid)).filter(Boolean) as Photo[];
    return (
      <View style={[styles.userBubble, attached.length > 0 && { padding: 8 }]}>
        {attached.map((p) => (
          <PhotoThumb key={p.id} file={p.file} style={styles.attached} />
        ))}
        {text ? <Text style={[styles.userText, attached.length > 0 && { paddingHorizontal: 6 }]}>{text}</Text> : null}
      </View>
    );
  }
  const notes = savedNoteTexts(blocks);
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '88%', gap: 6 }}>
      {usedWebSearch(blocks) ? <Chip tone="teal" icon="web" label={t.buddy.searched} /> : null}
      {text ? (
        <>
          <View style={styles.botBubble}>
            <Markdown text={text} style={styles.botText} />
          </View>
          <Pressable style={styles.speak} onPress={() => speak(text)} accessibilityLabel={t.buddy.readReply}>
            <Icon name="speaker" size={13} color={Colors.muted} />
            <Text style={{ fontSize: 12, color: Colors.muted }}>{t.buddy.read}</Text>
          </Pressable>
        </>
      ) : null}
      {notes.map((n) => (
        <View key={n} style={styles.noteSaved}>
          <Icon name="note" size={20} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>{t.buddy.savedAsNote}</Text>
            <Text style={{ fontSize: 12, color: Colors.muted }} numberOfLines={2}>{n}</Text>
          </View>
        </View>
      ))}
    </View>
  );
});

export default function BuddySheet() {
  // photo: attach this trip photo; ask=describe: also send the photo viewer's one-tap "tell me about it" right away
  const { id, photo, ask } = useLocalSearchParams<{ id: string; photo?: string; ask?: string }>();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const settingsReady = useSettingsReady();
  const t = useT();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const rows = useQuery(`listSession:${id}`, () => listSession(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const noteCount = useQuery(`listNotes:${id}`, () => listNotes(id)).length;
  const [input, setInput] = useState('');
  // Trip photos going out with the next message
  const [attached, setAttached] = useState<string[]>(photo ? [photo] : []);
  const [attachOpen, setAttachOpen] = useState(false);
  // Importing a photo just shot or picked from the phone's album
  const [adding, setAdding] = useState(false);
  const autoAsked = useRef(false);
  // Decided once: `ask` is cleared after the auto-send, which must not then pop the keyboard
  const [focusInput] = useState(() => !!photo && ask !== 'describe');
  // Choosing a photo for the "story" skill, which asks about it right away
  const [picking, setPicking] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  // Locating the user before a place-based skill can send
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const newestFirst = useMemo(() => [...photos].reverse(), [photos]);
  const skills = useMemo(() => (trip ? buddySkills(trip, photos, t) : []), [trip, photos, t]);
  const ready = settingsReady && aiConfigured(settings);
  const busy = streaming !== null || locating;
  const canNewChat = !busy && rows.length > 0;
  // A fresh chat opens on the skill menu instead of an empty list; once it has started, a strip stays above an empty input
  const showGrid = ready && !busy && rows.length === 0;
  const showStrip = ready && !busy && rows.length > 0 && !input.trim();

  // Runs one exchange; on failure, retry answers the saved question again, or resends it if it never got saved
  const exchange = async (job: () => Promise<void>, resend: () => void) => {
    setError(null);
    setStreaming('');
    const before = listSession(id).length;
    try {
      await job();
    } catch (e) {
      const saved = listSession(id).length > before;
      setError({ message: describeError(e), retry: saved ? () => exchange(() => retryBuddyMessage(id, setStreaming), resend) : resend });
    } finally {
      setStreaming(null);
    }
  };

  const send = async (preset?: string, attach = attached) => {
    const text = (preset ?? input).trim();
    if (!text || busy || adding) return;
    if (preset === undefined) setInput('');
    setAttached([]);
    setPicking(false);
    await exchange(() => sendBuddyMessage(id, text, attach, setStreaming), () => send(text, attach));
  };

  const newChat = () => {
    if (!canNewChat) return;
    startNewChat(id);
    setError(null);
    setPicking(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const toggleAttached = (pid: string) => setAttached((a) => (a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid]));

  // Photos from the camera or the phone's album join the trip first, then ride along with the message
  const addFrom = async (source: () => Promise<ImportSource[]>) => {
    setAttachOpen(false);
    // iOS can't present the picker while the sheet is still sliding away
    await new Promise((r) => setTimeout(r, 350));
    try {
      const sources = await source();
      if (!sources.length) return;
      setAdding(true);
      const ids = await importAssets(id, sources);
      setAttached((a) => [...a, ...ids.filter((x) => !a.includes(x))]);
    } catch (e) {
      Alert.alert(t.buddy.addPhotoFailed, describeError(e));
    } finally {
      setAdding(false);
    }
  };

  const tellStory = (p: Photo) => send(t.skills.prompts.story, [p.id]);

  const runSkill = async (skill: BuddySkill) => {
    if (!trip || busy) return;
    if (skill.needs === 'photo') {
      setPicking((v) => !v);
      return;
    }
    let spot = null;
    if (skill.needs === 'place') {
      setLocating(true);
      spot = await resolveSpot(trip, photos).finally(() => setLocating(false));
    }
    send(skillPrompt(skill.id, { trip, photos, spot, t }), []);
  };

  useEffect(() => {
    if (ask !== 'describe' || !photo || autoAsked.current || !settingsReady) return;
    autoAsked.current = true;
    // Clear the flag so a remount of this screen doesn't ask again
    router.setParams({ ask: undefined });
    send(t.skills.prompts.describe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, photo, settingsReady]);

  // Show a date divider before the first user message of each day
  const dividers = useMemo(() => {
    const out = new Map<number, string>();
    let prevDay = '';
    for (const r of rows) {
      if (!isUserTurn(r)) continue;
      const day = localParts(r.created_at).date;
      if (day !== prevDay) out.set(r.id, formatDayTime(r.created_at, t));
      prevDay = day;
    }
    return out;
  }, [rows, t]);

  return (
    <KeyboardAvoidingView style={styles.sheet} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BuddyAvatar value={settings.buddyAvatar} size={42} />
        <View style={{ flex: 1 }}>
          <Display variant="subheading">{t.buddy.title}</Display>
          <Text style={styles.sub} numberOfLines={1}>{t.buddy.savedIn(trip?.title ?? '')}</Text>
        </View>
        <Pressable
          onPress={() => saveSettings({ tts: !settings.tts })}
          accessibilityLabel={settings.tts ? t.buddy.autoReadOn : t.buddy.autoReadOff}
          style={styles.headerBtn}>
          <Icon name={settings.tts ? 'speaker' : 'speakerOff'} size={22} color={settings.tts ? Colors.accent : Colors.muted} duo={settings.tts ? Colors.pop : null} />
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityLabel={t.buddy.collapse} style={styles.headerBtn}>
          <Icon name="collapse" size={22} duo={null} />
        </Pressable>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.list} onContentSizeChange={() => !showGrid && scroll.current?.scrollToEnd({ animated: true })}>
        <View style={styles.context}>
          <Icon name="sparkle" size={14} color="#4A433B" />
          <Text style={{ fontSize: 12, color: '#4A433B' }}>{t.buddy.knows(photos.length, noteCount)}</Text>
        </View>
        {trip?.chat_since && !rows.length ? <Text style={styles.day}>{t.buddy.earlierHidden}</Text> : null}
        {settingsReady && !aiConfigured(settings) ? (
          <View style={styles.noKey}>
            <Text style={{ flex: 1, fontSize: 13 }}>{t.buddy.notSetUp}</Text>
            <Button compact label={t.common.openSettings} onPress={() => router.push('/settings')} />
          </View>
        ) : null}
        {showGrid ? <SkillGrid skills={skills} photos={photos} onSkill={runSkill} onStory={tellStory} /> : null}
        {rows.map((r) => (
          <View key={r.id} style={{ gap: 12 }}>
            {dividers.has(r.id) ? <Text style={styles.day}>{dividers.get(r.id)}</Text> : null}
            <Bubble row={r} photos={photoMap} />
          </View>
        ))}
        {locating || streaming === '' ? (
          <View style={[styles.botBubble, { alignSelf: 'flex-start' }]}>
            <TypingDots label={locating ? t.buddy.locating : undefined} />
          </View>
        ) : streaming ? (
          <View style={[styles.botBubble, { alignSelf: 'flex-start', maxWidth: '88%', gap: 8 }]}>
            <Markdown text={streaming} style={styles.botText} />
            {/* Still working: replies can stall mid-way while the model searches */}
            <Dots size={5} />
          </View>
        ) : null}
        {error && streaming === null ? <ErrorNotice title={t.buddy.replyFailed} message={error.message} onRetry={error.retry} onDismiss={() => setError(null)} /> : null}
      </ScrollView>
      {picking ? (
        <View style={styles.picker}>
          <View style={styles.pickHead}>
            <Text style={styles.pickHint}>{t.buddy.pickHint}</Text>
            <Pressable onPress={() => setPicking(false)} hitSlop={10} accessibilityLabel={t.common.cancel}>
              <Icon name="close" size={16} color={Colors.muted} duo={null} />
            </Pressable>
          </View>
          <ScrollView horizontal contentContainerStyle={{ gap: 6, padding: 8 }}>
            {newestFirst.map((p) => (
              <Pressable key={p.id} onPress={() => tellStory(p)}>
                <PhotoThumb file={p.file} style={styles.pickThumb} />
              </Pressable>
            ))}
            {photos.length === 0 ? <Text style={styles.sub}>{t.buddy.noPhotos}</Text> : null}
          </ScrollView>
        </View>
      ) : showStrip ? (
        <SkillStrip skills={skills} onSkill={runSkill} />
      ) : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Composer
          value={input}
          onChangeText={setInput}
          onVoiceText={(t) => setInput((v) => v + t)}
          autoFocus={focusInput}
          attached={attached.map((pid) => photoMap.get(pid)).filter((p): p is Photo => !!p)}
          onRemovePhoto={toggleAttached}
          adding={adding}
          onAttach={() => setAttachOpen(true)}
          onNewChat={newChat}
          canNewChat={canNewChat}
          onSend={() => send()}
          busy={busy}
        />
      </View>
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        photos={newestFirst}
        selected={attached}
        onToggle={toggleAttached}
        onCamera={() => addFrom(takePhoto)}
        onLibrary={() => addFrom(() => pickPhotos(4))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, paddingLeft: 16, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 12, color: Colors.muted },
  list: { padding: 16, gap: 12 },
  context: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.chip },
  noKey: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.accentSoft },
  day: { alignSelf: 'center', fontSize: 11, color: Colors.muted },
  userBubble: { alignSelf: 'flex-end', maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 4, backgroundColor: Colors.ink, gap: 8 },
  attached: { width: 220, height: 150, borderRadius: 12 },
  userText: { color: Colors.onDark, fontSize: 15, lineHeight: 23 },
  botBubble: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderBottomLeftRadius: 4, backgroundColor: Colors.card },
  botText: { fontSize: 15, lineHeight: 25, color: Colors.ink },
  speak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  noteSaved: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: Colors.accentSoft },
  picker: { backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  pickHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  pickHint: { flex: 1, fontSize: 12, color: Colors.muted },
  pickThumb: { width: 72, height: 72, borderRadius: 8 },
  composer: { paddingTop: 8, backgroundColor: Colors.paper },
});
