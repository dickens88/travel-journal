import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Display, Icon, type IconName } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { createTrip } from '@/db/repo';
import { todayISO } from '@/utils/time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'photos', text: '照片随时可以加，每次加完自动识别时间、地点和内容' },
  { icon: 'chat', text: '在旅行页里随时呼出旅行搭子，聊过的内容都会留在这趟旅行里' },
  { icon: 'journal', text: '想写游记时再生成，之后有新内容还可以继续更新' },
];

export default function NewTripScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState('');
  const create = (withPhotos: boolean) => {
    if (!title.trim()) return Alert.alert('给这段旅行起个名字吧');
    if (!DATE_RE.test(start) || (end && !DATE_RE.test(end))) return Alert.alert('日期格式是 YYYY-MM-DD');
    const id = createTrip(title.trim(), start, end || null);
    router.replace(`/trip/${id}`);
    // The in-app gallery filters to the trip dates and keeps GPS, unlike the system picker
    if (withPhotos) router.push(`/trip/${id}/pick`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>旅行名称</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="比如：京都 · 秋日慢行" placeholderTextColor={Colors.muted} style={[styles.input, styles.titleInput]} />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>出发日期</Text>
            <TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={styles.input} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>返程日期（可不填）</Text>
            <TextInput value={end} onChangeText={setEnd} placeholder="还在路上" placeholderTextColor={Colors.muted} keyboardType="numbers-and-punctuation" style={styles.input} />
          </View>
        </View>
        <Card style={{ gap: 14 }}>
          <Display variant="subheading">一段旅行，边走边记</Display>
          {TIPS.map((t) => (
            <View key={t.text} style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name={t.icon} size={22} color={Colors.accent} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: Colors.ink }}>{t.text}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="创建并选择照片" icon="addPhoto" onPress={() => create(true)} />
        <Button kind="secondary" label="先不加照片" onPress={() => create(false)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 22 },
  field: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, color: Colors.muted },
  input: { height: 48, borderWidth: 1, borderColor: Colors.line, borderRadius: 14, backgroundColor: Colors.card, paddingHorizontal: 14, fontSize: 15, color: Colors.ink },
  titleInput: { fontFamily: Fonts.display, fontSize: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10, backgroundColor: Colors.paper },
});
