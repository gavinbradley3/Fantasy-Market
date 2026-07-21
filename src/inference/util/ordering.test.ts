import { describe, expect, it } from 'vitest';
import { compareStrings, stableSortBy, stableSortByKey } from '@/inference/util/ordering';

describe('deterministic ordering', () => {
  it('compareStrings is ordinal', () => {
    expect(compareStrings('a', 'b')).toBe(-1);
    expect(compareStrings('b', 'a')).toBe(1);
    expect(compareStrings('a', 'a')).toBe(0);
    // uppercase precedes lowercase in code-unit order
    expect(compareStrings('Z', 'a')).toBe(-1);
  });

  it('stableSortByKey sorts ascending without mutating input', () => {
    const input = [{ k: 'c' }, { k: 'a' }, { k: 'b' }];
    const out = stableSortByKey(input, (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(['a', 'b', 'c']);
    expect(input.map((x) => x.k)).toEqual(['c', 'a', 'b']);
  });

  it('stableSortBy applies secondary tie-break (REGISTRY §20.F10)', () => {
    const rows = [
      { ts: '2025-01-02', id: 'b' },
      { ts: '2025-01-02', id: 'a' },
      { ts: '2025-01-01', id: 'z' },
    ];
    const out = stableSortBy(rows, [(r) => r.ts, (r) => r.id]);
    expect(out.map((r) => `${r.ts}/${r.id}`)).toEqual([
      '2025-01-01/z',
      '2025-01-02/a',
      '2025-01-02/b',
    ]);
  });
});
