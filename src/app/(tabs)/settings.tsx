import * as Clipboard from 'expo-clipboard';
import { useState, type ComponentProps } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BUDDY_PROMPT } from '@/ai/chat';
import { CLAUDE_MODELS, claudeBase, claudeEffort, DEFAULT_MODEL, describeError, getBackend } from '@/ai/client';
import { chatCompletion } from '@/ai/openai';
import { Button, Card, Display, Segmented } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { saveSettings, useSettings, useSettingsReady, type Provider, type Settings } from '@/settings/settings';

const MAAS_URL = 'https://api.modelarts-maas.com/openai/v1';
const CLAUDE_KEYS_URL = 'https://platform.claude.com/settings/keys';

type Status = { ok: boolean; text: string } | null;
type ModelFields = Pick<Settings, 'provider' | 'apiKey' | 'baseURL' | 'anthropicModel' | 'openaiKey' | 'openaiBaseURL' | 'openaiModel' | 'openaiVisionModel'>;

export default function SettingsScreen() {
  // Secure store loads asynchronously; seed the form only once saved values arrive
  return useSettingsReady() ? <SettingsForm /> : null;
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

function openLink(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('打不开链接', url));
}

// Secret input with show/hide and a one-tap paste from the clipboard.
// Masked only while not being edited: many Android phones switch password fields to a secure keyboard with no clipboard, which blocks pasting.
function KeyField({ label, value, onChangeText, placeholder, warning }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; warning?: string | null }) {
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) onChangeText(text);
    else Alert.alert('剪贴板是空的', '先在网页上复制 API Key，再回来点「粘贴」');
  };
  return (
    <>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {value ? (
          <Text style={[styles.label, { color: Colors.teal }]} onPress={() => setShown((v) => !v)} suppressHighlighting>
            {shown ? '隐藏' : '显示'}
          </Text>
        ) : null}
      </View>
      <View style={styles.row}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={Colors.muted}
          style={[styles.input, { flex: 1 }]}
          value={value}
          onChangeText={(v) => onChangeText(v.trim())}
          placeholder={placeholder}
          secureTextEntry={!shown && !focused && !!value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Button compact kind="secondary" icon="copy" label="粘贴" onPress={paste} style={{ height: 46 }} />
      </View>
      {warning ? <Text style={[styles.hint, { color: Colors.accent }]}>{warning}</Text> : null}
    </>
  );
}

function ModelCard() {
  const settings = useSettings();
  const [form, setForm] = useState<ModelFields>(() => ({
    provider: settings.provider,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    anthropicModel: settings.anthropicModel,
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
        // Photo recognition and photo chats go to the vision model; a bad name there otherwise only shows up later
        if (backend.visionModel !== backend.model) {
          try {
            await chatCompletion(backend.cfg, { model: backend.visionModel, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] });
          } catch (e) {
            setStatus({ ok: false, text: `模型 ${backend.model} 正常，看图模型 ${backend.visionModel} 出错：${describeError(e)}` });
            return;
          }
          reply += `\n看图模型 ${backend.visionModel} 也正常`;
        }
      } else {
        const res = await backend.client.messages.create({
          ...claudeBase(backend.model),
          max_tokens: 256,
          output_config: claudeEffort(backend.model, 'low'),
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
          <Field label="Base URL" value={form.openaiBaseURL} onChangeText={(openaiBaseURL) => set({ openaiBaseURL })} placeholder="https://…/v1" keyboardType="url" />
          {!form.openaiBaseURL ? (
            <Text style={[styles.hint, { color: Colors.teal }]} onPress={() => set({ openaiBaseURL: MAAS_URL })}>
              使用华为云 MaaS 地址
            </Text>
          ) : null}
          <KeyField label="API Key" value={form.openaiKey} onChangeText={(openaiKey) => set({ openaiKey })} placeholder="sk-…" />
          <Field label="模型名" value={form.openaiModel} onChangeText={(openaiModel) => set({ openaiModel })} placeholder="如 deepseek-v3.1" />
          <Field label="看图模型（可选，留空则用上面的模型）" value={form.openaiVisionModel} onChangeText={(openaiVisionModel) => set({ openaiVisionModel })} placeholder="支持图片输入的模型名" />
          <Text style={styles.hint}>
            华为云 MaaS：在控制台「API Key 管理」创建 Key，模型名见各模型的「调用说明」。识别照片和带照片的对话会用看图模型，写游记用上面的模型。这个模式下搭子没有联网搜索。
          </Text>
        </>
      ) : (
        <>
          <KeyField
            label="API Key"
            value={form.apiKey}
            onChangeText={(apiKey) => set({ apiKey })}
            placeholder="sk-ant-…"
            warning={form.apiKey && !form.apiKey.startsWith('sk-ant-') && !form.baseURL ? 'Claude 的 Key 一般以 sk-ant- 开头，确认一下有没有复制完整' : null}
          />
          <Field label="Base URL（可选，国内网络可填代理地址）" value={form.baseURL} onChangeText={(baseURL) => set({ baseURL })} placeholder="https://api.anthropic.com" keyboardType="url" />
          <ClaudeModelPicker value={form.anthropicModel} onChange={(anthropicModel) => set({ anthropicModel })} />
          <Text style={styles.hint}>
            <Text style={{ color: Colors.teal }} onPress={() => openLink(CLAUDE_KEYS_URL)}>
              去 Claude 控制台获取 API Key
            </Text>
          </Text>
        </>
      )}
      <Text style={styles.hint}>照片会压缩后发送给模型识别内容，其余数据只保存在这台手机上。</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" label={dirty ? '保存' : '已保存'} onPress={save} disabled={!dirty} style={{ flex: 1 }} />
        <Button label="测试连接" onPress={test} loading={testing} style={{ flex: 1 }} />
      </View>
      {status ? <Text style={[styles.hint, { color: status.ok ? Colors.teal : Colors.accent }]}>{status.text}</Text> : null}
    </Card>
  );
}

// Presets as tappable rows; empty value means the default model
function ClaudeModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = value.trim() || DEFAULT_MODEL;
  const preset = CLAUDE_MODELS.some((m) => m.id === current);
  const [custom, setCustom] = useState(!preset);
  return (
    <>
      <Text style={styles.label}>模型</Text>
      <View style={styles.options}>
        {CLAUDE_MODELS.map((m) => {
          const on = !custom && m.id === current;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                setCustom(false);
                onChange(m.id === DEFAULT_MODEL ? '' : m.id);
              }}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.6 }]}>
              <View style={[styles.radio, on && styles.radioOn]} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: Colors.ink, fontWeight: on ? '600' : '400' }}>{m.label}</Text>
                <Text style={styles.hint}>{m.note}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: custom }}
          onPress={() => setCustom(true)}
          style={({ pressed }) => [styles.option, custom && styles.optionOn, pressed && { opacity: 0.6 }]}>
          <View style={[styles.radio, custom && styles.radioOn]} />
          <Text style={{ flex: 1, fontSize: 15, color: Colors.ink, fontWeight: custom ? '600' : '400' }}>其他模型</Text>
        </Pressable>
      </View>
      {custom ? <Field label="模型 ID" value={value} onChangeText={onChange} placeholder={DEFAULT_MODEL} /> : null}
    </>
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
        <Button label={prompt === saved ? '已保存' : '保存'} onPress={() => save(prompt)} disabled={prompt === saved} style={{ flex: 1 }} />
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
  options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.paper },
  optionOn: { borderColor: Colors.teal, backgroundColor: Colors.tealSoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.line },
  radioOn: { borderColor: Colors.teal, borderWidth: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
