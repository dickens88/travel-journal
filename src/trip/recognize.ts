import { router } from 'expo-router';
import { Alert } from 'react-native';

import { analyzePending } from '@/ai/analyzePhotos';
import { aiConfigured, loadSettings } from '@/settings/settings';

// User-triggered recognition of every not-yet-analysed photo in the trip; errors land in the trip's job state
export async function recognizePhotos(tripId: string) {
  if (!aiConfigured(await loadSettings())) {
    Alert.alert('还没有设置 AI', '识别照片需要先在「设置」里选好模型并填写 API Key', [
      { text: '取消', style: 'cancel' },
      { text: '去设置', onPress: () => router.push('/settings') },
    ]);
    return;
  }
  analyzePending(tripId);
}
