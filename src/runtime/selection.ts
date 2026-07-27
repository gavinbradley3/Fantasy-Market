// Which players a refresh values (pure, deterministic).
//
// A live refresh ingests the provider's whole identity export — every player it has ever
// carried, across every season. Valuing all of them would publish tens of thousands of
// entries that carry no evidence whatsoever, which is noise, not coverage. So the run needs
// a selection rule, and the rule has to be one that cannot quietly hide a player.
//
// THE RULE. A player is selected when BOTH hold:
//   1. the identity export gives them one of the four modelled positions, and
//   2. the snapshot holds at least one regular-season game stat record for them at or
//      before `asOf`.
//
// Criterion 2 is "the provider recorded them playing in a season we ingested". It is not a
// quality filter and not a cap: it never ranks, never scores, and never drops a player who
// has evidence. Which seasons are in scope is decided upstream by the source plan, in the
// open, rather than by a threshold buried here.
//
// Selection is a pure function of the snapshot and is emitted in canonical id order, so the
// same snapshot always produces the same builds in the same order — the board's contents
// cannot depend on fetch timing, provider row order, or how many times a run is retried.

import type { BuildInputOptions, NormalizedSnapshot } from '@/ingestion';
import type { SupportedPosition } from '@/pipeline/types';

/** Engine version tags, per position, recorded on every inference build. */
export type EngineVersions = Readonly<Record<SupportedPosition, string>>;

export const DEFAULT_ENGINE_VERSIONS: EngineVersions = {
  QB: 'qb-mvp-1.0',
  RB: 'rb-mvp-1.0',
  WR: 'wr-mvp-1.0',
  TE: 'te-mvp-1.0',
};

const MODELLED: ReadonlySet<string> = new Set(['QB', 'RB', 'WR', 'TE']);

export interface SelectionOptions {
  readonly asOf: string;
  readonly engineVersions?: EngineVersions;
}

/** The players a refresh will run inference for, in canonical id order. */
export function selectInferenceBuilds(
  snapshot: NormalizedSnapshot,
  options: SelectionOptions,
): BuildInputOptions[] {
  const engineVersions = options.engineVersions ?? DEFAULT_ENGINE_VERSIONS;
  const asOfMs = Date.parse(options.asOf);

  // Canonical ids with at least one qualifying regular-season game record.
  const withEvidence = new Set<string>();
  for (const g of snapshot.games) {
    if (g.canonicalId === null) continue;
    if (g.seasonType !== 'REG') continue;
    if (Date.parse(g.kickoff) > asOfMs) continue;
    withEvidence.add(g.canonicalId);
  }

  const builds: BuildInputOptions[] = [];
  for (const player of snapshot.players) {
    const { canonicalId, position } = player;
    if (canonicalId === null || position === null) continue;
    if (!MODELLED.has(position)) continue;
    if (!withEvidence.has(canonicalId)) continue;
    builds.push({
      canonicalId,
      position: position as SupportedPosition,
      asOf: options.asOf,
      engineVersion: engineVersions[position as SupportedPosition],
    });
  }

  // `snapshot.players` is already canonically ordered by canonical id; sorting again makes
  // the guarantee local to this function rather than an assumption about a caller.
  return builds.sort((a, b) => (a.canonicalId < b.canonicalId ? -1 : a.canonicalId > b.canonicalId ? 1 : 0));
}
