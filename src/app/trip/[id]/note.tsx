import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Display, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { addManualNote } from '@/trip/notes';

export default function NoteSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    await addManualNote(id, text.trim());
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.sheet, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 4 }}>
          <Display>随手记</Display>
          <Text style={styles.hint}>会自动记下时间和当前位置，可以用输入法的语音输入</Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityLabel="关闭" hitSlop={10}>
          <Icon name="close" size={24} duo={null} />
        </Pressable>
      </View>
      <TextInput
        autoFocus
        multiline
        value={text}
        onChangeText={setText}
        placeholder="此刻想记下什么？"
        placeholderTextColor={Colors.muted}
        style={styles.input}
      />
      <Button label="保存" onPress={save} loading={saving} disabled={!text.trim()} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.paper, padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  hint: { fontSize: 12, color: Colors.muted },
  input: {
    minHeight: 120,
    maxHeight: 260,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    fontFamily: Fonts.serif,
    fontSize: 16,
    lineHeight: 26,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
});
