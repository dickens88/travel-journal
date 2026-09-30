import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { describeError } from '@/ai/client';
import { DEFAULT_VOICE, TTS_VOICES } from '@/ai/cloudTts';
import { previewVoice } from '@/ai/speech';
import { Button, Chip } from '@/components/common/ui';
import { KeyField, Section, SettingsPage, StatusNote, styles as formStyles, Tip, useSettingsSave, type Status } from '@/components/settings/form';
import { Colors } from '@/constants/theme';
import { useT } from '@/i18n';
import { saveSettings, useSettings, useSettingsReady } from '@/settings/settings';

const SPEECH_KEYS_URL = 'https://console.volcengine.com/speech/new/setting/apikeys';

export default function VoiceSettings() {
  return useSettingsReady() ? <VoiceForm /> : null;
}

// Reading replies aloud: the phone's own voice by default, Doubao speech synthesis with an optional key
function VoiceForm() {
  const settings = useSettings();
  const t = useT();
  const [key, setKey] = useState(settings.ttsKey);
  const [voice, setVoice] = useState(settings.ttsVoice || DEFAULT_VOICE);
  const [previewing, setPreviewing] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const dirty = key !== settings.ttsKey || voice !== (settings.ttsVoice || DEFAULT_VOICE);
  const { saving, save, label } = useSettingsSave(dirty);

  const preview = async () => {
    setPreviewing(true);
    setStatus(null);
    try {
      await previewVoice(t.voice.previewText, key, voice);
      setStatus({ ok: true, text: t.voice.previewing });
    } catch (e) {
      setStatus({ ok: false, text: describeError(e) });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <SettingsPage
      footer={
        <>
          <Button kind="secondary" label={label} onPress={() => save({ ttsKey: key, ttsVoice: voice })} loading={saving} disabled={!dirty} style={{ flex: 1 }} />
          <Button label={t.voice.preview} icon="speaker" onPress={preview} loading={previewing} disabled={!key || saving} style={{ flex: 1 }} />
        </>
      }>
      <Section note={t.voice.autoNote}>
        <View style={formStyles.row}>
          <Text style={{ flex: 1, fontSize: 15, color: Colors.ink }}>{t.voice.autoRead}</Text>
          <Switch value={settings.tts} onValueChange={(v) => saveSettings({ tts: v })} trackColor={{ true: Colors.accent }} thumbColor={Colors.card} />
        </View>
      </Section>

      <Section title={t.voice.sound}>
        <View style={[formStyles.row, { alignItems: 'flex-start' }]}>
          <Text style={[formStyles.hint, { flex: 1 }]}>{t.voice.soundHint}</Text>
          <Chip icon={key ? 'cloud' : 'speaker'} label={key ? t.voice.doubaoCloud : t.voice.phoneVoice} tone="teal" />
        </View>
        <KeyField label={t.voice.keyLabel} value={key} onChangeText={setKey} placeholder={t.voice.keyPlaceholder} />
        {key ? (
          <>
            <Text style={formStyles.label}>{t.voice.voiceLabel}</Text>
            <View style={styles.voices}>
              {TTS_VOICES.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => setVoice(id)}
                  style={[styles.voice, voice === id && styles.voiceOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: voice === id }}>
                  <Text style={{ fontSize: 14, color: voice === id ? Colors.teal : Colors.ink }}>{t.voice.voices[id]}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </Section>
      <StatusNote status={status} />

      <Tip title={t.voice.tipTitle} link={{ label: t.voice.tipLink, url: SPEECH_KEYS_URL }}>
        {t.voice.tip}
      </Tip>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  voices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voice: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, backgroundColor: Colors.paper },
  voiceOn: { borderColor: Colors.teal, backgroundColor: Colors.tealSoft },
});
