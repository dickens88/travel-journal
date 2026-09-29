// Minimal change signal for useSyncExternalStore-backed stores
export function createSignal() {
  const listeners = new Set<() => void>();
  return {
    notify() {
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
