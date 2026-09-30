import { describe, expect, it } from '@jest/globals';

import { matchAnalyses } from '@/ai/analysisMatch';
import type { PhotoAnalysis } from '@/ai/schemas';

const answer = (id: string) => ({ id, caption: id }) as unknown as PhotoAnalysis;

describe('matchAnalyses', () => {
  it('pairs answers by id, tolerating extra text around it', () => {
    const pairs = matchAnalyses([{ id: 'p1' }, { id: 'p2' }], [answer('id=p2'), answer('p1')]);
    expect(pairs.map(([p, a]) => [p.id, a.id])).toEqual([['p2', 'id=p2'], ['p1', 'p1']]);
  });

  it('falls back to answer order for garbled ids when every photo got an answer', () => {
    const pairs = matchAnalyses([{ id: 'p1' }, { id: 'p2' }], [answer('p1'), answer('照片2')]);
    expect(pairs.map(([p, a]) => [p.id, a.id])).toEqual([['p1', 'p1'], ['p2', '照片2']]);
  });

  it('drops garbled ids when answers are missing, rather than guessing', () => {
    expect(matchAnalyses([{ id: 'p1' }, { id: 'p2' }], [answer('x')])).toEqual([]);
  });
});
