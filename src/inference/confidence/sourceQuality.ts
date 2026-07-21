// Critical-source quality (REGISTRY §20.F9 + §11.3). Derives the position's critical
// source families from its CRITICAL fields and computes the source-quality factor.

import { PUBLIC_CONFIDENCE, PUBLIC_FACTOR_BOUNDS } from '@/inference/registry';
import { clamp } from '@/inference/util/numeric';
import { compareStrings } from '@/inference/util/ordering';
import type { SupportedPosition } from '@/inference/types';

/** Source families (REGISTRY §16 / §20.F9). */
export type SourceFamily =
  | 'nflverse_weekly'
  | 'snaps'
  | 'participation'
  | 'schedule'
  | 'pbp'
  | 'injury'
  | 'official_starts';

/** §20.F9 field-group → source families for the four positions' CRITICAL fields. */
const CRITICAL_SOURCES: Readonly<Record<SupportedPosition, readonly SourceFamily[]>> = {
  WR: ['nflverse_weekly', 'snaps', 'participation', 'pbp', 'schedule', 'injury'],
  RB: ['nflverse_weekly', 'snaps', 'pbp', 'schedule', 'injury'],
  TE: ['nflverse_weekly', 'snaps', 'participation', 'pbp', 'schedule', 'injury'],
  QB: ['nflverse_weekly', 'pbp', 'schedule', 'injury', 'official_starts'],
};

export function criticalSources(position: SupportedPosition): readonly SourceFamily[] {
  return CRITICAL_SOURCES[position];
}

export interface SourceFreshnessTrace {
  readonly source: SourceFamily;
  readonly factor: number; // 1.0 fresh, 0.7 stale/absent
}

export interface SourceQualityResult {
  readonly minSourceFreshness: number;
  readonly sourceQualityFactor: number;
  readonly trace: readonly SourceFreshnessTrace[];
}

/**
 * §20.F9 — freshest per source (map lookup), then min across the position's critical
 * sources; absent → 0.7; stale → 0.7; fresh → 1.0. §11.3 factor.
 * `freshnessBySource[src]` is already the freshest (max) value for that family.
 */
export function computeSourceQuality(
  position: SupportedPosition,
  freshnessBySource: Partial<Record<SourceFamily, number>>,
): SourceQualityResult {
  const sources = [...criticalSources(position)].sort(compareStrings);
  const trace: SourceFreshnessTrace[] = sources.map((source) => ({
    source,
    factor: freshnessBySource[source] ?? PUBLIC_CONFIDENCE.staleFactor,
  }));
  const minSourceFreshness = trace.reduce<number>((m, t) => Math.min(m, t.factor), PUBLIC_CONFIDENCE.freshFactor);
  const sourceQualityFactor = clamp(
    PUBLIC_CONFIDENCE.sourceBase + PUBLIC_CONFIDENCE.sourceSlope * minSourceFreshness,
    PUBLIC_FACTOR_BOUNDS.source.min,
    PUBLIC_FACTOR_BOUNDS.source.max,
  );
  return { minSourceFreshness, sourceQualityFactor, trace };
}
