import { describe, expect, it } from 'vitest';
import { IdentityResolver } from './identity';

const q = (providerIds: Record<string, string>, name = 'x', position: 'WR' | 'QB' | null = 'WR') =>
  ({ providerIds, nameNormalized: name, position, provider: 'nflverse' as const });

describe('IdentityResolver', () => {
  it('mints a deterministic canonical id from the strongest provider key', () => {
    const a = new IdentityResolver().resolve(q({ gsis: '00-1' }));
    const b = new IdentityResolver().resolve(q({ gsis: '00-1' }));
    expect(a.canonicalId).toBe(b.canonicalId);
    expect(a.canonicalId?.startsWith('pt-')).toBe(true);
    expect(a.newlyCreated).toBe(true);
  });

  it('joins two providers that share a cross-id to one canonical', () => {
    const r = new IdentityResolver();
    const nfl = r.resolve(q({ gsis: '00-1' }));
    const slp = r.resolve(q({ sleeper: 'S1', gsis: '00-1' }));
    expect(slp.canonicalId).toBe(nfl.canonicalId);
    // both provider tokens now map to the same canonical
    expect(r.snapshotIndex()['sleeper:S1']).toBe(nfl.canonicalId);
    expect(r.snapshotIndex()['gsis:00-1']).toBe(nfl.canonicalId);
  });

  it('is cached: repeated resolution does not re-mint', () => {
    const r = new IdentityResolver();
    const first = r.resolve(q({ gsis: '00-9' }));
    const second = r.resolve(q({ gsis: '00-9' }));
    expect(second.newlyCreated).toBe(false);
    expect(second.canonicalId).toBe(first.canonicalId);
  });

  it('quarantines a conflicting record instead of silently merging onto a winner', () => {
    // The two seeded tokens already belong to DIFFERENT canonical players. A record that
    // claims both must NOT be auto-merged onto either (that would corrupt one identity).
    const r = new IdentityResolver([
      { canonicalId: 'pt-aaa', providerIds: { gsis: '00-c' } },
      { canonicalId: 'pt-bbb', providerIds: { sleeper: 'S-c' } },
    ]);
    const res = r.resolve(q({ gsis: '00-c', sleeper: 'S-c' }));
    expect(res.canonicalId).toBeNull(); // unresolved, not merged onto the smallest
    expect(res.warnings.some((w) => w.code === 'IDENTITY_CONFLICT')).toBe(true);
  });

  it('never name-merges: no stable provider id → unresolved (null) with a diagnostic', () => {
    const a = new IdentityResolver().resolve(q({}, 'jane doe', 'WR'));
    const b = new IdentityResolver().resolve(q({}, 'jane doe', 'WR'));
    expect(a.canonicalId).toBeNull();
    expect(b.canonicalId).toBeNull();
    expect(a.warnings.some((w) => w.code === 'UNRESOLVED_IDENTITY')).toBe(true);
  });

  it('distinct provider ids never collapse on shared name+position (out-of-priority namespace)', () => {
    const r = new IdentityResolver();
    const one = r.resolve(q({ fantasypros: 'FP-111' }, 'mike williams', 'WR'));
    const two = r.resolve(q({ fantasypros: 'FP-999' }, 'mike williams', 'WR'));
    expect(one.canonicalId).not.toBeNull();
    expect(two.canonicalId).not.toBeNull();
    expect(one.canonicalId).not.toBe(two.canonicalId); // distinct people stay distinct
  });

  it('same raw id under different namespaces stays distinct without an explicit crosswalk', () => {
    const r = new IdentityResolver();
    const espn = r.resolve(q({ espn: '12345' }, 'a', 'WR'));
    const sleeper = r.resolve(q({ sleeper: '12345' }, 'b', 'WR'));
    expect(espn.canonicalId).not.toBe(sleeper.canonicalId);
  });
});
