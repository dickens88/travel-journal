import type { LocationGeocodedAddress } from 'expo-location';

// Most specific human-readable name for a reverse-geocoded address
export function placeName(addr: LocationGeocodedAddress) {
  return addr.name ?? addr.street ?? addr.district ?? addr.city ?? null;
}
