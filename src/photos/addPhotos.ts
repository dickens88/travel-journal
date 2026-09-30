import { router } from 'expo-router';
import { Alert } from 'react-native';

import { importAssets, pickPhotos, requestLibraryAccess } from './importPhotos';
import { describeError } from '@/ai/client';
import { getT } from '@/i18n';

// "Add photos": the in-app gallery when the library can be read, since it filters to the trip dates and keeps GPS;
// otherwise (access denied, or Expo Go, which rejects it) straight to the system picker
export async function addPhotos(tripId: string) {
  const access = await requestLibraryAccess().catch(() => ({ granted: false }));
  if (access.granted) {
    router.push(`/trip/${tripId}/pick`);
    return;
  }
  try {
    const sources = await pickPhotos();
    if (sources.length) await importAssets(tripId, sources);
  } catch (e) {
    Alert.alert(getT().errors.importFailed, describeError(e));
  }
}
