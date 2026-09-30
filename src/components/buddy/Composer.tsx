import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useVoiceInput } from './useVoiceInput';
import { Dots } from '@/components/buddy/TypingDots';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import type { Photo } from '@/db/types';
import { useT } from '@/i18n';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  // Speech turned into text, to be added to what is already typed
  onVoiceText: (text: string) => void;
  autoFocus?: boolean;
  attached: Photo[];
  onRemovePhoto: (id: string) => void;
  // Photos being imported from the camera or the library
  adding: boolean;
  onAttach: () => void;
  onNewChat: () => void;
  canNewChat: boolean;
  onSend: () => void;
  busy: boolean;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Chat input in one rounded box: text on top, attach and new-chat bottom left, voice and send bottom right
export function Composer({ value, onChangeText, onVoiceText, autoFocus, attached, onRemovePhoto, adding, onAttach, onNewChat, canNewChat, onSend, busy }: Props) {
  const t = useT();
  const input = useRef<TextInput>(null);
  // Blur first: focusing an already focused field doesn't bring back a dismissed keyboard
  const showKeyboard = () => {
    input.current?.blur();
    requestAnimationFrame(() => input.current?.focus());
  };
  const voice = useVoiceInput(onVoiceText, showKeyboard);
  const canSend = !busy && !adding && !!value.trim();

  if (voice.state === 'recording') {
    return (
      <View style={[styles.box, styles.recording]}>
        <Pressable onPress={voice.cancel} style={styles.round} accessibilityRole="button" accessibilityLabel={t.buddy.cancelRecording}>
          <Icon name="close" size={18} duo={null} />
        </Pressable>
        <View style={styles.listening}>
          <View style={styles.redDot} />
          <Text style={styles.listeningText}>{t.buddy.listening} {voice.seconds ? mmss(voice.seconds) : ''}</Text>
          <Dots size={5} />
        </View>
        <Pressable onPress={voice.finish} style={[styles.round, styles.primary]} accessibilityRole="button" accessibilityLabel={t.buddy.finishRecording}>
          <Icon name="stop" size={18} color={Colors.onDark} duo={null} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {attached.length || adding ? (
        <View style={styles.attachments}>
          {attached.map((p) => (
            <View key={p.id}>
              <PhotoThumb file={p.file} style={styles.thumb} />
              <Pressable onPress={() => onRemovePhoto(p.id)} style={styles.remove} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.buddy.removePhoto}>
                <Icon name="close" size={11} color={Colors.onDark} duo={null} />
              </Pressable>
            </View>
          ))}
          {adding ? (
            <View style={[styles.thumb, styles.center]}>
              <ActivityIndicator color={Colors.muted} />
            </View>
          ) : null}
        </View>
      ) : null}
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder={voice.state === 'transcribing' ? t.buddy.transcribing : attached.length ? t.buddy.askPhoto : t.buddy.askAnything}
        autoFocus={autoFocus}
        placeholderTextColor={Colors.muted}
        style={styles.input}
        multiline
        accessibilityLabel={t.buddy.inputA11y}
      />
      <View style={styles.toolbar}>
        <Pressable onPress={onAttach} style={styles.round} accessibilityRole="button" accessibilityLabel={t.buddy.attachA11y}>
          <Icon name="add" size={20} duo={null} />
        </Pressable>
        <Pressable
          onPress={onNewChat}
          disabled={!canNewChat}
          style={[styles.pill, !canNewChat && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel={t.buddy.newChatA11y}
          accessibilityState={{ disabled: !canNewChat }}>
          <Icon name="chat" size={15} duo={null} />
          <Text style={styles.pillText}>{t.buddy.newChat}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={voice.start}
          disabled={voice.state !== 'idle'}
          style={styles.round}
          accessibilityRole="button"
          accessibilityLabel={t.buddy.voiceInput}>
          {voice.state === 'transcribing' ? <ActivityIndicator color={Colors.muted} /> : <Icon name="mic" size={20} duo={null} />}
        </Pressable>
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={[styles.round, styles.primary, !canSend && { opacity: 0.35 }]}
          accessibilityRole="button"
          accessibilityLabel={t.buddy.send}
          accessibilityState={{ disabled: !canSend }}>
          <Icon name="send" size={18} color={Colors.onDark} duo={null} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  recording: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  listening: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  listeningText: { fontSize: 15, color: Colors.ink, fontVariant: ['tabular-nums'] },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 6, paddingTop: 6 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.chip },
  remove: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 40, maxHeight: 120, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4, fontSize: 16, lineHeight: 22, color: Colors.ink },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.chip },
  primary: { backgroundColor: Colors.accent },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: Colors.line },
  pillText: { fontSize: 13, fontWeight: '600', color: Colors.ink },
});
