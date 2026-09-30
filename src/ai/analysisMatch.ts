import type { PhotoAnalysis } from './schemas';

// Pair each answer with its photo. Models sometimes echo the id with extra text ("id=abc") or garble it; an answer
// that is unmatched would leave its photo unrecognised and sent again next time, so when the answer count equals the
// photo count, leftovers are paired by position (answers follow the order the photos were sent).
export function matchAnalyses<P extends { id: string }>(batch: P[], answers: PhotoAnalysis[]): [P, PhotoAnalysis][] {
  const paired = new Map<P, PhotoAnalysis>();
  const leftover = new Set<number>();
  answers.forEach((a, i) => {
    const p = batch.find((b) => !paired.has(b) && a.id.includes(b.id));
    if (p) paired.set(p, a);
    else leftover.add(i);
  });
  if (answers.length === batch.length) {
    for (const i of leftover) if (!paired.has(batch[i])) paired.set(batch[i], answers[i]);
  }
  return [...paired];
}
