// Production orchestration (Phase 3 §7; Cold-audit M1/M2/M3/m1–m5). Binding order,
// deterministic, pure (no fetch, wall clock, randomness, locale, or input mutation).
//
// Runs the AIL END TO END from NORMALIZED input:
//   validate → as-of enforce facts → registry → Phase 2A/2B + projections + D1 + D2
//   → emit (§20.F3) → canonical merge (facts over AIL) → readiness → frozen engine
//   → engine-confidence → public confidence + honesty → explanations/limitations
//   → normalized-input checksum → complete serialized envelope → output checksum
//   → reproducibility metadata.

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
import { mergeFactsOverAilFlat } from '@/inference/supplement/merge';
import { isSupportedPosition } from '@/pipeline/types';
import { LIMITATION_CODES, type HonestyState, type LimitationCode, type SupportedPosition } from '@/inference/types';
import type { IntermediateField } from '@/inference/result/types';
import { emitSupplement } from './emit';
import { invokeEngine } from './engineAdapter';
import {
  buildInferredFieldStructures,
  normalizedInputDigest,
  serializeProductionEnvelope,
} from './serialize';
import { orchestrateInference, type OrchestrationResult } from './orchestrate';
import {
  ProductionValidationError,
  type NormalizedInferenceInput,
  type PrecomputedFieldsInput,
  type ProductionResult,
} from './types';

function publicLabel(pc: number | null): 'LOW' | 'MEDIUM' | 'HIGH' | null {
  if (pc === null) return null;
  if (pc >= 80) return 'HIGH';
  if (pc >= 60) return 'MEDIUM';
  return 'LOW';
}

/** Validate identity/position/date; return the validated pieces or throw. */
function validate(player: NormalizedInferenceInput['player'], asOf: string): {
  position: SupportedPosition;
  playerId: string;
} {
  const position = player.position;
  if (!isSupportedPosition(position)) {
    throw new ProductionValidationError(`unsupported position: ${String(position)}`);
  }
  const playerId = player.identity?.canonical_id;
  if (!playerId) throw new ProductionValidationError('missing player identity');
  if (Number.isNaN(Date.parse(asOf))) {
    throw new ProductionValidationError(`invalid as-of date: ${asOf}`);
  }
  return { position, playerId };
}

/**
 * Cold-audit m5 — exclude any fact whose source timestamp is AFTER `asOf`. Facts
 * without a declared timestamp are assumed already as-of-clamped by the caller and
 * pass through. Returns the clamped facts and the excluded keys (sorted).
 */
function enforceAsOfOnFacts(
  facts: Readonly<Record<string, unknown>>,
  factTimestamps: Readonly<Record<string, string>> | undefined,
  asOf: string,
): { clamped: Record<string, unknown>; excluded: string[] } {
  const asOfMs = Date.parse(asOf);
  const clamped: Record<string, unknown> = {};
  const excluded: string[] = [];
  for (const [k, v] of Object.entries(facts)) {
    const ts = factTimestamps?.[k];
    if (ts !== undefined) {
      const tsMs = Date.parse(ts);
      if (Number.isNaN(tsMs)) {
        throw new ProductionValidationError(`invalid fact timestamp for ${k}: ${ts}`);
      }
      if (tsMs > asOfMs) {
        excluded.push(k);
        continue;
      }
    }
    clamped[k] = v;
  }
  return { clamped, excluded: excluded.sort(compareStrings) };
}

interface FinalizeArgs {
  readonly player: NormalizedInferenceInput['player'];
  readonly position: SupportedPosition;
  readonly playerId: string;
  readonly asOf: string;
  readonly facts: Record<string, unknown>;
  readonly excludedFutureFacts: string[];
  readonly fields: readonly IntermediateField<unknown>[];
  readonly freshnessBySource: NormalizedInferenceInput['freshnessBySource'];
  readonly snapshotIds: readonly string[];
  readonly engineVersion: string;
  readonly orchestration: OrchestrationResult | null;
  /** canonical NORMALIZED INPUT to hash for `normalizedInputChecksum` (M2). */
  readonly canonicalInput: unknown;
}

/**
 * Shared finalize path: emit → canonical merge → readiness/engine → confidence →
 * honesty → explanations → serialize → checksums → reproducibility. Used by both the
 * production `runInference` (from normalized input) and the test-only
 * `runInferenceFromFields`.
 */
function finalize(args: FinalizeArgs): ProductionResult {
  const registry = loadRegistry();
  const { position, fields } = args;

  // Emit final AIL supplement (§20.F3 matrix).
  const emit = emitSupplement(position, fields);

  // Merge AIL under facts through the CANONICAL merge contract (m2) — facts win.
  const mergedSupplement = mergeFactsOverAilFlat(position, emit.supplement, args.facts);

  // Readiness + engine (only when READY).
  const invocation = invokeEngine(position, args.player, mergedSupplement, args.asOf);

  // Confidence & honesty — Phase 2B is composed here from its OWN exported APIs
  // (`buildPlayerConfidence` / `computeSourceQuality` / `computePublicConfidence` /
  // `honestyState`). We call these directly rather than the `runPhase2B` wrapper
  // because that wrapper scores only AIL-produced fields; in production most CRITICAL
  // inputs are observed FACTS (not AIL fields), so its verifiedShare / allCriticalOfficial
  // view would mislabel a facts-complete player. No formula is reimplemented — all math
  // lives in the confidence modules (Cold-audit M1: no duplicated Phase 2B logic).
  const playerConfidence = buildPlayerConfidence(fields, position);
  const sourceQuality = computeSourceQuality(position, args.freshnessBySource);

  const critical = CRITICAL_FIELDS[position];
  const criticalOmitted = emit.omitted.filter((f) => critical.includes(f));
  const anyCriticalOmitted = invocation.readinessStatus !== 'READY';

  const isOfficial = (p: string | null): boolean => p === 'DIRECT' || p === 'DERIVED';
  const participating = fields.filter((f) => membershipConfidence(f) !== null);
  const verifiedShare =
    participating.length > 0
      ? participating.filter((f) => isOfficial(f.provenance)).length / participating.length
      : 1;

  const publicConfidence = computePublicConfidence({
    playerConfidence: playerConfidence.score,
    verifiedShare,
    sourceQualityFactor: sourceQuality.sourceQualityFactor,
    engineConfidence01: invocation.engineConfidence01 ?? undefined,
  });

  const ailCritical = fields.filter((f) => critical.includes(f.field));
  const allCriticalOfficial = !anyCriticalOmitted && ailCritical.every((f) => isOfficial(f.provenance));
  const anyCriticalFallback = ailCritical.some((f) => f.provenance === 'FALLBACK');
  const honesty: HonestyState = honestyState({
    playerConfidence: playerConfidence.score,
    anyCriticalOmitted,
    allCriticalOfficial,
    anyCriticalFallback,
  });

  // Explanations & limitations (deterministic; structural fragments).
  const limitations = [...new Set(fields.flatMap((f) => f.limitations))].sort(compareStrings) as LimitationCode[];
  if (args.excludedFutureFacts.length > 0 && !limitations.includes(LIMITATION_CODES.FUTURE_FACT_EXCLUDED)) {
    limitations.push(LIMITATION_CODES.FUTURE_FACT_EXCLUDED);
    limitations.sort(compareStrings);
  }
  const structural: StructuralInput[] = [];
  if (criticalOmitted.length > 0) {
    structural.push({
      code: 'MISSING_EVIDENCE',
      template: 'missing: {fields}',
      args: { fields: [...criticalOmitted].sort(compareStrings).join(',') },
    });
  }
  if (sourceQuality.minSourceFreshness < 1) {
    structural.push({ code: 'SOURCE_FRESHNESS', template: 'min source freshness {v}', args: { v: sourceQuality.minSourceFreshness } });
  }
  structural.push({ code: 'MODEL_VERSION', template: 'model {v}', args: { v: INFERENCE_LAYER_VERSION } });
  const explanations = composeExplanation([], [], structural);

  // Normalized-input checksum (M2) — over the caller's normalized input, not output.
  const normalizedInputChecksum = normalizedInputDigest(args.canonicalInput);

  // Reproducibility metadata (§18.2 / §1) — carries the INPUT checksum.
  const reproducibility = buildReproducibilityId({
    snapshotIds: args.snapshotIds,
    normalizedInputChecksum,
    registryVersion: registry.registryVersion,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    asOf: args.asOf,
    engineVersion: args.engineVersion,
  });

  // Complete serialized envelope (M3) + output checksum (M2/M3).
  const inferredByField = new Map<string, IntermediateField<unknown>>();
  for (const f of fields) if (!inferredByField.has(f.field)) inferredByField.set(f.field, f);
  const fieldStructures = buildInferredFieldStructures(position, mergedSupplement, inferredByField);

  const provenanceSummary = fieldStructures.map((f) => ({ field: f.field, provenance: f.provenance, status: f.status }));
  const diagnostics = {
    wr_role_class: args.orchestration?.wrRoleClass ?? null,
    rb_role_class: args.orchestration?.rbRoleClass ?? null,
    d1: args.orchestration?.d1 ?? null,
    d2: args.orchestration?.d2 ?? null,
    projections: args.orchestration?.projections ?? [],
    excluded_future_facts: args.excludedFutureFacts,
  };
  const sidecar = {
    provenance_summary: provenanceSummary,
    limitations,
    explanations,
    field_confidence: fields.map((f) => ({ field: f.field, confidence: f.confidence, status: f.status })),
  };

  const { serialized, outputChecksum } = serializeProductionEnvelope({
    schema_version: AIL_SCHEMA_VERSION,
    registry_version: registry.registryVersion,
    model_version: args.engineVersion,
    env_reference_version: ENV_REFERENCE_VERSION,
    player_id: args.playerId,
    position,
    as_of: args.asOf,
    normalized_input_checksum: normalizedInputChecksum,
    reproducibility,
    status: invocation.engineOutput !== null ? 'AVAILABLE' : 'UNAVAILABLE',
    readiness: invocation.readinessStatus,
    readiness_missing: invocation.missing.map((m) => m.field).sort(compareStrings),
    honesty_state: honesty,
    engine_invoked: invocation.engineOutput !== null,
    engine_error: invocation.engineError,
    engine_output: invocation.engineOutput,
    player_confidence: playerConfidence,
    engine_confidence_01: invocation.engineConfidence01,
    public_confidence: publicConfidence,
    public_confidence_label: publicLabel(publicConfidence.publicConfidence),
    fields: fieldStructures,
    facts: args.facts,
    ail_supplement: emit.supplement,
    merged_supplement: mergedSupplement,
    explanations,
    limitations,
    diagnostics,
    sidecar,
  });

  return {
    playerId: args.playerId,
    position,
    asOf: args.asOf,
    snapshotIds: [...args.snapshotIds].sort(compareStrings),
    ailSupplement: emit.supplement,
    facts: args.facts,
    mergedSupplement,
    emissions: emit.emissions,
    inferredFields: fields,
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
    wrRoleClass: args.orchestration?.wrRoleClass ?? null,
    rbRoleClass: args.orchestration?.rbRoleClass ?? null,
    d1Diagnostics: args.orchestration?.d1 ?? null,
    d2Diagnostics: args.orchestration?.d2 ?? null,
    projectionDiagnostics: args.orchestration?.projections ?? [],
    excludedFutureFacts: args.excludedFutureFacts,
    registryVersion: registry.registryVersion,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    envReferenceVersion: ENV_REFERENCE_VERSION,
    reproducibility,
    normalizedInputChecksum,
    outputChecksum,
    serialized,
  };
}

/**
 * Production entry point (Cold-audit M1). Accepts NORMALIZED input and runs the full
 * AIL — Phase 2A/2B + projections + D1 + D2 — internally. The caller never supplies
 * precomputed inference fields.
 */
export function runInference(input: NormalizedInferenceInput): ProductionResult {
  const { position, playerId } = validate(input.player, input.asOf);
  const { clamped, excluded } = enforceAsOfOnFacts(input.facts, input.factTimestamps, input.asOf);

  // Execute Phase 2A/2B + projections + D1 + D2 from normalized evidence.
  const orchestration = orchestrateInference(position, playerId, input.asOf, input.evidence);

  // Canonical NORMALIZED INPUT for the input checksum (M2): identity + facts + evidence
  // + versions; NO generated output.
  const canonicalInput = {
    player_identity: input.player.identity,
    position,
    as_of: input.asOf,
    facts: clamped,
    evidence: input.evidence,
    snapshot_ids: [...input.snapshotIds].sort(compareStrings),
    engine_version: input.engineVersion,
    registry_version: INFERENCE_LAYER_VERSION,
    env_reference_version: ENV_REFERENCE_VERSION,
  };

  return finalize({
    player: input.player,
    position,
    playerId,
    asOf: input.asOf,
    facts: clamped,
    excludedFutureFacts: excluded,
    fields: orchestration.fields,
    freshnessBySource: input.freshnessBySource,
    snapshotIds: input.snapshotIds,
    engineVersion: input.engineVersion,
    orchestration,
    canonicalInput,
  });
}

/**
 * TEST-ONLY entry point that accepts precomputed intermediate fields. It is NOT the
 * production contract and must never be used to bypass Phase 2A/2B in production
 * (Cold-audit M1). Kept so targeted unit tests can drive the finalize path directly.
 */
export function runInferenceFromFields(input: PrecomputedFieldsInput): ProductionResult {
  const { position, playerId } = validate(input.player, input.asOf);
  const { clamped, excluded } = enforceAsOfOnFacts(input.facts, input.factTimestamps, input.asOf);
  const canonicalInput = {
    player_identity: input.player.identity,
    position,
    as_of: input.asOf,
    facts: clamped,
    inference_fields: input.inferenceFields,
    snapshot_ids: [...input.snapshotIds].sort(compareStrings),
    engine_version: input.engineVersion,
    registry_version: INFERENCE_LAYER_VERSION,
    env_reference_version: ENV_REFERENCE_VERSION,
  };
  return finalize({
    player: input.player,
    position,
    playerId,
    asOf: input.asOf,
    facts: clamped,
    excludedFutureFacts: excluded,
    fields: input.inferenceFields,
    freshnessBySource: input.freshnessBySource,
    snapshotIds: input.snapshotIds,
    engineVersion: input.engineVersion,
    orchestration: null,
    canonicalInput,
  });
}
