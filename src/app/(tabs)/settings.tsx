import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError, getClient, MODEL } from '@/ai/client';
import { Button, Card, Display } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { saveSettings, settingsReady, useSettings } from '@/settings/settings';

export default function SettingsScreen() {
  useSettings();
  // Secure store loads asynchronously; seed the form only once saved values arrive
  return settingsReady() ? <SettingsForm /> : null;
}

function SettingsForm() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [baseURL, setBaseURL] = useState(settings.baseURL);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = apiKey !== settings.apiKey || baseURL !== settings.baseURL;

  const save = async () => {
    setApiKey(apiKey.trim());
    setBaseURL(baseURL.trim());
    await saveSettings({ apiKey: apiKey.trim(), baseURL: baseURL.trim() });
    setStatus({ ok: true, text: '已保存' });
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      if (dirty) await save();
      const client = await getClient();
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: '用一句中文打个招呼。' }],
      });
      const text = res.content.find((b) => b.type === 'text');
      setStatus({ ok: true, text: `连接正常：${text && text.type === 'text' ? text.text : res.stop_reason}` });
    } catch (e) {
      setStatus({ ok: false, text: describeError(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={{ backgroundColor: Colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Display variant="hero" marker>设置</Display>
        <Card style={{ gap: 12 }}>
          <Display variant="subheading">Claude</Display>
          <Text style={styles.label}>API Key</Text>
          <TextInput value={apiKey} onChangeText={setApiKey} placeholder="sk-ant-…" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          <Text style={styles.label}>Base URL（可选，国内网络可填代理地址）</Text>
          <TextInput value={baseURL} onChangeText={setBaseURL} placeholder="https://api.anthropic.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
          <Text style={styles.hint}>模型：{MODEL}。照片会压缩后发送给 Claude 识别内容，其余数据只保存在这台手机上。</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" label="保存" onPress={save} disabled={!dirty} style={{ flex: 1 }} />
            <Button label="测试连接" onPress={test} loading={testing} style={{ flex: 1 }} />
          </View>
          {status ? <Text style={[styles.hint, { color: status.ok ? Colors.teal : Colors.accent }]}>{status.text}</Text> : null}
        </Card>
        <Card style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: Colors.ink }}>自动朗读搭子的回复</Text>
            <Text style={styles.hint}>使用系统语音，随时可以在对话里关闭</Text>
          </View>
          <Switch value={settings.tts} onValueChange={(v) => saveSettings({ tts: v })} trackColor={{ true: Colors.accent }} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.muted },
  input: { height: 46, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.paper, paddingHorizontal: 12, fontSize: 15, color: Colors.ink },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
