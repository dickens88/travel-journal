import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CLAUDE_MODELS, claudeBase, claudeEffort, DEFAULT_MODEL, describeError, getBackend } from '@/ai/client';
import { chatCompletion, stripThink } from '@/ai/openai';
import { Button, Icon, Segmented } from '@/components/common/ui';
import { Disclosure, Field, KeyField, Section, SettingsPage, StatusNote, styles as formStyles, Tip, useSettingsSave, type Status } from '@/components/settings/form';
import { Colors } from '@/constants/theme';
import { useSettings, useSettingsReady, type Provider, type Settings } from '@/settings/settings';

// Volcengine Ark; Doubao Seed 2.1 lite reads images too, so one model covers writing and photos
const ARK = { openaiBaseURL: 'https://ark.cn-beijing.volces.com/api/v3', openaiModel: 'doubao-seed-2-1-lite-260915' };
const CLAUDE_KEYS_URL = 'https://platform.claude.com/settings/keys';

type ModelFields = Pick<Settings, 'provider' | 'apiKey' | 'baseURL' | 'anthropicModel' | 'openaiKey' | 'openaiBaseURL' | 'openaiModel' | 'openaiVisionModel' | 'openaiVisionBaseURL'>;

export default function ModelSettings() {
  // Secure store loads asynchronously; seed the form only once saved values arrive
  return useSettingsReady() ? <ModelForm /> : null;
}

function ModelForm() {
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
    openaiVisionBaseURL: settings.openaiVisionBaseURL,
  }));
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const set = (patch: Partial<ModelFields>) => setForm((f) => ({ ...f, ...patch }));

  const dirty = (Object.keys(form) as (keyof ModelFields)[]).some((k) => form[k] !== settings[k]);
  const { saving, save: persist, label } = useSettingsSave(dirty);

  const save = () => {
    const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as ModelFields;
    setForm(trimmed);
    // A test result from before describes the old values
    setStatus(null);
    return persist(trimmed);
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      if (dirty && !(await save())) return;
      const backend = await getBackend();
      let reply: string;
      if (backend.kind === 'openai') {
        const res = await chatCompletion(backend.cfg, { model: backend.model, max_tokens: 256, messages: [{ role: 'user', content: '用一句中文打个招呼。' }] });
        reply = stripThink(res.text) || String(res.finishReason);
        // Photo recognition and photo chats go to the vision model; a bad name there otherwise only shows up later
        if (backend.visionModel !== backend.model || backend.visionCfg !== backend.cfg) {
          try {
            await chatCompletion(backend.visionCfg, { model: backend.visionModel, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] });
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
  const onArk = form.openaiBaseURL === ARK.openaiBaseURL && form.openaiModel === ARK.openaiModel;
  return (
    <SettingsPage
      footer={
        <>
          <Button kind="secondary" label={label} onPress={save} loading={saving} disabled={!dirty || testing} style={{ flex: 1 }} />
          <Button label="测试连接" onPress={test} loading={testing} disabled={saving} style={{ flex: 1 }} />
        </>
      }>
      <Segmented<Provider>
        options={[
          { value: 'anthropic', label: 'Claude' },
          { value: 'openai', label: 'OpenAI 兼容' },
        ]}
        value={form.provider}
        onChange={(provider) => set({ provider })}
      />
      <StatusNote status={status} />

      {openai ? (
        <>
          {!onArk ? (
            <Pressable onPress={() => set({ ...ARK, openaiVisionModel: '', openaiVisionBaseURL: '' })} style={({ pressed }) => [styles.preset, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Icon name="sparkle" size={22} />
              <View style={{ flex: 1 }}>
                <Text style={styles.presetTitle}>一键填好火山方舟</Text>
                <Text style={formStyles.hint}>豆包 Seed 2.1 lite，能写游记也能看照片，只需再填 API Key</Text>
              </View>
              <Icon name="next" size={16} color={Colors.muted} duo={null} />
            </Pressable>
          ) : null}
          <Section title="连接">
            <Field label="Base URL" value={form.openaiBaseURL} onChangeText={(openaiBaseURL) => set({ openaiBaseURL })} placeholder="https://…/v1" keyboardType="url" />
            <KeyField label="API Key" value={form.openaiKey} onChangeText={(openaiKey) => set({ openaiKey })} placeholder="ark-… 或 sk-…" />
            <Field label="模型名" value={form.openaiModel} onChangeText={(openaiModel) => set({ openaiModel })} placeholder="如 doubao-seed-2-1-lite-260915" />
            <Disclosure title="单独的看图模型（可选）" initiallyOpen={!!(settings.openaiVisionModel || settings.openaiVisionBaseURL)}>
              <Text style={formStyles.hint}>识别照片和带照片的对话会用看图模型，写游记用上面的模型。上面的模型能看图就不用填。</Text>
              <Field label="看图模型" value={form.openaiVisionModel} onChangeText={(openaiVisionModel) => set({ openaiVisionModel })} placeholder="留空则用上面的模型" />
              <Field label="看图模型 Base URL" value={form.openaiVisionBaseURL} onChangeText={(openaiVisionBaseURL) => set({ openaiVisionBaseURL })} placeholder="留空则用上面的地址" keyboardType="url" />
            </Disclosure>
          </Section>
          <Tip title="火山方舟怎么开通？">
            在控制台「API Key 管理」创建 Key，并在「开通管理」里开通豆包模型。为了响应速度，调用火山方舟时会关闭深度思考。这个模式下搭子没有联网搜索。
          </Tip>
        </>
      ) : (
        <>
          <Section title="连接">
            <KeyField
              label="API Key"
              value={form.apiKey}
              onChangeText={(apiKey) => set({ apiKey })}
              placeholder="sk-ant-…"
              warning={form.apiKey && !form.apiKey.startsWith('sk-ant-') && !form.baseURL ? 'Claude 的 Key 一般以 sk-ant- 开头，确认一下有没有复制完整' : null}
            />
            <Field label="Base URL（可选，国内网络可填代理地址）" value={form.baseURL} onChangeText={(baseURL) => set({ baseURL })} placeholder="https://api.anthropic.com" keyboardType="url" />
          </Section>
          <ClaudeModelPicker value={form.anthropicModel} onChange={(anthropicModel) => set({ anthropicModel })} />
          <Tip title="Claude API Key 怎么拿？" link={{ label: '去 Claude 控制台', url: CLAUDE_KEYS_URL }}>
            登录 Claude 控制台，在「API Keys」里新建一个 Key，复制后回来点「粘贴」。
          </Tip>
        </>
      )}
      <Text style={[formStyles.hint, { textAlign: 'center' }]}>照片会压缩后发送给模型识别内容，其余数据只保存在这台手机上。</Text>
    </SettingsPage>
  );
}

// Presets as tappable rows; empty value means the default model
function ClaudeModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = value.trim() || DEFAULT_MODEL;
  const preset = CLAUDE_MODELS.some((m) => m.id === current);
  const [custom, setCustom] = useState(!preset);
  return (
    <Section title="模型">
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
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}>
            <View style={[styles.radio, on && styles.radioOn]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, on && { fontWeight: '600' }]}>{m.label}</Text>
              <Text style={formStyles.hint}>{m.note}</Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: custom }} onPress={() => setCustom(true)} style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}>
        <View style={[styles.radio, custom && styles.radioOn]} />
        <Text style={[styles.optionTitle, { flex: 1 }, custom && { fontWeight: '600' }]}>其他模型</Text>
      </Pressable>
      {custom ? <Field label="模型 ID" value={value} onChangeText={onChange} placeholder={DEFAULT_MODEL} /> : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  preset: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.pop, backgroundColor: Colors.card },
  presetTitle: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  optionTitle: { fontSize: 15, color: Colors.ink },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.line },
  radioOn: { borderColor: Colors.teal, borderWidth: 6 },
});
