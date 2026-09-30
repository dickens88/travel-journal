import { requireOptionalNativeModule } from 'expo';

type XhsShareModule = {
  isInstalled(): boolean;
  // Local file:// URIs from the app cache, shared in order
  shareImages(uris: string[]): void;
};

// Android only, and null in Expo Go, which doesn't bundle local modules
export default requireOptionalNativeModule<XhsShareModule>('XhsShare');
