// Production result contract (Phase 3 §8, Cold-audit M1/M2/M3) + input/error types.

import type { CanonicalPlayer } from '@/pipeline/types';
import type {
  ExplanationFragment,
  HonestyState,
  LimitationCode,
  ReproducibilityId,
  SupportedPosition,
} from '@/inference/types';
import type { IntermediateField } from '@/inference/result/types';
import type {
  PlayerConfidenceResult,
  PublicConfidenceResult,
  SourceFamily,
  SourceQualityResult,
} from '@/inference/confidence';
import type { EngineInvocation, EngineOutput, ReadinessStatus } from './engineAdapter';
import type { FieldEmission } from './emit';
import type { D1Diagnostics, D2Diagnostics, NormalizedEvidence, ProjectionDiagnostic } from './orchestrate';

export class ProductionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionValidationError';
  }
}

/**
 * The PRODUCTION input contract (Cold-audit M1). The caller supplies normalized
 * evidence + observed facts; the AIL runs Phase 2A/2B + projections + D1 + D2
 * internally. It does NOT accept precomputed inference fields (see
 * `runInferenceFromFields` for the test-only precomputed-fields path).
 */
export interface NormalizedInferenceInput {
  readonly player: CanonicalPlayer;
  readonly asOf: string;
  /** Observed facts supplement for this player/position (stats/snaps/participation). */
  readonly facts: Readonly<Record<string, unknown>>;
  /**
   * Optional per-fact source timestamps (ISO). Any fact whose timestamp is AFTER
   * `asOf` is excluded before inference (Cold-audit m5, SPEC §25.1 step 2).
   */
  readonly factTimestamps?: Readonly<Record<string, string>>;
  /** Normalized, feature-level evidence for each inference family (all optional). */
  readonly evidence: NormalizedEvidence;
  /** Freshest freshness factor (1.0/0.7) per critical source family (§20.F9). */
  readonly freshnessBySource: Readonly<Partial<Record<SourceFamily, number>>>;
  readonly snapshotIds: readonly string[];
  readonly engineVersion: string;
}

/**
 * Test-only precomputed-fields input (the pre-audit shape). Retained ONLY for
 * targeted unit tests that supply intermediate fields directly; it is NOT the
 * production contract and must never bypass Phase 2A/2B in production (Cold-audit M1).
 */
export interface PrecomputedFieldsInput {
  readonly player: CanonicalPlayer;
  readonly asOf: string;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly inferenceFields: readonly IntermediateField<unknown>[];
  readonly freshnessBySource: Readonly<Partial<Record<SourceFamily, number>>>;
  readonly snapshotIds: readonly string[];
  readonly engineVersion: string;
  readonly factTimestamps?: Readonly<Record<string, string>>;
}

/** A fully-serialized inferred field structure (Cold-audit M3, SPEC §15.1). */
export interface SerializedInferredField {
  readonly field: string;
  readonly value: unknown;
  readonly status: string;
  readonly provenance: string | null;
  readonly confidence: number;
  readonly limitations: readonly string[];
  readonly evidence: readonly { readonly featureKey: string; readonly sourceTimestamp: string }[];
  readonly asOf: string;
  readonly registryVersion: string;
  readonly modelId: string;
}

export interface ProductionResult {
  readonly playerId: string;
  readonly position: SupportedPosition;
  readonly asOf: string;
  readonly snapshotIds: readonly string[];

  readonly ailSupplement: Readonly<Record<string, unknown>>;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly mergedSupplement: Readonly<Record<string, unknown>>;
  readonly emissions: readonly FieldEmission[];
  /** Complete inferred-field structures the AIL produced (Cold-audit M1/M3). */
  readonly inferredFields: readonly IntermediateField<unknown>[];

  readonly readinessStatus: ReadinessStatus;
  readonly readinessMissing: readonly string[];
  readonly engineInvoked: boolean;
  readonly engineOutput: EngineOutput | null;
  readonly engineError: string | null;

  readonly playerConfidence: PlayerConfidenceResult;
  readonly engineConfidence01: number | null;
  readonly publicConfidence: PublicConfidenceResult;
  readonly publicConfidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  readonly honestyState: HonestyState;
  readonly sourceQuality: SourceQualityResult;

  readonly explanations: readonly ExplanationFragment[];
  readonly limitations: readonly LimitationCode[];

  // --- traceability / diagnostics (Cold-audit M1) ---
  readonly wrRoleClass: string | null;
  readonly rbRoleClass: string | null;
  readonly d1Diagnostics: D1Diagnostics | null;
  readonly d2Diagnostics: D2Diagnostics | null;
  readonly projectionDiagnostics: readonly ProjectionDiagnostic[];
  /** Facts excluded because their timestamp was after `asOf` (Cold-audit m5). */
  readonly excludedFutureFacts: readonly string[];

  readonly registryVersion: string;
  readonly inferenceLayerVersion: string;
  readonly envReferenceVersion: string;
  readonly reproducibility: ReproducibilityId;
  /** Digest of the canonical NORMALIZED INPUT (Cold-audit M2, §15.3/§18.2). */
  readonly normalizedInputChecksum: string;
  /** Digest of the complete serialized envelope (Cold-audit M2/M3). */
  readonly outputChecksum: string;
  readonly serialized: string;
}

export type { EngineInvocation };
