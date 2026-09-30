import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import type { Journal } from '@/ai/schemas';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Card, Display, Icon } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import type { Photo } from '@/db/types';

// Multiline input styled as an editable block of journal text
export function EditBox({ style, ...props }: TextInputProps) {
  return <TextInput multiline textAlignVertical="top" placeholderTextColor={Colors.muted} style={[styles.box, style]} {...props} />;
}

// A section's photos while editing: small thumbnails, each with a button that takes it out of the section
export function EditPhotos({ photos, onRemove }: { photos: Photo[]; onRemove: (id: string) => void }) {
  if (!photos.length) return null;
  return (
    <View style={styles.thumbs}>
      {photos.map((p) => (
        <View key={p.id} style={styles.thumb}>
          <PhotoThumb file={p.file} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => onRemove(p.id)} hitSlop={6} style={styles.remove} accessibilityRole="button" accessibilityLabel="从这一节移除照片">
            <Icon name="close" size={12} color={Colors.onDark} duo={null} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ['京都', '红叶'] → "#京都 #红叶", as the tags appear in the Xiaohongshu caption
export function formatTags(tags: string[]) {
  return tags.map((t) => `#${t}`).join(' ');
}

// "#京都 #红叶" or "京都，红叶" both give ['京都', '红叶']
function parseTags(text: string) {
  return text.split(/[\s,，、#]+/).filter(Boolean);
}

// The Xiaohongshu copy shown on the share page
export function XhsEditor({ xhs, onChange }: { xhs: Journal['xhs']; onChange: (xhs: Journal['xhs']) => void }) {
  // Tags keep their own text so a trailing space or "#" can be typed before the next tag
  const [tags, setTags] = useState(() => formatTags(xhs.tags));
  return (
    <Card style={{ gap: 10 }}>
      <Display variant="subheading">小红书文案</Display>
      <Text style={styles.label}>标题</Text>
      <EditBox value={xhs.title} onChangeText={(title) => onChange({ ...xhs, title })} multiline={false} style={styles.line} />
      <Text style={styles.label}>正文</Text>
      <EditBox value={xhs.body} onChangeText={(body) => onChange({ ...xhs, body })} style={{ minHeight: 160 }} />
      <Text style={styles.label}>标签（用空格分开）</Text>
      <EditBox
        value={tags}
        onChangeText={(t) => {
          setTags(t);
          onChange({ ...xhs, tags: parseTags(t) });
        }}
        autoCapitalize="none"
        multiline={false}
        style={styles.line}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { fontFamily: Fonts.serif, fontSize: 16, lineHeight: 28, color: Colors.ink, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  line: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 13, color: Colors.muted },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(20,16,12,0.7)', alignItems: 'center', justifyContent: 'center' },
});
