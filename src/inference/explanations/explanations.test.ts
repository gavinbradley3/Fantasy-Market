import { describe, expect, it } from 'vitest';
import {
  composeExplanation,
  renderExplanation,
  renderFragment,
  type CategoricalDriver,
  type NumericDriver,
  type StructuralInput,
} from '@/inference/explanations/explanations';

function num(p: Partial<NumericDriver> & { code: string }): NumericDriver {
  return { polarity: 'POSITIVE', template: '{code}', args: {}, featureValue: 0.23, featurePrior: 0.11, importanceWeight: 1, ...p };
}

describe('explanation generation (REGISTRY §14 / §20.F12)', () => {
  it('Fx10: numeric |Δ|=0.12 ties categorical κ=0.12 → tie-break by code ascending', () => {
    // Exact 0.12 (0.12 − 0 · weight 1) to exercise the tie-break; floats are
    // deterministic across implementations either way.
    const numeric: NumericDriver[] = [num({ code: 'TARGET_SHARE_RISING', featureValue: 0.12, featurePrior: 0, importanceWeight: 1 })];
    const categorical: CategoricalDriver[] = [{ code: 'ROLE_PROMOTED', polarity: 'POSITIVE', template: '{code}', args: {}, kappa: 0.12 }];
    const out = composeExplanation(numeric, categorical, []);
    expect(out.map((f) => f.code)).toEqual(['ROLE_PROMOTED', 'TARGET_SHARE_RISING']);
  });

  it('numeric with higher contribution ranks above a categorical', () => {
    const numeric: NumericDriver[] = [num({ code: 'BIG', featureValue: 0.4, featurePrior: 0.0, importanceWeight: 1 })]; // |Δ|=0.40
    const categorical: CategoricalDriver[] = [{ code: 'AAA_ROLE', polarity: 'POSITIVE', template: '{code}', args: {}, kappa: 0.12 }];
    expect(composeExplanation(numeric, categorical, []).map((f) => f.code)).toEqual(['BIG', 'AAA_ROLE']);
  });

  it('inclusion threshold excludes contributions below 0.01', () => {
    const numeric: NumericDriver[] = [num({ code: 'TINY', featureValue: 0.105, featurePrior: 0.1, importanceWeight: 1 })]; // 0.005
    expect(composeExplanation(numeric, [], [])).toEqual([]);
  });

  it('caps at 3 positive and 3 negative drivers', () => {
    const numeric: NumericDriver[] = Array.from({ length: 5 }, (_, i) =>
      num({ code: `P${i}`, featureValue: 0.5 - i * 0.01, featurePrior: 0, importanceWeight: 1 }),
    );
    const out = composeExplanation(numeric, [], []);
    expect(out.length).toBe(3);
  });

  it('structural fragments append in fixed order regardless of input order', () => {
    const structural: StructuralInput[] = [
      { code: 'MODEL_VERSION', template: 'v', args: {} },
      { code: 'FALLBACK_USED', template: 'f', args: {} },
      { code: 'SOURCE_FRESHNESS', template: 's', args: {} },
    ];
    const out = composeExplanation([], [], structural);
    expect(out.map((f) => f.code)).toEqual(['FALLBACK_USED', 'SOURCE_FRESHNESS', 'MODEL_VERSION']);
  });

  it('renders deterministic text and is byte-identical on repeat', () => {
    const numeric: NumericDriver[] = [num({ code: 'TS', template: 'target share {from} to {to}', args: { from: '18%', to: '23%' } })];
    const a = composeExplanation(numeric, [], []);
    expect(renderFragment(a[0])).toBe('target share 18% to 23%');
    expect(JSON.stringify(a)).toBe(JSON.stringify(composeExplanation(numeric, [], [])));
    expect(renderExplanation(a)).toEqual(['target share 18% to 23%']);
  });
});
