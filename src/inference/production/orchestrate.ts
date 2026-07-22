// Production inference orchestration (Cold-audit M1). Executes the complete AIL path
// from NORMALIZED input — feature-level evidence + observed facts — by CALLING the
// existing family modules (Phase 2A orchestrator, projections, D1, D2). It never
// reimplements a formula: every value comes from the audited, registry-faithful
// family functions. Pure: no fetch, no wall clock, no randomness, no locale.
//
// This closes the audit finding that production consumed caller-precomputed inference
// fields and therefore never ran projections / D1 / D2 / Phase 2A in production.

import { computeFieldConfidence } from '@/inference/confidence/fieldConfidence';
import { classifyRBRole, classifyWRRole, type RBRoleSignals, type WRRoleSignals } from '@/inference/roles/roles';
import {
  computeCareerRoutes,
  rbRouteParticipationLast4,
  type CareerRoutesInput,
} from '@/inference/d1/routeExposure';
import { computeFunctionalStarts, type FunctionalStartsInput } from '@/inference/d2/functionalStarts';
import {
  projectShare,
  projectTeamVolume,
  type ShareProjectionInput,
  type TeamVolumeInput,
} from '@/inference/projections/projections';
import { UNVALIDATED_CONF_CAP } from '@/inference/registry/family';
import { clamp } from '@/inference/util/numeric';
import { LIMITATION_CODES, type LimitationCode } from '@/inference/types';
import { runPhase2A, type Phase2AContext } from '@/inference/result/orchestrator';
import { makeField, type IntermediateField } from '@/inference/result/types';
import type { InferenceStatus, SupportedPosition } from '@/inference/types';

/** A projected supplement field the caller requests (share or team-volume form). */
export type ProjectedFieldRequest =
  | { readonly field: string; readonly kind: 'share'; readonly input: ShareProjectionInput }
  | { readonly field: string; readonly kind: 'teamVolume'; readonly input: TeamVolumeInput };

/**
 * Normalized, feature-level evidence for one player. Every entry is optional; the
 * orchestrator computes a field only when its evidence is present (mirroring the
 * Phase-2A orchestrator's conditional design). These are the SAME typed inputs the
 * audited family functions accept — i.e. normalized evidence, never raw provider
 * payloads (live ingestion is out of scope).
 */
export interface NormalizedEvidence extends Omit<Phase2AContext, 'position' | 'canonicalId' | 'asOf'> {
  /** WR full/reduced role ladder signals (diagnostic; drives explanations). */
  readonly wrRole?: WRRoleSignals;
  /** RB full/reduced role ladder signals (diagnostic). */
  readonly rbRole?: RBRoleSignals;
  /** Projected supplement fields (§2 projection framework). */
  readonly projectedFields?: readonly ProjectedFieldRequest[];
  /** D1 effective career routes (§8). */
  readonly d1?: CareerRoutesInput;
  /** RB window route proxy (§8.1 rung 4, RB-only). */
  readonly rbRouteProxy?: { readonly rbPassPlaySnaps: number | null; readonly teamDropbacks: number | null };
  /** D2 functional QB starts (§9). */
  readonly d2?: FunctionalStartsInput;
}

/** D1 diagnostics surfaced to the production result / sidecar (§8.4 transparency). */
export interface D1Diagnostics {
  readonly emittedValue: number | null;
  readonly uncappedEstimate: number | null;
  readonly provenance: string | null;
  readonly status: string;
  readonly routeProxyPenalty: number;
  readonly tierPenalty: number;
  readonly rbRouteParticipationLast4?: number | null;
}

/** D2 diagnostics surfaced to the production result / sidecar (§9). */
export interface D2Diagnostics {
  readonly careerStarts: number | null;
  readonly recentStarts: number | null;
  readonly recentStartRate: number | null;
  readonly recentGames: number;
  readonly provenance: string | null;
  readonly startsOfficial: boolean;
  readonly careerStatus: string;
  readonly recentStatus: string;
  readonly startInferencePenalty: number;
  /** §6.2 coercion: recent_start_rate used by qb-env when recent_games = 0 (m3). */
  readonly starterStabilityRate: number | null;
}

export interface ProjectionDiagnostic {
  readonly field: string;
  readonly value: number | null;
  readonly wRecent: number;
  readonly usedFallback: boolean;
}

export interface OrchestrationResult {
  readonly fields: readonly IntermediateField<unknown>[];
  readonly wrRoleClass: string | null;
  readonly rbRoleClass: string | null;
  readonly d1: D1Diagnostics | null;
  readonly d2: D2Diagnostics | null;
  readonly projections: readonly ProjectionDiagnostic[];
}

/** Field confidence with the D1/D2 extra penalties folded in (§8.2/§9.2/§10). */
function estimateConfidence(
  provenance: 'MODEL_ESTIMATE' | 'PROXY' | 'DERIVED',
  extraPenalty: number,
): { score: number; limitations: readonly LimitationCode[] } {
  const base = computeFieldConfidence({ provenance, freshness: 'FRESH' });
  const score = clamp(base.score - extraPenalty, 0, UNVALIDATED_CONF_CAP);
  return { score, limitations: base.limitations };
}

/**
 * Execute Phase 2A (via `runPhase2A`) + projections + D1 + D2 for one player, from
 * normalized evidence. Returns the complete `IntermediateField[]` (the input the
 * emitter/confidence layers consume) plus structured diagnostics proving each family
 * ran.
 */
export function orchestrateInference(
  position: SupportedPosition,
  canonicalId: string,
  asOf: string,
  evidence: NormalizedEvidence,
): OrchestrationResult {
  // --- Phase 2A families (availability, competition, security, environment, roles) ---
  const phase2a = runPhase2A({ position, canonicalId, asOf, ...evidence });
  const fields: IntermediateField<unknown>[] = [...phase2a.fields];

  // --- WR / RB role classes (diagnostic; role_adj = 0 so no supplement field) ---
  const wrRoleClass = evidence.wrRole ? classifyWRRole(evidence.wrRole).klass : null;
  const rbRoleClass = evidence.rbRole ? classifyRBRole(evidence.rbRole).klass : null;

  // --- Projections (§2). Each request maps to a supplement field. ---
  const projections: ProjectionDiagnostic[] = [];
  for (const req of evidence.projectedFields ?? []) {
    if (req.kind === 'share') {
      const r = projectShare(req.input);
      projections.push({ field: req.field, value: r.value, wRecent: r.wRecent, usedFallback: r.usedFallback });
      const status: InferenceStatus = r.value === null ? 'INSUFFICIENT_DATA' : 'AVAILABLE';
      const c = estimateConfidence('MODEL_ESTIMATE', 0);
      fields.push(
        makeField<number>({ field: req.field, value: r.value, status, provenance: r.value === null ? null : 'MODEL_ESTIMATE', confidence: r.value === null ? 0 : c.score, modelId: `proj.${req.field}`, asOf, limitations: c.limitations }),
      );
    } else {
      const v = projectTeamVolume(req.input);
      projections.push({ field: req.field, value: v, wRecent: 0, usedFallback: false });
      const c = estimateConfidence('MODEL_ESTIMATE', 0);
      fields.push(
        makeField<number>({ field: req.field, value: v, status: 'AVAILABLE', provenance: 'MODEL_ESTIMATE', confidence: c.score, modelId: `proj.${req.field}`, asOf, limitations: c.limitations }),
      );
    }
  }

  // --- D1 effective route exposure (§8) ---
  let d1: D1Diagnostics | null = null;
  if (evidence.d1) {
    const r = computeCareerRoutes(evidence.d1);
    const rbProxy = evidence.rbRouteProxy
      ? rbRouteParticipationLast4(evidence.rbRouteProxy.rbPassPlaySnaps, evidence.rbRouteProxy.teamDropbacks)
      : undefined;
    d1 = {
      emittedValue: r.emittedValue,
      uncappedEstimate: r.uncappedEstimate,
      provenance: r.provenance,
      status: r.status,
      routeProxyPenalty: r.routeProxyPenalty,
      tierPenalty: r.tierPenalty,
      rbRouteParticipationLast4: rbProxy,
    };
    if (r.status === 'AVAILABLE' && r.emittedValue !== null && r.provenance) {
      const prov = r.provenance === 'DERIVED' ? 'DERIVED' : r.provenance;
      const c = estimateConfidence(prov, r.routeProxyPenalty + r.tierPenalty);
      fields.push(
        makeField<number>({ field: 'career_routes', value: r.emittedValue, status: 'AVAILABLE', provenance: prov, confidence: c.score, modelId: 'routes.career', asOf, limitations: [...c.limitations, ...r.limitations] }),
      );
    } else {
      // UNAVAILABLE non-nullable numeric → emitter omits → NOT_READY (honest).
      fields.push(
        makeField<number>({ field: 'career_routes', value: null, status: 'UNAVAILABLE', provenance: null, confidence: 0, modelId: 'routes.career', asOf }),
      );
    }
    if (rbProxy !== undefined) {
      const c = estimateConfidence('PROXY', 0);
      fields.push(
        makeField<number>({ field: 'route_participation_last4', value: rbProxy, status: rbProxy === null ? 'UNAVAILABLE' : 'AVAILABLE', provenance: rbProxy === null ? null : 'PROXY', confidence: rbProxy === null ? 0 : c.score, modelId: 'routes.rb_proxy', asOf, limitations: rbProxy === null ? [] : [LIMITATION_CODES.ROUTE_PROXY] }),
      );
    }
  }

  // --- D2 functional QB starts (§9) ---
  let d2: D2Diagnostics | null = null;
  if (evidence.d2) {
    const r = computeFunctionalStarts(evidence.d2);
    // §6.2 / m3: recent_start_rate feeds qb-env starter_stability; when recent_games=0
    // it is NOT_APPLICABLE (null) as a FIELD but is treated as 0 for §6.2 with a limitation.
    const starterStabilityRate = r.recentStartRate === null && r.recentGames === 0 ? 0 : r.recentStartRate;
    d2 = {
      careerStarts: r.careerStarts,
      recentStarts: r.recentStarts,
      recentStartRate: r.recentStartRate,
      recentGames: r.recentGames,
      provenance: r.provenance,
      startsOfficial: r.startsOfficial,
      careerStatus: r.careerStatus,
      recentStatus: r.recentStatus,
      startInferencePenalty: r.startInferencePenalty,
      starterStabilityRate,
    };
    if (r.careerStatus === 'AVAILABLE' && r.careerStarts !== null && r.provenance) {
      const prov = r.startsOfficial ? (r.provenance as 'DIRECT' | 'DERIVED') : 'MODEL_ESTIMATE';
      const cprov = prov === 'DIRECT' ? 'DERIVED' : prov; // p_provenance has no DIRECT row; treat as DERIVED (0)
      const c = estimateConfidence(cprov, r.startInferencePenalty);
      fields.push(
        makeField<number>({ field: 'career_starts', value: r.careerStarts, status: 'AVAILABLE', provenance: prov as 'DERIVED' | 'MODEL_ESTIMATE', confidence: c.score, modelId: 'starts.career', asOf, limitations: r.limitations }),
      );
      // recent_starts: AVAILABLE, NOT_APPLICABLE (recent_games 0), or UNAVAILABLE.
      const recentStatus = r.recentStatus as InferenceStatus;
      fields.push(
        makeField<number>({ field: 'recent_starts', value: r.recentStarts, status: recentStatus, provenance: recentStatus === 'AVAILABLE' ? (prov as 'DERIVED' | 'MODEL_ESTIMATE') : null, confidence: recentStatus === 'AVAILABLE' ? c.score : 0, modelId: 'starts.recent', asOf, limitations: recentStatus === 'AVAILABLE' ? r.limitations : [] }),
      );
    } else {
      fields.push(
        makeField<number>({ field: 'career_starts', value: null, status: 'UNAVAILABLE', provenance: null, confidence: 0, modelId: 'starts.career', asOf }),
      );
    }
  }

  return { fields, wrRoleClass, rbRoleClass, d1, d2, projections };
}
