import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Display, Icon, type IconName } from '@/components/common/ui';
import { Colors, Fonts } from '@/constants/theme';
import { createTrip } from '@/db/repo';
import { useT, type Messages } from '@/i18n';
import { addPhotos } from '@/photos/addPhotos';
import { todayISO } from '@/utils/time';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TIPS: { icon: IconName; key: keyof Messages['newTrip'] }[] = [
  { icon: 'photos', key: 'tipPhotos' },
  { icon: 'chat', key: 'tipBuddy' },
  { icon: 'journal', key: 'tipJournal' },
];

export default function NewTripScreen() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState('');
  const create = (withPhotos: boolean) => {
    if (!title.trim()) return Alert.alert(t.newTrip.needTitle);
    if (!DATE_RE.test(start) || (end && !DATE_RE.test(end))) return Alert.alert(t.newTrip.badDate);
    const id = createTrip(title.trim(), start, end || null);
    router.replace(`/trip/${id}`);
    if (withPhotos) addPhotos(id);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>{t.newTrip.name}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder={t.newTrip.namePlaceholder} placeholderTextColor={Colors.muted} style={[styles.input, styles.titleInput]} />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>{t.newTrip.start}</Text>
            <TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={styles.input} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>{t.newTrip.end}</Text>
            <TextInput value={end} onChangeText={setEnd} placeholder={t.newTrip.endPlaceholder} placeholderTextColor={Colors.muted} keyboardType="numbers-and-punctuation" style={styles.input} />
          </View>
        </View>
        <Card style={{ gap: 14 }}>
          <Display variant="subheading">{t.newTrip.howItWorks}</Display>
          {TIPS.map((tip) => (
            <View key={tip.key} style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name={tip.icon} size={22} color={Colors.accent} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: Colors.ink }}>{t.newTrip[tip.key]}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={t.newTrip.createAndPick} icon="addPhoto" onPress={() => create(true)} />
        <Button kind="secondary" label={t.newTrip.createOnly} onPress={() => create(false)} />
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
