import { describe, expect, it } from 'vitest';
import { compareRankings, spearman } from './rankingChange';
import { valuationChecksum } from './valuationChecksum';

const board = (ids: string[]) => ids.map((id, i) => ({ canonicalId: id, name: id, position: 'WR', overallRank: i + 1 }));
const ids = Array.from({ length: 200 }, (_, i) => `p${String(i).padStart(3, '0')}`);

describe('compareRankings', () => {
  it('passes an identical board', () => {
    const r = compareRankings(board(ids), board(ids));
    expect(r.verdict).toBe('PASS');
    expect(r.metrics.spearman).toBeCloseTo(1, 10);
    expect(r.metrics.topOverlap).toBe(1);
  });

  it('passes a small reshuffle', () => {
    const swapped = [...ids];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    [swapped[50], swapped[60]] = [swapped[60], swapped[50]];
    expect(compareRankings(board(ids), board(swapped)).verdict).toBe('PASS');
  });

  it('holds a reversed board for review and names every failed criterion', () => {
    const r = compareRankings(board(ids), board([...ids].reverse()));
    expect(r.verdict).toBe('REVIEW_REQUIRED');
    expect(r.reasons).toHaveLength(3);
    expect(r.largestMoves[0].placesUp).not.toBeNull();
  });

  it('treats a top player missing from the candidate as a large move, never as a zero rank', () => {
    const candidate = board(ids).map((e) => (e.canonicalId === 'p000' ? { ...e, overallRank: null } : e));
    const r = compareRankings(board(ids), candidate);
    const move = r.largestMoves.find((m) => m.canonicalId === 'p000')!;
    expect(move.candidateRank).toBeNull();
    expect(move.placesUp).toBeNull();
    expect(r.metrics.referenceTopUnrankedInCandidate).toBe(1);
  });

  it('lists candidate top-N players the reference never ranked', () => {
    const candidate = [{ canonicalId: 'rookie', name: 'Rookie', position: 'RB', overallRank: 1 }, ...board(ids).map((e) => ({ ...e, overallRank: e.overallRank + 1 }))];
    const r = compareRankings(board(ids), candidate);
    expect(r.newInCandidateTop).toEqual([{ canonicalId: 'rookie', name: 'Rookie', position: 'RB', candidateRank: 1 }]);
    expect(r.metrics.newlyRanked).toBe(1);
  });
});

describe('spearman', () => {
  it('is 1 for identical orders and -1 for reversed', () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });
});

describe('valuationChecksum', () => {
  const entry = { canonicalId: 'a', position: 'WR', dynastyValue: 50, composites: { weekly: 1, dynasty: 2 } };
  it('ignores publication metadata and key order', () => {
    expect(valuationChecksum([{ ...entry, publishedAt: 'x' }])).toBe(
      valuationChecksum([{ composites: { dynasty: 2, weekly: 1 }, dynastyValue: 50, position: 'WR', canonicalId: 'a', runId: 'y' }]),
    );
  });
  it('ignores entry order', () => {
    const b = { ...entry, canonicalId: 'b' };
    expect(valuationChecksum([entry, b])).toBe(valuationChecksum([b, entry]));
  });
  it('changes when any published value changes', () => {
    expect(valuationChecksum([entry])).not.toBe(valuationChecksum([{ ...entry, dynastyValue: 50.0001 }]));
  });
});
