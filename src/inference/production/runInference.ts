// Production orchestration (Phase 3 §7). Binding order, deterministic, pure
// (no fetch, wall clock, randomness, locale, or input mutation). Runs the AIL end to
// end: emit supplement → merge facts over AIL → readiness → frozen-engine invocation
// → engine-confidence multiplication → public confidence + honesty → explanations →
// canonical serialization → reproducibility metadata.

import {
  buildPlayerConfidence,
  computePublicConfidence,
  computeSourceQuality,
  CRITICAL_FIELDS,
  honestyState,
  membershipConfidence,
} from '@/inference/confidence';
import { composeExplanation, type StructuralInput } from '@/inference/explanations';
import { loadRegistry } from '@/inference/registry/registry';
import { ENV_REFERENCE_VERSION } from '@/inference/registry/envReference';
import { INFERENCE_LAYER_VERSION, AIL_SCHEMA_VERSION } from '@/inference/registry/constants';
import { buildReproducibilityId } from '@/inference/util/replay';
import { compareStrings } from '@/inference/util/ordering';
import { isSupportedPosition } from '@/pipeline/types';
import type { HonestyState, LimitationCode } from '@/inference/types';
import { emitSupplement } from './emit';
import { invokeEngine } from './engineAdapter';
import { serializeProduction } from './serialize';
import { ProductionValidationError, type ProductionInput, type ProductionResult } from './types';

function publicLabel(pc: number | null): 'LOW' | 'MEDIUM' | 'HIGH' | null {
  if (pc === null) return null;
  if (pc >= 80) return 'HIGH';
  if (pc >= 60) return 'MEDIUM';
  return 'LOW';
}

/** Production entry point (replaces the Phase-1 stub). */
export function runInference(input: ProductionInput): ProductionResult {
  // 1. Validate input.
  const position = input.player.position;
  if (!isSupportedPosition(position)) {
    throw new ProductionValidationError(`unsupported position: ${String(position)}`);
  }
  const playerId = input.player.identity?.canonical_id;
  if (!playerId) throw new ProductionValidationError('missing player identity');
  // 2. Enforce as-of cutoff (fields/facts are produced as-of; validate the date).
  if (Number.isNaN(Date.parse(input.asOf))) {
    throw new ProductionValidationError(`invalid as-of date: ${input.asOf}`);
  }

  // 3. Load & validate registry (throws RegistryValidationError on checksum mismatch).
  const registry = loadRegistry();

  // 6. Emit final AIL supplement (§20.F3 matrix).
  const emit = emitSupplement(position, input.inferenceFields);

  // 7. Merge AIL under facts — observed facts win (REGISTRY §13.2).
  const mergedSupplement: Record<string, unknown> = { ...emit.supplement, ...input.facts };

  // 8/9. Assess readiness on the merged input; invoke the frozen engine iff READY.
  const invocation = invokeEngine(position, input.player, mergedSupplement, input.asOf);

  // 11. Confidence & honesty.
  const playerConfidence = buildPlayerConfidence(input.inferenceFields, position);
  const sourceQuality = computeSourceQuality(position, input.freshnessBySource);

  const critical = CRITICAL_FIELDS[position];
  const criticalOmitted = emit.omitted.filter((f) => critical.includes(f));
  // Readiness READY guarantees every required field is present (from facts or AIL);
  // a critical field can only be "omitted" when readiness is NOT_READY.
  const anyCriticalOmitted = invocation.readinessStatus !== 'READY';

  const isOfficial = (p: string | null): boolean => p === 'DIRECT' || p === 'DERIVED';
  // verified_share over AIL-produced participating fields; a facts-complete player
  // (no AIL fields) is fully verified (verifiedShare = 1).
  const participating = input.inferenceFields.filter((f) => membershipConfidence(f) !== null);
  const verifiedShare =
    participating.length > 0 ? participating.filter((f) => isOfficial(f.provenance)).length / participating.length : 1;

  const publicConfidence = computePublicConfidence({
    playerConfidence: playerConfidence.score,
    verifiedShare,
    sourceQualityFactor: sourceQuality.sourceQualityFactor,
    engineConfidence01: invocation.engineConfidence01 ?? undefined,
  });

  // Critical fields the AIL contributed; those not in this list came from observed
  // facts (which are DIRECT/DERIVED). READY ⇒ all criticals present.
  const ailCritical = input.inferenceFields.filter((f) => critical.includes(f.field));
  const allCriticalOfficial = !anyCriticalOmitted && ailCritical.every((f) => isOfficial(f.provenance));
  const anyCriticalFallback = ailCritical.some((f) => f.provenance === 'FALLBACK');
  const honesty: HonestyState = honestyState({
    playerConfidence: playerConfidence.score,
    anyCriticalOmitted,
    allCriticalOfficial,
    anyCriticalFallback,
  });

  // 12. Explanations & limitations (deterministic structural fragments).
  const limitations = [...new Set(input.inferenceFields.flatMap((f) => f.limitations))].sort(compareStrings) as LimitationCode[];
  const structural: StructuralInput[] = [];
  if (criticalOmitted.length > 0) {
    structural.push({ code: 'MISSING_EVIDENCE', template: 'missing: {fields}', args: { fields: [...criticalOmitted].sort(compareStrings).join(',') } });
  }
  if (sourceQuality.minSourceFreshness < 1) {
    structural.push({ code: 'SOURCE_FRESHNESS', template: 'min source freshness {v}', args: { v: sourceQuality.minSourceFreshness } });
  }
  structural.push({ code: 'MODEL_VERSION', template: 'model {v}', args: { v: INFERENCE_LAYER_VERSION } });
  const explanations = composeExplanation([], [], structural);

  // 13. Serialize canonical production output.
  const serialized = serializeProduction({
    schema_version: AIL_SCHEMA_VERSION,
    registry_version: registry.registryVersion,
    model_version: input.engineVersion,
    player_id: playerId,
    position,
    as_of: input.asOf,
    readiness: invocation.readinessStatus,
    honesty_state: honesty,
    mergedSupplement,
  });

  // 14. Reproducibility metadata.
  const reproducibility = buildReproducibilityId({
    snapshotIds: input.snapshotIds,
    normalizedInputChecksum: serialized.checksum,
    registryVersion: registry.registryVersion,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    asOf: input.asOf,
    engineVersion: input.engineVersion,
  });

  return {
    playerId,
    position,
    asOf: input.asOf,
    snapshotIds: [...input.snapshotIds].sort(compareStrings),
    ailSupplement: emit.supplement,
    facts: input.facts,
    mergedSupplement,
    emissions: emit.emissions,
    readinessStatus: invocation.readinessStatus,
    readinessMissing: invocation.missing.map((m) => m.field).sort(compareStrings),
    engineInvoked: invocation.engineOutput !== null,
    engineOutput: invocation.engineOutput,
    engineError: invocation.engineError,
    playerConfidence,
    engineConfidence01: invocation.engineConfidence01,
    publicConfidence,
    publicConfidenceLabel: publicLabel(publicConfidence.publicConfidence),
    honestyState: honesty,
    sourceQuality,
    explanations,
    limitations,
    registryVersion: registry.registryVersion,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    envReferenceVersion: ENV_REFERENCE_VERSION,
    reproducibility,
    checksum: serialized.checksum,
    serialized: serialized.serialized,
  };
}
