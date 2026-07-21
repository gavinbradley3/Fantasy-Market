// Deterministic explanation generation (REGISTRY §14 + §20.F12). Pure. No LLM;
// fixed templates only. Two implementations emit byte-identical fragments and order.

import { CATEGORICAL_KAPPA, EXPLANATION, STRUCTURAL_FRAGMENT_ORDER } from '@/inference/registry/family';
import { compareStrings } from '@/inference/util/ordering';
import type { ExplanationFragment, ExplanationPolarity } from '@/inference/types';

export type StructuralCode = (typeof STRUCTURAL_FRAGMENT_ORDER)[number];

/** A numeric driver: contribution = |(value − prior) · importanceWeight| (§14). */
export interface NumericDriver {
  readonly code: string;
  readonly polarity: ExplanationPolarity;
  readonly template: string;
  readonly args: Readonly<Record<string, string | number>>;
  readonly featureValue: number;
  readonly featurePrior: number;
  readonly importanceWeight: number;
}

/** A categorical driver: contribution = the fixed κ (§20.F12). */
export interface CategoricalDriver {
  readonly code: string;
  readonly polarity: ExplanationPolarity;
  readonly template: string;
  readonly args: Readonly<Record<string, string | number>>;
  readonly kappa: number;
}

export interface StructuralInput {
  readonly code: StructuralCode;
  readonly template: string;
  readonly args: Readonly<Record<string, string | number>>;
}

interface RankedDriver {
  readonly fragment: ExplanationFragment;
  readonly contribution: number;
}

function numericContribution(d: NumericDriver): number {
  return Math.abs((d.featureValue - d.featurePrior) * d.importanceWeight);
}

/** Look up the categorical κ for a code, else the OTHER constant (§20.F12). */
export function categoricalKappa(code: keyof typeof CATEGORICAL_KAPPA): number {
  return CATEGORICAL_KAPPA[code];
}

/**
 * Compose the ordered explanation (§14): positive drivers (≤3), negative drivers
 * (≤3), then structural fragments in the fixed order. Drivers rank by contribution
 * descending, ties broken by `code` ascending. Fragments below EXPLANATION.minContrib
 * are excluded; structural fragments always emit.
 */
export function composeExplanation(
  numeric: readonly NumericDriver[],
  categorical: readonly CategoricalDriver[],
  structural: readonly StructuralInput[],
): ExplanationFragment[] {
  const all: (RankedDriver & { polarity: ExplanationPolarity })[] = [
    ...numeric.map((d) => ({
      fragment: { code: d.code, polarity: d.polarity, template: d.template, args: d.args },
      contribution: numericContribution(d),
      polarity: d.polarity,
    })),
    ...categorical.map((d) => ({
      fragment: { code: d.code, polarity: d.polarity, template: d.template, args: d.args },
      contribution: d.kappa,
      polarity: d.polarity,
    })),
  ].filter((d) => d.contribution >= EXPLANATION.minContrib);

  const pick = (polarity: ExplanationPolarity, limit: number): ExplanationFragment[] =>
    all
      .filter((d) => d.polarity === polarity)
      .sort((a, b) => b.contribution - a.contribution || compareStrings(a.fragment.code, b.fragment.code))
      .slice(0, limit)
      .map((d) => d.fragment);

  const positives = pick('POSITIVE', EXPLANATION.positiveCount);
  const negatives = pick('NEGATIVE', EXPLANATION.negativeCount);

  const structurals: ExplanationFragment[] = STRUCTURAL_FRAGMENT_ORDER.flatMap((code) => {
    const found = structural.find((s) => s.code === code);
    return found ? [{ code: found.code, polarity: 'NEUTRAL' as const, template: found.template, args: found.args }] : [];
  });

  return [...positives, ...negatives, ...structurals];
}

// --- deterministic numeric formatting for template args (§14) ---

/** share → percent, 0 dp (e.g. 0.23 → "23%"). */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}
/** per-game value, 1 dp. */
export function formatPerGame(value: number): string {
  return value.toFixed(1);
}
/** 0..100 score, 0 dp. */
export function formatScore(value: number): string {
  return `${Math.round(value)}`;
}
/** probability → percent, 0 dp. */
export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Render a fragment's fixed template by substituting {key} placeholders. */
export function renderFragment(fragment: ExplanationFragment): string {
  return fragment.template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = fragment.args[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

export function renderExplanation(fragments: readonly ExplanationFragment[]): string[] {
  return fragments.map(renderFragment);
}
