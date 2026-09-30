import * as Clipboard from 'expo-clipboard';
import { useNavigation } from 'expo-router';
import { useHeaderHeight, usePreventRemove } from 'expo-router/react-navigation';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/ai/client';
import { toast } from '@/components/common/Toast';
import { Button, Card, Icon, type IconName } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import { saveSettings, type Settings } from '@/settings/settings';

export type Status = { ok: boolean; text: string } | null;

function openLink(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('打不开链接', url));
}

// Save flow shared by the settings sub-pages: toasts the outcome and guards leaving with unsaved edits.
// save resolves to whether it worked, so a page can run follow-up steps only on success.
export function useSettingsSave(dirty: boolean) {
  const [saving, setSaving] = useState(false);
  useLeaveGuard(dirty && !saving);
  const save = async (patch: Partial<Settings>, done = '已保存') => {
    setSaving(true);
    try {
      await saveSettings(patch);
      toast(done);
      return true;
    } catch (e) {
      toast(`保存失败：${describeError(e)}`, false);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, save, label: saving ? '保存中' : dirty ? '保存' : '已保存' };
}

// A settings sub-page: scrolling form with the page's actions pinned above the keyboard
export function SettingsPage({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.paper }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

// Asks before going back with edits that were never saved
function useLeaveGuard(dirty: boolean) {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    Alert.alert('还没保存', '离开后这一页的修改会丢掉', [
      { text: '继续编辑', style: 'cancel' },
      { text: '不保存', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}

// A titled group of fields
export function Section({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <Card style={{ gap: 12 }}>{children}</Card>
      {note ? <Text style={[styles.hint, { paddingHorizontal: 4 }]}>{note}</Text> : null}
    </View>
  );
}

// Tap-to-open help, so setup instructions don't crowd the fields
export function Tip({ title, children, link }: { title: string; children: ReactNode; link?: { label: string; url: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.tip}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.tipHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Icon name="lightbulb" size={16} color={Colors.teal} duo={Colors.popSoft} />
        <Text style={styles.tipTitle}>{title}</Text>
        <Chevron open={open} color={Colors.teal} />
      </Pressable>
      {open ? (
        <View style={{ gap: 8, paddingTop: 8 }}>
          <Text style={styles.hint}>{children}</Text>
          {link ? (
            <Text style={styles.link} onPress={() => openLink(link.url)} suppressHighlighting>
              {link.label} ›
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Folded-away optional fields; starts open when any of them already has a value
export function Disclosure({ title, initiallyOpen, children }: { title: string; initiallyOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.disclosure} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={[styles.label, { flex: 1 }]}>{title}</Text>
        <Chevron open={open} color={Colors.muted} />
      </Pressable>
      {open ? children : null}
    </>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Icon name="collapse" size={14} color={color} duo={null} />
    </View>
  );
}

// Result of a test call, as a tinted banner
export function StatusNote({ status }: { status: Status }) {
  if (!status) return null;
  const icon: IconName = status.ok ? 'sparkle' : 'warning';
  return (
    <View style={[styles.status, { backgroundColor: status.ok ? Colors.tealSoft : Colors.accentSoft }]}>
      <Icon name={icon} size={16} color={status.ok ? Colors.teal : Colors.accent} duo={null} />
      <Text style={[styles.statusText, { color: status.ok ? Colors.teal : Colors.accent }]}>{status.text}</Text>
    </View>
  );
}

export function Field({ label, ...input }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput autoCapitalize="none" autoCorrect={false} placeholderTextColor={Colors.muted} style={styles.input} {...input} />
    </View>
  );
}

// Secret input with show/hide and a one-tap paste from the clipboard.
// Masked only while not being edited: many Android phones switch password fields to a secure keyboard with no clipboard, which blocks pasting.
export function KeyField({ label, value, onChangeText, placeholder, warning }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; warning?: string | null }) {
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) onChangeText(text);
    else Alert.alert('剪贴板是空的', '先在网页上复制 API Key，再回来点「粘贴」');
  };
  return (
    <View style={styles.field}>
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
    </View>
  );
}

export const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32, gap: 20 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 16, backgroundColor: Colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.muted, paddingHorizontal: 4, letterSpacing: 0.5 },
  field: { gap: 6 },
  label: { fontSize: 13, color: Colors.muted },
  input: { height: 46, borderWidth: 1, borderColor: Colors.line, borderRadius: 12, backgroundColor: Colors.paper, paddingHorizontal: 12, fontSize: 15, color: Colors.ink },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.muted },
  link: { fontSize: 13, fontWeight: '600', color: Colors.teal },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tip: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.tealSoft },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.teal },
  disclosure: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line, paddingTop: 12 },
  status: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
  statusText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
