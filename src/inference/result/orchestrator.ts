// Phase-2A intermediate orchestrator.
//
// `runPhase2A` assembles the intermediate results for the families implemented in
// this phase, for ONE player. It is deliberately scoped: it produces
// `IntermediateField`s (value/status/provenance/confidence/limitations/versions),
// NOT a production `MetricsSupplements`. It performs no projection, no D1/D2, no
// explanation generation, no merge, no readiness, and no engine call. Each family
// output is computed only when its inputs are present in the context.

import {
  competitionPressure,
  qbCompetitionPressure,
  type CompetitionPosition,
  type CompetitionTeammate,
} from '@/inference/competition';
import { computeFieldConfidence } from '@/inference/confidence/fieldConfidence';
import {
  offensiveEnvironmentScore,
  protectionContextScore,
  qbEnvironmentScore,
  type OffensiveEnvironmentInput,
  type QbEnvironmentInput,
} from '@/inference/environment';
import {
  expectedGamesRemaining,
  probabilityActive,
  workloadRampFactor,
  type AvailabilityState,
  type ExpectedGamesInput,
  type InjuryStatus,
} from '@/inference/availability';
import {
  classifyQBRoleStatus,
  classifyTEDepthChartRole,
  classifyTEProspectType,
  type QBRoleSignals,
  type TERoleSignals,
} from '@/inference/roles';
import { classifyTERole } from '@/inference/roles/roles';
import {
  organizationalCommitment,
  rosterSecurity,
  type RosterSecurityInput,
} from '@/inference/security';
import type { FreshnessState } from '@/inference/util/freshness';
import type { InferenceStatus, SupportedPosition } from '@/inference/types';
import { makeField, neutralField, type IntermediateField } from './types';

export interface Phase2AContext {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly asOf: string;
  /** Default freshness applied to a family when it does not supply its own. */
  readonly freshness?: FreshnessState;
  readonly coverageRatio?: number;

  // Availability / expected games (all positions).
  readonly expectedGames?: ExpectedGamesInput;
  readonly qbAvailability?: { readonly injuryStatus: InjuryStatus }; // probability_active
  readonly rbAvailability?: AvailabilityState; // workload_ramp_factor

  // Competition (WR/RB/TE via teammates; QB via role).
  readonly competition?:
    | { readonly kind: 'teammates'; readonly position: CompetitionPosition; readonly teammates: readonly CompetitionTeammate[] }
    | { readonly kind: 'qbRole'; readonly roleStatus: string };

  // Roster security.
  readonly security?: RosterSecurityInput;
  readonly organizationalCommitment?: { readonly draftRound: number | null; readonly roleStatus: string };

  // Environment.
  readonly offensiveEnv?: OffensiveEnvironmentInput;
  readonly qbEnv?: QbEnvironmentInput;
  readonly protectionSackRate?: number | null;

  // Classifications.
  readonly qbRole?: QBRoleSignals;
  readonly teRole?: TERoleSignals & { readonly teammateSnapShares?: readonly (number | null)[] };
  readonly teProspect?: Parameters<typeof classifyTEProspectType>[0];
}

export interface Phase2AResult {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly asOf: string;
  readonly fields: readonly IntermediateField<unknown>[];
}

export function runPhase2A(ctx: Phase2AContext): Phase2AResult {
  const fields: IntermediateField<unknown>[] = [];
  const freshness: FreshnessState = ctx.freshness ?? 'FRESH';
  const asOf = ctx.asOf;

  const emit = <T>(field: string, value: T | null, modelId: string, status: InferenceStatus = 'AVAILABLE') => {
    const c = computeFieldConfidence({ provenance: 'MODEL_ESTIMATE', freshness, coverageRatio: ctx.coverageRatio });
    fields.push(
      makeField<T>({ field, value, status, provenance: 'MODEL_ESTIMATE', confidence: c.score, modelId, asOf, limitations: c.limitations }),
    );
  };

  // --- expected games remaining (all positions) ---
  if (ctx.expectedGames) {
    const eg = expectedGamesRemaining(ctx.expectedGames);
    emit('expected_games_remaining', eg.expectedGamesRemaining, 'avail.expected_games');
  }

  // --- probability_active (QB) ---
  if (ctx.qbAvailability) {
    emit('probability_active', probabilityActive(ctx.qbAvailability.injuryStatus), 'avail.probability_active');
  }

  // --- workload_ramp_factor (RB) ---
  if (ctx.rbAvailability) {
    fields.push(
      makeField<number>({
        field: 'workload_ramp_factor',
        value: workloadRampFactor(ctx.rbAvailability),
        status: 'AVAILABLE',
        provenance: 'DERIVED',
        confidence: computeFieldConfidence({ provenance: 'DERIVED', freshness }).score,
        modelId: 'avail.ramp',
        asOf,
        limitations: computeFieldConfidence({ provenance: 'DERIVED', freshness }).limitations,
      }),
    );
  }

  // --- competition_pressure ---
  if (ctx.competition) {
    const value =
      ctx.competition.kind === 'teammates'
        ? competitionPressure(ctx.competition.position, ctx.competition.teammates)
        : qbCompetitionPressure(ctx.competition.roleStatus);
    emit('competition_pressure', value, 'role.competition');
  }

  // --- contract / roster security ---
  if (ctx.security) {
    const c = computeFieldConfidence({ provenance: 'MODEL_ESTIMATE', freshness, coverageRatio: ctx.coverageRatio });
    fields.push(
      makeField<number>({
        field: 'contract_security',
        value: rosterSecurity(ctx.security),
        status: 'AVAILABLE',
        provenance: 'MODEL_ESTIMATE',
        confidence: c.score,
        modelId: 'stability.roster_security',
        asOf,
        limitations: [...c.limitations, 'NOT_TRUE_CONTRACT_DATA'],
      }),
    );
  }
  if (ctx.organizationalCommitment) {
    emit('organizational_commitment', organizationalCommitment(ctx.organizationalCommitment), 'stability.roster_security');
  }

  // --- environment ---
  if (ctx.offensiveEnv) {
    const v = offensiveEnvironmentScore(ctx.offensiveEnv);
    emit('offensive_environment_score', v, 'env.team_offense', v === null ? 'INSUFFICIENT_DATA' : 'AVAILABLE');
  }
  if (ctx.qbEnv) {
    const v = qbEnvironmentScore(ctx.qbEnv);
    emit('qb_environment_score', v, 'env.qb_environment', v === null ? 'INSUFFICIENT_DATA' : 'AVAILABLE');
  }
  if (ctx.protectionSackRate !== undefined) {
    const v = protectionContextScore(ctx.protectionSackRate);
    emit('protection_context_score', v, 'env.protection', v === null ? 'INSUFFICIENT_DATA' : 'AVAILABLE');
  }

  // --- classifications (MODEL_CLASSIFICATION) ---
  if (ctx.qbRole) {
    const klass = classifyQBRoleStatus(ctx.qbRole);
    const c = computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness, coverageRatio: ctx.coverageRatio });
    fields.push(
      makeField<string>({ field: 'role_status', value: klass, status: 'AVAILABLE', provenance: 'MODEL_CLASSIFICATION', confidence: c.score, modelId: 'role.qb_role', asOf, limitations: c.limitations }),
    );
  }
  if (ctx.teRole) {
    const role = classifyTERole(ctx.teRole);
    if (!role.minEvidenceMet) {
      fields.push(neutralField<string>('depth_chart_role', 'UNKNOWN', 'role.depth_chart', asOf));
    } else {
      const c = computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness, coverageRatio: ctx.coverageRatio, catchall: role.catchall, reducedSignal: role.reduced });
      fields.push(
        makeField<string>({ field: 'depth_chart_role', value: classifyTEDepthChartRole(ctx.teRole.snapShareL4, ctx.teRole.teammateSnapShares ?? []), status: 'AVAILABLE', provenance: 'MODEL_CLASSIFICATION', confidence: c.score, modelId: 'role.depth_chart', asOf, limitations: c.limitations }),
      );
    }
  }
  if (ctx.teProspect) {
    const c = computeFieldConfidence({ provenance: 'MODEL_CLASSIFICATION', freshness, coverageRatio: ctx.coverageRatio });
    fields.push(
      makeField<string>({ field: 'prospect_type', value: classifyTEProspectType(ctx.teProspect), status: 'AVAILABLE', provenance: 'MODEL_CLASSIFICATION', confidence: c.score, modelId: 'role.te_prospect', asOf, limitations: c.limitations }),
    );
  }

  return { position: ctx.position, canonicalId: ctx.canonicalId, asOf, fields };
}
