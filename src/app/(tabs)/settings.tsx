import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CLAUDE_MODELS, DEFAULT_MODEL } from '@/ai/client';
import { DEFAULT_VOICE } from '@/ai/cloudTts';
import { isArk } from '@/ai/openai';
import { BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { Display, Icon, Segmented, type IconName } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { LANGS, LOCALES, useLangPref, useT, type LangPref, type Messages } from '@/i18n';
import { aiConfigured, setLanguage, useSettings, useSettingsReady, type Settings } from '@/settings/settings';

export default function SettingsScreen() {
  // Secure store loads asynchronously; the summaries need the saved values
  return useSettingsReady() ? <Overview /> : null;
}

function modelLabel(s: Settings, t: Messages) {
  if (s.provider === 'openai') {
    const vendor = isArk(s.openaiBaseURL) ? t.settings.ark : t.settings.openaiCompatible;
    return s.openaiModel ? `${vendor} · ${s.openaiModel}` : vendor;
  }
  const id = s.anthropicModel.trim() || DEFAULT_MODEL;
  return `Claude · ${CLAUDE_MODELS.find((m) => m.id === id)?.label ?? id}`;
}

function Overview() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const t = useT();
  const langPref = useLangPref();
  const model = { ready: aiConfigured(settings), value: modelLabel(settings, t) };
  const voice = settings.ttsKey ? `${t.settings.doubao} · ${t.voice.voices[settings.ttsVoice || DEFAULT_VOICE] ?? t.settings.cloud}` : t.settings.phoneVoice;
  const maps = [settings.amapKey && t.settings.amap, settings.googlePlacesKey && 'Google'].filter(Boolean).join(' · ') || 'OpenStreetMap';

  return (
    <ScrollView style={{ backgroundColor: Colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 22 }}>
      <Display variant="hero" marker>
        {t.settings.title}
      </Display>

      {!model.ready ? (
        <Pressable onPress={() => router.push('/settings/model')} style={({ pressed }) => [styles.setup, pressed && { opacity: 0.8 }]} accessibilityRole="button">
          <Icon name="sparkle" size={26} color={Colors.onDark} duo={Colors.pop} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.setupTitle}>{t.settings.setupTitle}</Text>
            <Text style={styles.setupText}>{t.settings.setupText}</Text>
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
          <Display variant="heading">{t.settings.buddy}</Display>
          <Text style={styles.value} numberOfLines={1}>
            {settings.buddyPrompt ? t.settings.customPersona : t.settings.defaultPersona} · {t.settings.buddyHint}
          </Text>
        </View>
        <Icon name="next" size={16} color={Colors.muted} duo={null} />
      </Pressable>

      <Group title={t.settings.language}>
        <View style={styles.language}>
          <Segmented<LangPref>
            // Each language by its own name, so it can be found whatever the current one is
            options={[{ value: 'system', label: t.settings.followSystem }, ...LANGS.map((l) => ({ value: l, label: LOCALES[l].name }))]}
            value={langPref}
            onChange={setLanguage}
          />
          <Text style={styles.value}>{t.settings.languageHint}</Text>
        </View>
      </Group>

      <Group title={t.settings.brain}>
        <Row icon="sparkle" title={t.settings.aiModel} value={model.value} href="/settings/model" badge={model.ready ? null : t.settings.notSet} />
      </Group>

      <Group title={t.settings.skills}>
        <Row
          icon="speaker"
          title={t.settings.readAloud}
          value={voice}
          href="/settings/voice"
        />
        <Row icon="food" title={t.settings.food} value={maps} href="/settings/food" />
      </Group>

      <View style={styles.colophon}>
        <Text style={styles.value}>{t.settings.privacy}</Text>
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

function Row({ icon, title, value, href, badge }: { icon: IconName; title: string; value: string; href: Href; badge?: string | null }) {
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
      <Icon name="next" size={16} color={Colors.muted} duo={null} />
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
  language: { gap: 8, padding: 12 },
  group: { borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line, marginBottom: -StyleSheet.hairlineWidth },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  value: { fontSize: 12, lineHeight: 18, color: Colors.muted },
  badge: { fontSize: 11, fontWeight: '600', color: Colors.accent, backgroundColor: Colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  colophon: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 4 },
});
