// Phase-2B intermediate orchestration + serialization (Phase 2B §9).
//
// Assembles the complete intermediate result from the emitted intermediate fields:
// player confidence, critical-source quality, public confidence factors, honesty
// state, deterministic ordering, and the reproducibility id. It emits NO production
// supplement, performs NO merge, NO readiness activation, and NO engine call.

import {
  buildPlayerConfidence,
  computePublicConfidence,
  computeSourceQuality,
  CRITICAL_FIELDS,
  honestyState,
  membershipConfidence,
  type PlayerConfidenceResult,
  type PublicConfidenceResult,
  type SourceFamily,
  type SourceQualityResult,
} from '@/inference/confidence';
import { ENV_REFERENCE_VERSION } from '@/inference/registry/envReference';
import { REGISTRY_VERSION, INFERENCE_LAYER_VERSION } from '@/inference/registry/constants';
import { compareStrings } from '@/inference/util/ordering';
import type { HonestyState, SupportedPosition } from '@/inference/types';
import type { ReproducibilityId } from '@/inference/types';
import type { IntermediateField } from './types';

export interface Phase2BContext {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly asOf: string;
  /** All emitted intermediate fields (Phase 2A classifications + Phase 2B outputs). */
  readonly fields: readonly IntermediateField<unknown>[];
  /** Freshest freshness factor (1.0/0.7) per critical source family (§20.F9). */
  readonly freshnessBySource: Partial<Record<SourceFamily, number>>;
  /** CRITICAL fields that are omitted (non-nullable numeric, could not estimate). */
  readonly criticalOmitted?: readonly string[];
  readonly reproducibility: ReproducibilityId;
  /** optional engine confidence 0..1 (deferred integration). */
  readonly engineConfidence01?: number;
}

export interface Phase2BResult {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly asOf: string;
  readonly registryVersion: string;
  readonly inferenceLayerVersion: string;
  readonly envReferenceVersion: string;
  readonly fields: readonly IntermediateField<unknown>[];
  readonly playerConfidence: PlayerConfidenceResult;
  readonly sourceQuality: SourceQualityResult;
  readonly publicConfidence: PublicConfidenceResult;
  readonly honestyState: HonestyState;
  readonly reproducibility: ReproducibilityId;
}

export function runPhase2B(ctx: Phase2BContext): Phase2BResult {
  // Deterministic field ordering (intermediate: by field name ascending).
  const fields = [...ctx.fields].sort((a, b) => compareStrings(a.field, b.field));

  const playerConfidence = buildPlayerConfidence(fields, ctx.position);
  const sourceQuality = computeSourceQuality(ctx.position, ctx.freshnessBySource);

  const criticalOmitted = new Set(ctx.criticalOmitted ?? []);
  const critical = CRITICAL_FIELDS[ctx.position];
  const presentCritical = fields.filter((f) => critical.includes(f.field));
  const isOfficial = (p: string | null): boolean => p === 'DIRECT' || p === 'DERIVED';
  const anyCriticalOmitted = criticalOmitted.size > 0;
  const allCriticalOfficial =
    !anyCriticalOmitted && presentCritical.length === critical.length && presentCritical.every((f) => isOfficial(f.provenance));
  const anyCriticalFallback = presentCritical.some((f) => f.provenance === 'FALLBACK');

  // verified_share over participating fields (§11.3).
  const participating = fields.filter((f) => membershipConfidence(f) !== null);
  const verified = participating.filter((f) => isOfficial(f.provenance)).length;
  const verifiedShare = participating.length > 0 ? verified / participating.length : 0;

  const publicConfidence = computePublicConfidence({
    playerConfidence: playerConfidence.score,
    verifiedShare,
    sourceQualityFactor: sourceQuality.sourceQualityFactor,
    engineConfidence01: ctx.engineConfidence01,
  });

  const honesty = honestyState({
    playerConfidence: playerConfidence.score,
    anyCriticalOmitted,
    allCriticalOfficial,
    anyCriticalFallback,
  });

  return {
    position: ctx.position,
    canonicalId: ctx.canonicalId,
    asOf: ctx.asOf,
    registryVersion: REGISTRY_VERSION,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    envReferenceVersion: ENV_REFERENCE_VERSION,
    fields,
    playerConfidence,
    sourceQuality,
    publicConfidence,
    honestyState: honesty,
    reproducibility: ctx.reproducibility,
  };
}
