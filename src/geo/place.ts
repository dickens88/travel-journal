import * as Location from 'expo-location';
import type { LocationGeocodedAddress } from 'expo-location';

// Most specific human-readable name for a reverse-geocoded address
export function placeName(addr: LocationGeocodedAddress) {
  return addr.name ?? addr.street ?? addr.district ?? addr.city ?? null;
}

type Here = { lat: number; lng: number; place: string | null; city: string | null };

// Device position with a reverse-geocoded name; null when permission is denied, no fix is available, or `timeoutMs` passes first
export async function currentPlace({ timeoutMs }: { timeoutMs?: number } = {}): Promise<Here | null> {
  if (timeoutMs == null) return locate();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), timeoutMs)));
  return Promise.race([locate(), timeout]).finally(() => clearTimeout(timer));
}

// Device coordinates, a recent fix if there is one; null when permission is denied or no fix is available
export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

async function locate(): Promise<Here | null> {
  try {
    const pos = await currentPosition();
    if (!pos) return null;
    const { latitude, longitude } = pos;
    const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
    return { lat: latitude, lng: longitude, place: addr ? placeName(addr) : null, city: addr?.city ?? null };
  } catch {
    return null;
  }
}
