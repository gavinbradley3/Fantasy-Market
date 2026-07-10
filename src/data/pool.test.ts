// Stable-identity tests (Phase 10): ids are intrinsic to authored records —
// reordering or inserting players must never change anyone's id — and the
// validator fails loudly on identity corruption.

import { describe, expect, it } from 'vitest';
import { POOL, type PlayerSeed } from '@/data/pool';
import { validatePool, PoolValidationError } from '@/data/validatePool';
import { buildForFormat } from '@/services/marketData/mock/buildDataset';

const DATE = '2026-07-09';
const FORMAT = 'dyn_sf_half' as const;

function idByTicker(pool: readonly PlayerSeed[]): Map<string, string> {
  const ds = buildForFormat(FORMAT, DATE, pool);
  return new Map(ds.players.map((p) => [p.player.ticker, p.player.identity.internal_id]));
}

describe('pool identity validation', () => {
  it('the authored pool passes validation', () => {
    expect(() => validatePool(POOL)).not.toThrow();
  });

  it('fails loudly on a missing id', () => {
    const broken = [...POOL.slice(0, 3), { ...POOL[3], id: '' }];
    expect(() => validatePool(broken)).toThrow(PoolValidationError);
    expect(() => validatePool(broken)).toThrow(/missing id/);
  });

  it('fails loudly on a duplicate id', () => {
    const broken = [...POOL.slice(0, 3), { ...POOL[3], id: POOL[0].id }];
    expect(() => validatePool(broken)).toThrow(/duplicate id/);
  });

  it('fails loudly on a duplicate ticker', () => {
    const broken = [...POOL.slice(0, 3), { ...POOL[3], ticker: POOL[0].ticker }];
    expect(() => validatePool(broken)).toThrow(/duplicate ticker/);
  });

  it('fails loudly when two records claim the same external provider id', () => {
    const broken = [
      { ...POOL[0], sleeperId: 'slp_1' },
      { ...POOL[1], sleeperId: 'slp_1' },
    ];
    expect(() => validatePool(broken)).toThrow(/duplicate sleeperId/);
  });
});

describe('id stability under pool edits', () => {
  it('reordering the pool changes no player id', () => {
    const original = idByTicker(POOL);
    const reversed = idByTicker([...POOL].reverse());
    expect(reversed.size).toBe(original.size);
    for (const [ticker, id] of original) {
      expect(reversed.get(ticker)).toBe(id);
    }
  });

  it('inserting a new player changes no existing id', () => {
    const newcomer: PlayerSeed = {
      ...POOL[0],
      id: 'pt_9999',
      ticker: 'ZZZ',
      name: 'Test Newcomer',
    };
    const original = idByTicker(POOL);
    const inserted = idByTicker([newcomer, ...POOL]); // inserted at the FRONT
    for (const [ticker, id] of original) {
      expect(inserted.get(ticker)).toBe(id);
    }
    expect(inserted.get('ZZZ')).toBe('pt_9999');
  });
});
