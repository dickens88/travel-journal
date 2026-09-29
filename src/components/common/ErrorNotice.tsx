import { router } from 'expo-router';
import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Icon } from '@/components/common/ui';
import { Colors } from '@/constants/theme';

type Props = { title: string; message: string; onRetry?: () => void; onDismiss?: () => void; style?: StyleProp<ViewStyle> };

// Failure card: what was being done, the error exactly as raised, and ways forward
export function ErrorNotice({ title, message, onRetry, onDismiss, style }: Props) {
  return (
    <View style={[styles.box, style]} accessibilityRole="alert">
      <View style={styles.head}>
        <Icon name="warning" size={20} color={Colors.accent} />
        <Text style={styles.title}>{title}</Text>
        {onDismiss ? (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="关闭提示">
            <Icon name="close" size={16} color={Colors.muted} duo={null} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.message} selectable>
        {message.trim()}
      </Text>
      <View style={styles.actions}>
        {onRetry ? <Button compact label="重试" onPress={onRetry} /> : null}
        <Button compact kind="secondary" label="去设置" icon="settings" onPress={() => router.push('/settings')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.accentSoft, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: '#F0CFC4' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.ink },
  message: { marginLeft: 30, padding: 8, borderRadius: 8, backgroundColor: Colors.card, fontSize: 12, lineHeight: 18, color: Colors.inkSoft },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 30 },
});
