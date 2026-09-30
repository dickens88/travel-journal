import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLAUDE_MODELS, DEFAULT_MODEL } from '@/ai/client';
import { DEFAULT_VOICE, TTS_VOICES } from '@/ai/cloudTts';
import { isArk } from '@/ai/openai';
import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { Display, Icon, type IconName } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { aiConfigured, saveSettings, useSettings, useSettingsReady, type Settings } from '@/settings/settings';

export default function SettingsScreen() {
  // Secure store loads asynchronously; the summaries need the saved values
  return useSettingsReady() ? <Overview /> : null;
}

function modelLabel(s: Settings) {
  if (s.provider === 'openai') {
    const vendor = isArk(s.openaiBaseURL) ? '火山方舟' : 'OpenAI 兼容';
    return s.openaiModel ? `${vendor} · ${s.openaiModel}` : vendor;
  }
  const id = s.anthropicModel.trim() || DEFAULT_MODEL;
  return `Claude · ${CLAUDE_MODELS.find((m) => m.id === id)?.label ?? id}`;
}

function Overview() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const model = { ready: aiConfigured(settings), value: modelLabel(settings) };
  const voice = settings.ttsKey ? `豆包 · ${TTS_VOICES.find((v) => v.id === (settings.ttsVoice || DEFAULT_VOICE))?.label ?? '云端'}` : '手机语音';
  const maps = [settings.amapKey && '高德', settings.googlePlacesKey && 'Google'].filter(Boolean).join(' · ') || 'OpenStreetMap';

  return (
    <ScrollView style={{ backgroundColor: Colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 22 }}>
      <Display variant="hero" marker>
        设置
      </Display>

      {!model.ready ? (
        <Pressable onPress={() => router.push('/settings/model')} style={({ pressed }) => [styles.setup, pressed && { opacity: 0.8 }]} accessibilityRole="button">
          <Icon name="sparkle" size={26} color={Colors.onDark} duo={Colors.pop} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.setupTitle}>先接上 AI 模型</Text>
            <Text style={styles.setupText}>填好 API Key，搭子、识图和写游记才能用</Text>
          </View>
          <Icon name="next" size={16} color={Colors.onDark} duo={null} />
        </Pressable>
      ) : null}

      <Pressable onPress={() => router.push('/settings/buddy')} style={({ pressed }) => [styles.buddy, pressed && { opacity: 0.8 }]} accessibilityRole="button">
        <View style={styles.buddyBand} />
        <View style={styles.buddyRing}>
          <BuddyAvatar value={settings.buddyAvatar} size={60} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Display variant="heading">旅行搭子</Display>
          <Text style={styles.value} numberOfLines={1}>
            {settings.buddyPrompt ? '自定义性格' : '默认性格'} · 换头像、改脾气
          </Text>
        </View>
        <Icon name="next" size={16} color={Colors.muted} duo={null} />
      </Pressable>

      <Group title="大脑">
        <Row icon="sparkle" title="AI 模型" value={model.value} href="/settings/model" badge={model.ready ? null : '未配置'} />
      </Group>

      <Group title="搭子的本事">
        <Row
          icon="speaker"
          title="朗读回复"
          value={`${settings.tts ? '自动朗读' : '手动朗读'} · ${voice}`}
          href="/settings/voice"
          trailing={<Switch value={settings.tts} onValueChange={(v) => saveSettings({ tts: v })} trackColor={{ true: Colors.accent }} thumbColor={Colors.card} />}
        />
        <Row icon="food" title="附近美食" value={maps} href="/settings/food" />
      </Group>

      <View style={styles.colophon}>
        <Text style={styles.value}>照片会压缩后发送给模型识别内容，其余数据只保存在这台手机上。</Text>
        <Text style={[styles.value, { fontSize: 11 }]}>
          {Constants.expoConfig?.name} v{Constants.expoConfig?.version}
        </Text>
      </View>
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({ icon, title, value, href, badge, trailing }: { icon: IconName; title: string; value: string; href: Href; badge?: string | null; trailing?: ReactNode }) {
  return (
    <Pressable onPress={() => router.push(href)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.paper }]} accessibilityRole="button">
      <View style={styles.rowIcon}>
        <Icon name={icon} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      {trailing ?? <Icon name="next" size={16} color={Colors.muted} duo={null} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  setup: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: Colors.accent },
  setupTitle: { fontSize: 16, fontWeight: '700', color: Colors.onDark },
  setupText: { fontSize: 12, lineHeight: 18, color: Colors.onDark, opacity: 0.85 },
  buddy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    paddingLeft: 22,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    shadowColor: '#3C2814',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  // Washi-tape strip down the left edge, like a sticker pasted into the journal
  buddyBand: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: Colors.pop },
  buddyRing: { padding: 3, borderRadius: 36, backgroundColor: Colors.popSoft },
  groupTitle: { fontSize: 13, fontWeight: '600', color: Colors.muted, paddingHorizontal: 4, letterSpacing: 0.5 },
  group: { borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line, marginBottom: -StyleSheet.hairlineWidth },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  value: { fontSize: 12, lineHeight: 18, color: Colors.muted },
  badge: { fontSize: 11, fontWeight: '600', color: Colors.accent, backgroundColor: Colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  colophon: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 4 },
});
