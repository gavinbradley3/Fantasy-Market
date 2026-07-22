import { describe, expect, it } from 'vitest';
import { IdentityResolver } from './identity';

const q = (providerIds: Record<string, string>, name = 'x', position: 'WR' | 'QB' | null = 'WR') =>
  ({ providerIds, nameNormalized: name, position, provider: 'nflverse' as const });

describe('IdentityResolver', () => {
  it('mints a deterministic canonical id from the strongest provider key', () => {
    const a = new IdentityResolver().resolve(q({ gsis: '00-1' }));
    const b = new IdentityResolver().resolve(q({ gsis: '00-1' }));
    expect(a.canonicalId).toBe(b.canonicalId);
    expect(a.canonicalId.startsWith('pt-')).toBe(true);
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

  it('emits a deterministic diagnostic on a conflict (smallest id wins)', () => {
    const r = new IdentityResolver([
      { canonicalId: 'pt-aaa', providerIds: { gsis: '00-c' } },
      { canonicalId: 'pt-bbb', providerIds: { sleeper: 'S-c' } },
    ]);
    const res = r.resolve(q({ gsis: '00-c', sleeper: 'S-c' }));
    expect(res.canonicalId).toBe('pt-aaa'); // lexicographically smallest
    expect(res.warnings.some((w) => w.code === 'IDENTITY_CONFLICT')).toBe(true);
  });

  it('falls back to a name+position key when no provider id exists', () => {
    const a = new IdentityResolver().resolve(q({}, 'jane doe', 'WR'));
    const b = new IdentityResolver().resolve(q({}, 'jane doe', 'WR'));
    const c = new IdentityResolver().resolve(q({}, 'jane doe', 'QB'));
    expect(a.canonicalId).toBe(b.canonicalId);
    expect(a.canonicalId).not.toBe(c.canonicalId); // position disambiguates
  });
});
