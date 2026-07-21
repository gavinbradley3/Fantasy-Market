import { describe, expect, it } from 'vitest';
import {
  mergeByPrecedence,
  mergeFactsOverAil,
  type MetricsSupplements,
} from '@/inference/supplement/merge';

describe('merge framework (REGISTRY §13.2)', () => {
  it('mergeByPrecedence lets the overlay win', () => {
    type Row = { a?: number; b?: number; c?: number };
    expect(mergeByPrecedence<Row>({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('facts override AIL estimates for a dual-owned field', () => {
    const ail: MetricsSupplements = { wr: { p1: { target_share: 0.1 } } };
    const facts: MetricsSupplements = { wr: { p1: { target_share: 0.2 } } };
    const merged = mergeFactsOverAil(ail, facts);
    expect(merged.wr?.p1?.target_share).toBe(0.2);
  });

  it('AIL-only fields pass through when facts do not carry them', () => {
    const ail: MetricsSupplements = { wr: { p1: { competition_pressure: 0.4 } } };
    const facts: MetricsSupplements = { wr: { p1: { target_share: 0.2 } } };
    const merged = mergeFactsOverAil(ail, facts);
    expect(merged.wr?.p1?.competition_pressure).toBe(0.4);
    expect(merged.wr?.p1?.target_share).toBe(0.2);
  });
});
