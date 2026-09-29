import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BUDDY_PROMPT } from '@/ai/chat';
import { describeError, getBackend, MODEL } from '@/ai/client';
import { chatCompletion } from '@/ai/openai';
import { Button, Card, Display, Segmented } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { saveSettings, settingsReady, useSettings, type Provider, type Settings } from '@/settings/settings';

const MAAS_URL = 'https://api.modelarts-maas.com/openai/v1';

type Status = { ok: boolean; text: string } | null;
type ModelFields = Pick<Settings, 'provider' | 'apiKey' | 'baseURL' | 'openaiKey' | 'openaiBaseURL' | 'openaiModel' | 'openaiVisionModel'>;

export default function SettingsScreen() {
  useSettings();
  // Secure store loads asynchronously; seed the form only once saved values arrive
  return settingsReady() ? <SettingsForm /> : null;
}

function SettingsForm() {
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={{ backgroundColor: Colors.paper }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Display variant="hero" marker>设置</Display>
        <ModelCard />
        <PromptCard />
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

function Field({ label, ...input }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} placeholderTextColor={Colors.muted} style={styles.input} {...input} />
    </>
  );
}

function ModelCard() {
  const settings = useSettings();
  const [form, setForm] = useState<ModelFields>(() => ({
    provider: settings.provider,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    openaiKey: settings.openaiKey,
    openaiBaseURL: settings.openaiBaseURL,
    openaiModel: settings.openaiModel,
    openaiVisionModel: settings.openaiVisionModel,
  }));
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const set = (patch: Partial<ModelFields>) => setForm((f) => ({ ...f, ...patch }));

  const dirty = (Object.keys(form) as (keyof ModelFields)[]).some((k) => form[k] !== settings[k]);

  const save = async () => {
    const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as ModelFields;
    setForm(trimmed);
    await saveSettings(trimmed);
    setStatus({ ok: true, text: '已保存' });
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      if (dirty) await save();
      const backend = await getBackend();
      let reply: string;
      if (backend.kind === 'openai') {
        const res = await chatCompletion(backend.cfg, { model: backend.model, max_tokens: 256, messages: [{ role: 'user', content: '用一句中文打个招呼。' }] });
        reply = res.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || String(res.finishReason);
      } else {
        const res = await backend.client.messages.create({
          model: MODEL,
          max_tokens: 256,
          output_config: { effort: 'low' },
          messages: [{ role: 'user', content: '用一句中文打个招呼。' }],
        });
        const text = res.content.find((b) => b.type === 'text');
        reply = text && text.type === 'text' ? text.text : String(res.stop_reason);
      }
      setStatus({ ok: true, text: `连接正常：${reply}` });
    } catch (e) {
      setStatus({ ok: false, text: describeError(e) });
    } finally {
      setTesting(false);
    }
  };

  const openai = form.provider === 'openai';
  return (
    <Card style={{ gap: 12 }}>
      <Display variant="subheading">AI 模型</Display>
      <Segmented<Provider>
        options={[
          { value: 'anthropic', label: 'Claude' },
          { value: 'openai', label: 'OpenAI 兼容' },
        ]}
        value={form.provider}
        onChange={(provider) => set({ provider })}
      />
      {openai ? (
        <>
          <Field label="Base URL" value={form.openaiBaseURL} onChangeText={(openaiBaseURL) => set({ openaiBaseURL })} placeholder={MAAS_URL} keyboardType="url" />
          {!form.openaiBaseURL ? (
            <Text style={[styles.hint, { color: Colors.teal }]} onPress={() => set({ openaiBaseURL: MAAS_URL })}>
              使用华为云 MaaS 地址
            </Text>
          ) : null}
          <Field label="API Key" value={form.openaiKey} onChangeText={(openaiKey) => set({ openaiKey })} placeholder="sk-…" secureTextEntry />
          <Field label="模型名" value={form.openaiModel} onChangeText={(openaiModel) => set({ openaiModel })} placeholder="如 deepseek-v3.1" />
          <Field label="看图模型（可选，留空则用上面的模型）" value={form.openaiVisionModel} onChangeText={(openaiVisionModel) => set({ openaiVisionModel })} placeholder="支持图片输入的模型名" />
          <Text style={styles.hint}>
            华为云 MaaS：在控制台「API Key 管理」创建 Key，模型名见各模型的「调用说明」。识别照片和带照片的对话会用看图模型，写游记用上面的模型。这个模式下搭子没有联网搜索。
          </Text>
        </>
      ) : (
        <>
          <Field label="API Key" value={form.apiKey} onChangeText={(apiKey) => set({ apiKey })} placeholder="sk-ant-…" secureTextEntry />
          <Field label="Base URL（可选，国内网络可填代理地址）" value={form.baseURL} onChangeText={(baseURL) => set({ baseURL })} placeholder="https://api.anthropic.com" keyboardType="url" />
          <Text style={styles.hint}>模型：{MODEL}。</Text>
        </>
      )}
      <Text style={styles.hint}>照片会压缩后发送给模型识别内容，其余数据只保存在这台手机上。</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label="保存" onPress={save} disabled={!dirty} style={{ flex: 1 }} />
        <Button label="测试连接" onPress={test} loading={testing} style={{ flex: 1 }} />
      </View>
      {status ? <Text style={[styles.hint, { color: status.ok ? Colors.teal : Colors.accent }]}>{status.text}</Text> : null}
    </Card>
  );
}

function PromptCard() {
  const settings = useSettings();
  const saved = settings.buddyPrompt || BUDDY_PROMPT;
  const [prompt, setPrompt] = useState(saved);
  const [status, setStatus] = useState<Status>(null);

  // The default is stored as empty so later app updates to it still reach the user
  const save = async (text: string) => {
    const t = text.trim();
    if (!t) return setStatus({ ok: false, text: '提示词不能为空，可以点「恢复默认」' });
    const value = t === BUDDY_PROMPT ? '' : t;
    await saveSettings({ buddyPrompt: value });
    setPrompt(value || BUDDY_PROMPT);
    setStatus({ ok: true, text: value ? '已保存，下一条消息开始生效' : '已恢复默认' });
  };

  return (
    <Card style={{ gap: 12 }}>
      <Display variant="subheading">搭子提示词</Display>
      <Text style={styles.hint}>决定旅行搭子的性格、语气和回答方式。旅行素材和当前时间会自动附在后面，记随手记的功能一直可用。</Text>
      <TextInput
        value={prompt}
        onChangeText={(v) => {
          setPrompt(v);
          setStatus(null);
        }}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        style={[styles.input, styles.prompt]}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label="恢复默认" onPress={() => save(BUDDY_PROMPT)} disabled={!settings.buddyPrompt && prompt === BUDDY_PROMPT} style={{ flex: 1 }} />
        <Button label="保存" onPress={() => save(prompt)} disabled={prompt === saved} style={{ flex: 1 }} />
      </View>
      {status ? <Text style={[styles.hint, { color: status.ok ? Colors.teal : Colors.accent }]}>{status.text}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.muted },
  input: { height: 46, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.paper, paddingHorizontal: 12, fontSize: 15, color: Colors.ink },
  prompt: { height: 220, paddingVertical: 10, fontSize: 14, lineHeight: 21 },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
