// Participation-stage orchestrator (pure). Verified participation snapshots +
// canonical players → coverage-aware partial supplements, field reports, and
// diagnostics. Joins by GSIS; never populates a full-career field from partial
// coverage.

import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { SUPPORTED_POSITIONS } from '@/pipeline/types';
import { valueOf } from '@/pipeline/provenance';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import { parseParticipation, type ParticipationRejectReason } from '@/pipeline/participation/nflverse/participationAdapter';
import { countParticipation } from '@/pipeline/participation/count';
import { computeCoverage } from '@/pipeline/participation/coverage';
import { buildParticipationSupplement, type ParticipationFieldReport } from '@/pipeline/participation/supplements';
import type { ParticipationPlay, PlayerParticipationAggregate } from '@/pipeline/participation/types';
import type { StatsSnapshot } from '@/pipeline/stats/snapshot';

const DEFAULT_COVERED_SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

export interface ParticipationOptions {
  readonly currentSeason: number;
  /** Seasons the source actually covers. Default 2016–2023 (feed ended 2023). */
  readonly coveredSeasons?: readonly number[];
  readonly includePostseason?: boolean;
}

export interface ParticipationRejectionCount {
  readonly reason: ParticipationRejectReason;
  readonly count: number;
}

export interface PlayerParticipationFields {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly fields: readonly ParticipationFieldReport[];
}

export interface ParticipationStageResult {
  readonly supplements: MetricsSupplements;
  readonly perPlayerFields: readonly PlayerParticipationFields[];
  readonly snapshotsLoaded: number;
  readonly playsAccepted: number;
  readonly playsRejected: number;
  readonly rejections: readonly ParticipationRejectionCount[];
  readonly incompletePersonnelPlays: number;
  readonly canonicalJoins: number;
  readonly unmatchedGsis: readonly string[];
  readonly identityCollisions: readonly string[];
  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;
  readonly completeRouteValues: number;
  readonly partialRouteValues: number;
  readonly blockersSatisfied: number;
}

function emptyByPosition(): Record<SupportedPosition, number> {
  const out = {} as Record<SupportedPosition, number>;
  for (const p of SUPPORTED_POSITIONS) out[p] = 0;
  return out;
}

function careerStart(player: CanonicalPlayer): number | null {
  return valueOf(player.rookie_year) ?? valueOf(player.draft_year) ?? null;
}

export function runParticipationStage(
  players: readonly CanonicalPlayer[],
  snapshots: readonly StatsSnapshot[],
  options: ParticipationOptions,
): ParticipationStageResult {
  const covered = options.coveredSeasons ?? DEFAULT_COVERED_SEASONS;
  const rejectionMap = new Map<ParticipationRejectReason, number>();
  let incompletePersonnelPlays = 0;
  const allPlays: ParticipationPlay[] = [];

  const sorted = [...snapshots].sort((a, b) => a.metadata.retrievedAt.localeCompare(b.metadata.retrievedAt));
  for (const snap of sorted) {
    const res = parseParticipation(snap.payload, {
      seasons: covered,
      includePostseason: options.includePostseason,
    });
    for (const p of res.plays) allPlays.push(p);
    for (const rej of res.rejected) rejectionMap.set(rej.reason, (rejectionMap.get(rej.reason) ?? 0) + 1);
    incompletePersonnelPlays += res.incompletePersonnelPlays;
  }

  const counts = countParticipation(allPlays, options.currentSeason);

  // GSIS join with collision protection.
  const gsisToCanonical = new Map<string, CanonicalPlayer[]>();
  for (const p of players) {
    const gsis = p.identity.provider_ids.gsis;
    if (!gsis) continue;
    const list = gsisToCanonical.get(gsis);
    if (list) list.push(p);
    else gsisToCanonical.set(gsis, [p]);
  }

  const identityCollisions: string[] = [];
  const aggregates: PlayerParticipationAggregate[] = [];
  for (const [gsis, claimants] of gsisToCanonical) {
    if (claimants.length > 1) {
      identityCollisions.push(gsis);
      continue;
    }
    const player = claimants[0];
    const pc = counts.byPlayer.get(gsis);
    const coverage = computeCoverage({
      careerStartSeason: careerStart(player),
      asOfSeason: options.currentSeason,
      coveredSeasons: covered,
      coveredGames: pc ? pc.games.size : 0,
      playerSeasons: pc ? [...pc.seasons] : [],
    });
    aggregates.push({
      canonicalId: player.identity.canonical_id,
      position: player.position,
      gsis,
      qualifyingPassPlayParticipations: pc ? pc.participations : 0,
      coverage,
    });
  }
  aggregates.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const unmatchedGsis: string[] = [];
  for (const gsis of counts.byPlayer.keys()) if (!gsisToCanonical.has(gsis)) unmatchedGsis.push(gsis);

  // Build supplements (WR-only, coverage-gated).
  const recordsByPosition = emptyByPosition();
  const wr: Record<string, Record<string, number>> = {};
  const perPlayerFields: PlayerParticipationFields[] = [];
  let completeRouteValues = 0;
  let partialRouteValues = 0;
  let blockersSatisfied = 0;

  for (const agg of aggregates) {
    if (agg.coverage.state !== 'UNAVAILABLE' && agg.coverage.state !== 'NOT_APPLICABLE') recordsByPosition[agg.position] += 1;
    const built = buildParticipationSupplement(agg);
    if (Object.keys(built.supplement).length > 0) wr[agg.canonicalId] = built.supplement;
    perPlayerFields.push({ canonicalId: agg.canonicalId, position: agg.position, fields: built.fields });
    for (const f of built.fields) {
      if (f.field === 'career_routes') {
        if (f.availability === 'SUPPLIED') completeRouteValues += 1;
        else if (f.availability === 'PARTIAL') partialRouteValues += 1;
      }
    }
    if (built.satisfiedBlocker) blockersSatisfied += 1;
  }
  perPlayerFields.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const rejections: ParticipationRejectionCount[] = [...rejectionMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  const playsRejected = rejections.reduce((s, r) => s + r.count, 0);
  const sortStr = (arr: string[]) => [...new Set(arr)].sort();

  return {
    supplements: { wr },
    perPlayerFields,
    snapshotsLoaded: snapshots.length,
    playsAccepted: allPlays.length,
    playsRejected,
    rejections,
    incompletePersonnelPlays,
    canonicalJoins: aggregates.length,
    unmatchedGsis: sortStr(unmatchedGsis),
    identityCollisions: sortStr(identityCollisions),
    recordsByPosition,
    completeRouteValues,
    partialRouteValues,
    blockersSatisfied,
  };
}
