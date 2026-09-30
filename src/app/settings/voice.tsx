import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { describeError } from '@/ai/client';
import { DEFAULT_VOICE, TTS_VOICES } from '@/ai/cloudTts';
import { previewVoice } from '@/ai/speech';
import { Button, Chip } from '@/components/common/ui';
import { KeyField, Section, SettingsPage, StatusNote, styles as formStyles, Tip, useSettingsSave, type Status } from '@/components/settings/form';
import { Colors } from '@/constants/theme';
import { saveSettings, useSettings, useSettingsReady } from '@/settings/settings';

const SPEECH_KEYS_URL = 'https://console.volcengine.com/speech/new/setting/apikeys';

export default function VoiceSettings() {
  return useSettingsReady() ? <VoiceForm /> : null;
}

// Reading replies aloud: the phone's own voice by default, Doubao speech synthesis with an optional key
function VoiceForm() {
  const settings = useSettings();
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
      await previewVoice('你好呀，我是你的旅行搭子。今天想去哪儿逛逛？', key, voice);
      setStatus({ ok: true, text: '正在试听，听着合适就点「保存」' });
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
          <Button label="试听" icon="speaker" onPress={preview} loading={previewing} disabled={!key || saving} style={{ flex: 1 }} />
        </>
      }>
      <Section note="随时可以在对话里关闭，每条回复下面也能单独点「朗读」">
        <View style={formStyles.row}>
          <Text style={{ flex: 1, fontSize: 15, color: Colors.ink }}>自动朗读搭子的回复</Text>
          <Switch value={settings.tts} onValueChange={(v) => saveSettings({ tts: v })} trackColor={{ true: Colors.accent }} thumbColor={Colors.card} />
        </View>
      </Section>

      <Section title="声音">
        <View style={[formStyles.row, { alignItems: 'flex-start' }]}>
          <Text style={[formStyles.hint, { flex: 1 }]}>不填 Key 用手机自带的语音，免费也不用联网；填了改用豆包云端合成，声音更自然，按朗读的字数计费。</Text>
          <Chip icon={key ? 'cloud' : 'speaker'} label={key ? '豆包云端' : '手机语音'} tone="teal" />
        </View>
        <KeyField label="豆包语音 API Key（填了就用云端）" value={key} onChangeText={setKey} placeholder="新版控制台的 API Key" />
        {key ? (
          <>
            <Text style={formStyles.label}>音色</Text>
            <View style={styles.voices}>
              {TTS_VOICES.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => setVoice(v.id)}
                  style={[styles.voice, voice === v.id && styles.voiceOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: voice === v.id }}>
                  <Text style={{ fontSize: 14, color: voice === v.id ? Colors.teal : Colors.ink }}>{v.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </Section>
      <StatusNote status={status} />

      <Tip title="豆包语音怎么开通？" link={{ label: '去豆包语音控制台', url: SPEECH_KEYS_URL }}>
        在豆包语音控制台开通「豆包语音合成模型 2.0」（资源 ID seed-tts-2.0），在新版控制台创建 API Key。回复出来后大约一秒开始读；没网或出错时自动换回手机语音。
      </Tip>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  voices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voice: { paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.line, borderRadius: 18, backgroundColor: Colors.paper },
  voiceOn: { borderColor: Colors.teal, backgroundColor: Colors.tealSoft },
});
