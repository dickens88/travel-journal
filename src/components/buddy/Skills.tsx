import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BuddySkill } from '@/ai/buddySkills';
import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Display, Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import type { Photo } from '@/db/types';

// Empty chat: the full menu of skills, plus recent photos that can be told as a story in one tap
export function SkillGrid({ skills, photos, onSkill, onStory }: { skills: BuddySkill[]; photos: Photo[]; onSkill: (s: BuddySkill) => void; onStory: (p: Photo) => void }) {
  const recent = photos.slice(-12).reverse();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Display variant="subheading">想让我露一手？</Display>
        <Text style={styles.sub}>点一下就开讲，也可以直接在下面问我</Text>
      </View>
      <View style={styles.grid}>
        {skills.map((s) => (
          <Pressable key={s.id} onPress={() => onSkill(s)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${s.title}：${s.hint}`}>
            <Icon name={s.icon} size={26} color={Colors.ink} />
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.sub} numberOfLines={1}>{s.hint}</Text>
          </Pressable>
        ))}
      </View>
      {recent.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>点张照片，听听它背后的故事</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {recent.map((p) => (
              <Pressable key={p.id} onPress={() => onStory(p)} accessibilityRole="button" accessibilityLabel={`讲讲${p.place_name ?? '这张照片'}的故事`}>
                <PhotoThumb file={p.file} style={styles.storyThumb} />
                {p.place_name ? <Text style={styles.storyLabel} numberOfLines={1}>{p.place_name}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// Ongoing chat: the same skills as a single scrollable row above the input
export function SkillStrip({ skills, onSkill }: { skills: BuddySkill[]; onSkill: (s: BuddySkill) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
      {skills.map((s) => (
        <Pressable key={s.id} onPress={() => onSkill(s)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${s.title}：${s.hint}`}>
          <Icon name={s.icon} size={16} color={Colors.ink} />
          <Text style={styles.pillText}>{s.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 12, color: Colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: '47%', flexGrow: 1, gap: 4, padding: 14, borderRadius: 16, backgroundColor: Colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: Colors.inkSoft },
  storyThumb: { width: 92, height: 92, borderRadius: 12 },
  storyLabel: { width: 92, marginTop: 4, fontSize: 11, color: Colors.muted },
  strip: { flexGrow: 0, flexShrink: 0, backgroundColor: Colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: Colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line },
  pillText: { fontSize: 13, color: Colors.ink },
});
