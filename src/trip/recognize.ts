import { router } from 'expo-router';
import { Alert } from 'react-native';

import { analyzePending } from '@/ai/analyzePhotos';
import { getT } from '@/i18n';
import { aiConfigured, loadSettings } from '@/settings/settings';

// User-triggered recognition of the given photos (by default every not-yet-analysed one in the trip); errors land in the trip's job state
export async function recognizePhotos(tripId: string, photoIds?: string[]) {
  if (!aiConfigured(await loadSettings())) {
    const t = getT();
    Alert.alert(t.common.aiNotSetUp, t.errors.recognizeNeedsAI, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.openSettings, onPress: () => router.push('/settings') },
    ]);
    return;
  }
  analyzePending(tripId, photoIds);
}
