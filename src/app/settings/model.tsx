import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CLAUDE_MODELS, claudeBase, claudeEffort, DEFAULT_MODEL, describeError, getBackend } from '@/ai/client';
import { chatCompletion, stripThink } from '@/ai/openai';
import { Button, Icon, Segmented } from '@/components/common/ui';
import { Disclosure, Field, KeyField, Section, SettingsPage, StatusNote, styles as formStyles, Tip, useSettingsSave, type Status } from '@/components/settings/form';
import { Colors } from '@/constants/theme';
import { useT } from '@/i18n';
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
  const t = useT();
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
        const res = await chatCompletion(backend.cfg, { model: backend.model, max_tokens: 256, messages: [{ role: 'user', content: t.model.greeting }] });
        reply = stripThink(res.text) || String(res.finishReason);
        // Photo recognition and photo chats go to the vision model; a bad name there otherwise only shows up later
        if (backend.visionModel !== backend.model || backend.visionCfg !== backend.cfg) {
          try {
            await chatCompletion(backend.visionCfg, { model: backend.visionModel, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] });
          } catch (e) {
            setStatus({ ok: false, text: t.model.visionFailed(backend.model, backend.visionModel, describeError(e)) });
            return;
          }
          reply += `\n${t.model.visionOk(backend.visionModel)}`;
        }
      } else {
        const res = await backend.client.messages.create({
          ...claudeBase(backend.model),
          max_tokens: 256,
          output_config: claudeEffort(backend.model, 'low'),
          messages: [{ role: 'user', content: t.model.greeting }],
        });
        const text = res.content.find((b) => b.type === 'text');
        reply = text && text.type === 'text' ? text.text : String(res.stop_reason);
      }
      setStatus({ ok: true, text: t.model.connected(reply) });
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
          <Button label={t.model.testConnection} onPress={test} loading={testing} disabled={saving} style={{ flex: 1 }} />
        </>
      }>
      <Segmented<Provider>
        options={[
          { value: 'anthropic', label: 'Claude' },
          { value: 'openai', label: t.settings.openaiCompatible },
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
                <Text style={styles.presetTitle}>{t.model.arkPreset}</Text>
                <Text style={formStyles.hint}>{t.model.arkPresetHint}</Text>
              </View>
              <Icon name="next" size={16} color={Colors.muted} duo={null} />
            </Pressable>
          ) : null}
          <Section title={t.model.connection}>
            <Field label="Base URL" value={form.openaiBaseURL} onChangeText={(openaiBaseURL) => set({ openaiBaseURL })} placeholder="https://…/v1" keyboardType="url" />
            <KeyField label="API Key" value={form.openaiKey} onChangeText={(openaiKey) => set({ openaiKey })} placeholder={t.model.openaiKeyPlaceholder} />
            <Field label={t.model.modelName} value={form.openaiModel} onChangeText={(openaiModel) => set({ openaiModel })} placeholder={t.model.modelNamePlaceholder} />
            <Disclosure title={t.model.visionSection} initiallyOpen={!!(settings.openaiVisionModel || settings.openaiVisionBaseURL)}>
              <Text style={formStyles.hint}>{t.model.visionHint}</Text>
              <Field label={t.model.visionModel} value={form.openaiVisionModel} onChangeText={(openaiVisionModel) => set({ openaiVisionModel })} placeholder={t.model.visionModelPlaceholder} />
              <Field label={t.model.visionBaseURL} value={form.openaiVisionBaseURL} onChangeText={(openaiVisionBaseURL) => set({ openaiVisionBaseURL })} placeholder={t.model.visionBaseURLPlaceholder} keyboardType="url" />
            </Disclosure>
          </Section>
          <Tip title={t.model.arkTipTitle}>
            {t.model.arkTip}
          </Tip>
        </>
      ) : (
        <>
          <Section title={t.model.connection}>
            <KeyField
              label="API Key"
              value={form.apiKey}
              onChangeText={(apiKey) => set({ apiKey })}
              placeholder="sk-ant-…"
              warning={form.apiKey && !form.apiKey.startsWith('sk-ant-') && !form.baseURL ? t.model.claudeKeyWarning : null}
            />
            <Field label={t.model.claudeBaseURL} value={form.baseURL} onChangeText={(baseURL) => set({ baseURL })} placeholder="https://api.anthropic.com" keyboardType="url" />
          </Section>
          <ClaudeModelPicker value={form.anthropicModel} onChange={(anthropicModel) => set({ anthropicModel })} />
          <Tip title={t.model.claudeTipTitle} link={{ label: t.model.claudeTipLink, url: CLAUDE_KEYS_URL }}>
            {t.model.claudeTip}
          </Tip>
        </>
      )}
      <Text style={[formStyles.hint, { textAlign: 'center' }]}>{t.settings.privacy}</Text>
    </SettingsPage>
  );
}

// Presets as tappable rows; empty value means the default model
function ClaudeModelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const current = value.trim() || DEFAULT_MODEL;
  const preset = CLAUDE_MODELS.some((m) => m.id === current);
  const [custom, setCustom] = useState(!preset);
  return (
    <Section title={t.model.model}>
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
              <Text style={formStyles.hint}>{t.model.claudeNotes[m.id]}</Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: custom }} onPress={() => setCustom(true)} style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}>
        <View style={[styles.radio, custom && styles.radioOn]} />
        <Text style={[styles.optionTitle, { flex: 1 }, custom && { fontWeight: '600' }]}>{t.model.otherModel}</Text>
      </Pressable>
      {custom ? <Field label={t.model.modelId} value={value} onChangeText={onChange} placeholder={DEFAULT_MODEL} /> : null}
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
