import { router, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendBuddyMessage, speak } from '@/ai/chat';
import { blocksOf, isToolResultTurn, isUserTurn, photoIdsOf, savedNoteTexts, textOf, usedWebSearch } from '@/ai/chatContent';
import { describeError } from '@/ai/client';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Button, Chip, Display, Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { getTrip, listChat, listNotes, listPhotos } from '@/db/repo';
import type { ChatRow, Photo } from '@/db/types';
import { useQuery } from '@/db/useQuery';
import { saveSettings, useSettings } from '@/settings/settings';
import { localParts } from '@/utils/time';

// Memoized: the sheet re-renders on every streamed token
const Bubble = memo(function Bubble({ row, photos }: { row: ChatRow; photos: Map<string, Photo> }) {
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
      {usedWebSearch(blocks) ? <Chip tone="teal" icon="web" label="已联网搜索" /> : null}
      {text ? (
        <>
          <View style={styles.botBubble}>
            <Text style={styles.botText}>{text}</Text>
          </View>
          <Pressable style={styles.speak} onPress={() => speak(text)} accessibilityLabel="朗读这条回复">
            <Icon name="speaker" size={13} color={Colors.muted} />
            <Text style={{ fontSize: 12, color: Colors.muted }}>朗读</Text>
          </Pressable>
        </>
      ) : null}
      {notes.map((n) => (
        <View key={n} style={styles.noteSaved}>
          <Icon name="note" size={20} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>已记为随手记</Text>
            <Text style={{ fontSize: 12, color: Colors.muted }} numberOfLines={2}>{n}</Text>
          </View>
        </View>
      ))}
    </View>
  );
});

export default function BuddySheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const trip = useQuery(`getTrip:${id}`, () => getTrip(id));
  const rows = useQuery(`listChat:${id}`, () => listChat(id));
  const photos = useQuery(`listPhotos:${id}`, () => listPhotos(id));
  const noteCount = useQuery(`listNotes:${id}`, () => listNotes(id)).length;
  const [input, setInput] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming !== null) return;
    setInput('');
    setPhotoId(null);
    setPicking(false);
    setError(null);
    setStreaming('');
    try {
      await sendBuddyMessage(id, text, photoId, setStreaming);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setStreaming(null);
    }
  };

  // Show a date divider before the first user message of each day
  const dividers = useMemo(() => {
    const out = new Map<number, string>();
    let prevDay = '';
    for (const r of rows) {
      if (!isUserTurn(r)) continue;
      const day = localParts(r.created_at);
      if (day.date !== prevDay) out.set(r.id, `${day.date.slice(5).replace('-', '月')}日 ${day.hm}`);
      prevDay = day.date;
    }
    return out;
  }, [rows]);

  return (
    <KeyboardAvoidingView style={styles.sheet} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.avatar}>
          <Icon name="buddy" size={26} color={Colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Display variant="subheading">旅行搭子</Display>
          <Text style={styles.sub} numberOfLines={1}>对话会保存在「{trip?.title}」里</Text>
        </View>
        <Pressable
          onPress={() => saveSettings({ tts: !settings.tts })}
          accessibilityLabel={settings.tts ? '自动朗读：已开启' : '自动朗读：已关闭'}
          style={styles.headerBtn}>
          <Icon name={settings.tts ? 'speaker' : 'speakerOff'} size={22} color={settings.tts ? Colors.accent : Colors.muted} duo={settings.tts ? Colors.pop : null} />
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityLabel="收起" style={styles.headerBtn}>
          <Icon name="collapse" size={22} duo={null} />
        </Pressable>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <View style={styles.context}>
          <Icon name="sparkle" size={14} color="#4A433B" />
          <Text style={{ fontSize: 12, color: '#4A433B' }}>已了解 {photos.length} 张照片 · {noteCount} 条随手记</Text>
        </View>
        {!settings.apiKey ? (
          <View style={styles.noKey}>
            <Text style={{ flex: 1, fontSize: 13 }}>还没有填写 Claude API Key，搭子暂时说不了话</Text>
            <Button compact label="去设置" onPress={() => router.push('/settings')} />
          </View>
        ) : null}
        {rows.map((r) => (
          <View key={r.id} style={{ gap: 12 }}>
            {dividers.has(r.id) ? <Text style={styles.day}>{dividers.get(r.id)}</Text> : null}
            <Bubble row={r} photos={photoMap} />
          </View>
        ))}
        {streaming !== null ? (
          <View style={[styles.botBubble, { alignSelf: 'flex-start', maxWidth: '88%' }]}>
            <Text style={styles.botText}>{streaming || '想一想…'}</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {picking ? (
        <ScrollView horizontal style={styles.picker} contentContainerStyle={{ gap: 6, padding: 8 }}>
          {[...photos].reverse().map((p) => (
            <Pressable key={p.id} onPress={() => { setPhotoId(p.id); setPicking(false); }}>
              <PhotoThumb file={p.file} style={styles.pickThumb} />
            </Pressable>
          ))}
          {photos.length === 0 ? <Text style={styles.sub}>这趟旅行还没有照片</Text> : null}
        </ScrollView>
      ) : null}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable onPress={() => setPicking((v) => !v)} style={styles.attach} accessibilityLabel="附加这趟旅行里的照片">
          {photoId && photoMap.get(photoId) ? (
            <PhotoThumb file={photoMap.get(photoId)!.file} style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : (
            <Icon name="addPhoto" size={22} />
          )}
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="问点什么，也可以用输入法语音输入"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          multiline
          accessibilityLabel="向旅行搭子提问"
        />
        <Pressable onPress={send} style={[styles.send, (!input.trim() || streaming !== null) && { opacity: 0.4 }]} accessibilityLabel="发送">
          <Icon name="send" size={22} color={Colors.onDark} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, paddingLeft: 16, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.popSoft, alignItems: 'center', justifyContent: 'center' },
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
  error: { fontSize: 13, color: Colors.accent, textAlign: 'center' },
  picker: { maxHeight: 88, backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  pickThumb: { width: 72, height: 72, borderRadius: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  attach: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.chip, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 110, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, borderRadius: 22, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.paper, fontSize: 15, color: Colors.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
});
