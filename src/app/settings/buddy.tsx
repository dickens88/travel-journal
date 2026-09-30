import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BUDDY_PROMPT } from '@/ai/chat';
import { describeError } from '@/ai/client';
import { AVATAR_PRESETS, BuddyAvatar } from '@/components/buddy/BuddyAvatar';
import { toast } from '@/components/common/Toast';
import { Button, Chip, Icon } from '@/components/common/ui';
import { Section, SettingsPage, styles as formStyles, useSettingsSave } from '@/components/settings/form';
import { Colors } from '@/constants/theme';
import { avatarPhotoFile, deleteAvatarPhoto, pickAvatarPhoto } from '@/settings/avatar';
import { useSettings, useSettingsReady } from '@/settings/settings';

export default function BuddySettings() {
  return useSettingsReady() ? <BuddyForm /> : null;
}

// Avatar and prompt are edited together and saved with one button
function BuddyForm() {
  const settings = useSettings();
  const [avatar, setAvatar] = useState(settings.buddyAvatar);
  const [prompt, setPrompt] = useState(settings.buddyPrompt || BUDDY_PROMPT);
  const [uploading, setUploading] = useState(false);
  const photo = avatarPhotoFile(avatar);

  // The default prompt is stored as empty so later app updates to it still reach the user
  const promptValue = prompt.trim() === BUDDY_PROMPT ? '' : prompt.trim();
  const dirty = avatar !== settings.buddyAvatar || promptValue !== settings.buddyPrompt;
  const { saving, save: persist, label } = useSettingsSave(dirty);

  // An uploaded picture that was never saved has no other owner; drop it when it is replaced or left behind
  const unsaved = useRef('');
  useEffect(() => () => deleteAvatarPhoto(unsaved.current), []);

  const choose = (value: string) => {
    if (value === avatar) return;
    deleteAvatarPhoto(unsaved.current);
    setAvatar(value);
    unsaved.current = value === settings.buddyAvatar ? '' : value;
  };

  const upload = async () => {
    setUploading(true);
    try {
      const value = await pickAvatarPhoto();
      if (value) choose(value);
    } catch (e) {
      Alert.alert('头像没能换成', describeError(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!prompt.trim()) return toast('提示词不能为空，可以点「恢复默认」', false);
    const old = settings.buddyAvatar;
    if (!(await persist({ buddyAvatar: avatar, buddyPrompt: promptValue }, '已保存，下一条消息开始生效'))) return;
    unsaved.current = '';
    // Only one uploaded picture is kept; switching away from it removes the file
    if (old !== avatar) deleteAvatarPhoto(old);
    setPrompt(promptValue || BUDDY_PROMPT);
  };

  return (
    <SettingsPage footer={<Button label={label} onPress={save} loading={saving} disabled={!dirty || uploading} style={{ flex: 1 }} />}>
      <View style={styles.hero}>
        <View style={styles.heroRing}>
          <BuddyAvatar value={avatar} size={88} />
        </View>
        <View>
          <Chip icon="buddy" label={promptValue ? '自定义性格' : '默认性格'} tone={promptValue ? 'teal' : 'plain'} />
        </View>
      </View>

      <Section title="头像" note="挑一只小动物，或者上传一张自己喜欢的图">
        <View style={styles.tiles}>
          <AvatarTile on={!avatar} label="默认" onPress={() => choose('')}>
            <BuddyAvatar value="" size={52} />
          </AvatarTile>
          {AVATAR_PRESETS.map((p) => (
            <AvatarTile key={p.id} on={avatar === p.id} label={p.label} onPress={() => choose(p.id)}>
              <BuddyAvatar value={p.id} size={52} />
            </AvatarTile>
          ))}
          <AvatarTile on={!!photo} label={uploading ? '处理中…' : photo ? '换一张' : '上传'} onPress={() => !uploading && upload()}>
            {photo ? (
              <BuddyAvatar value={avatar} size={52} />
            ) : (
              <View style={styles.upload}>
                <Icon name="addPhoto" size={24} />
              </View>
            )}
          </AvatarTile>
        </View>
      </Section>

      <Section title="性格" note="决定搭子的性格、语气和回答方式。旅行素材和当前时间会自动附在后面，记随手记的功能一直可用。">
        <View style={formStyles.labelRow}>
          <Text style={formStyles.label}>提示词</Text>
          {promptValue ? (
            <Text style={[formStyles.label, { color: Colors.teal }]} onPress={() => setPrompt(BUDDY_PROMPT)} suppressHighlighting>
              恢复默认
            </Text>
          ) : null}
        </View>
        <TextInput value={prompt} onChangeText={setPrompt} multiline textAlignVertical="top" autoCorrect={false} style={[formStyles.input, styles.prompt]} />
      </Section>
    </SettingsPage>
  );
}

function AvatarTile({ on, label, onPress, children }: { on: boolean; label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]}>
      <View style={[styles.tileRing, on && { borderColor: Colors.teal }]}>{children}</View>
      <Text style={[formStyles.hint, on && { color: Colors.teal, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingTop: 8 },
  heroRing: { padding: 4, borderRadius: 52, backgroundColor: Colors.popSoft, marginBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  tile: { width: '25%', alignItems: 'center', gap: 4 },
  tileRing: { padding: 2, borderRadius: 30, borderWidth: 2.5, borderColor: 'transparent' },
  upload: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.line, backgroundColor: Colors.paper, alignItems: 'center', justifyContent: 'center' },
  prompt: { height: 260, paddingVertical: 10, fontSize: 14, lineHeight: 21 },
});
