import { useSyncExternalStore } from 'react';

import { createSignal } from '@/utils/signal';

type Progress = { done: number; total: number };
export type TripJobs = { importing?: Progress; analyzing?: Progress; generating?: boolean; error?: string };

const jobs = new Map<string, TripJobs>();
const changed = createSignal();
const EMPTY: TripJobs = {};

export function setJob(tripId: string, patch: Partial<TripJobs>) {
  jobs.set(tripId, { ...(jobs.get(tripId) ?? {}), ...patch });
  changed.notify();
}

export function getJobs(tripId: string) {
  return jobs.get(tripId) ?? EMPTY;
}

export function useJobs(tripId: string) {
  return useSyncExternalStore(changed.subscribe, () => getJobs(tripId));
}
