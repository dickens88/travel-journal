import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoThumb } from '@/components/common/PhotoThumb';
import { Display, Icon, type IconName } from '@/components/common/ui';
import { Colors } from '@/constants/theme';
import type { Photo } from '@/db/types';
import { useT } from '@/i18n';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Photos already in this trip, newest first, to attach without importing anything
  photos: Photo[];
  selected: string[];
  onToggle: (id: string) => void;
  onCamera: () => void;
  onLibrary: () => void;
};

function Action({ icon, label, hint, onPress }: { icon: IconName; label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.actionIcon}>
        <Icon name={icon} size={24} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

// Bottom sheet behind the composer's "+": shoot a photo, pick from the phone's album, or reuse one from this trip
export function AttachSheet({ visible, onClose, photos, selected, onToggle, onCamera, onLibrary }: Props) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.common.close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Display variant="subheading">{t.buddy.addPhotos}</Display>
        <View style={styles.actions}>
          <Action icon="camera" label={t.buddy.camera} hint={t.buddy.cameraHint} onPress={onCamera} />
          <Action icon="photos" label={t.buddy.library} hint={t.buddy.libraryHint} onPress={onLibrary} />
        </View>
        {photos.length ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.section}>{t.buddy.tripPhotos}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onToggle(p.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.place_name ?? t.buddy.tripPhoto}>
                    <PhotoThumb file={p.file} style={[styles.thumb, on && styles.thumbOn]} />
                    {on ? (
                      <View style={styles.check}>
                        <Text style={styles.checkText}>{selected.indexOf(p.id) + 1}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,22,0.35)' },
  sheet: { backgroundColor: Colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, padding: 14, gap: 4, borderRadius: 16, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.card },
  actionIcon: { marginBottom: 4 },
  actionLabel: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  hint: { fontSize: 12, color: Colors.muted },
  section: { fontSize: 13, fontWeight: '600', color: Colors.inkSoft },
  thumb: { width: 76, height: 76, borderRadius: 12 },
  thumbOn: { borderWidth: 3, borderColor: Colors.accent },
  check: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 11, fontWeight: '700', color: Colors.onDark },
});
