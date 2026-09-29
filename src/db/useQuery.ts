import { useSyncExternalStore } from 'react';

import { createSignal } from '@/utils/signal';

const changed = createSignal();
const cache = new Map<string, { version: number; value: unknown }>();
let version = 0;

export function notifyDbChange() {
  version += 1;
  changed.notify();
}

function read<T>(key: string, fn: () => T): T {
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.value as T;
  const value = fn();
  cache.set(key, { version, value });
  return value;
}

// Synchronous SQLite query cached per key until the next repo write
export function useQuery<T>(key: string, fn: () => T): T {
  return useSyncExternalStore(changed.subscribe, () => read(key, fn));
}
