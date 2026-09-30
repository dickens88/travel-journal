import { useSyncExternalStore } from 'react';

import { createSignal } from '@/utils/signal';

type Progress = { done: number; total: number };
// ids: the photos this run is recognising, in flight or queued
type Analyzing = Progress & { ids: string[] };
// A failed background job: what was being done, the raw error, and how to run it again
export type JobError = { title: string; message: string; retry?: () => void };
export type TripJobs = { importing?: Progress; analyzing?: Analyzing; generating?: boolean; error?: JobError };

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
