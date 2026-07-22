// Production result contract (Phase 3 §8) + input/error types.

import type { CanonicalPlayer } from '@/pipeline/types';
import type { ExplanationFragment, HonestyState, LimitationCode, ReproducibilityId, SupportedPosition } from '@/inference/types';
import type { IntermediateField } from '@/inference/result/types';
import type { PlayerConfidenceResult, PublicConfidenceResult, SourceFamily, SourceQualityResult } from '@/inference/confidence';
import type { EngineInvocation, EngineOutput, ReadinessStatus } from './engineAdapter';
import type { FieldEmission } from './emit';

export class ProductionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionValidationError';
  }
}

export interface ProductionInput {
  readonly player: CanonicalPlayer;
  readonly asOf: string;
  /** Observed facts supplement for this player/position (stats/snaps/participation). */
  readonly facts: Readonly<Record<string, unknown>>;
  /** Phase 2A + 2B intermediate fields for this player. */
  readonly inferenceFields: readonly IntermediateField<unknown>[];
  /** Freshest freshness factor (1.0/0.7) per critical source family (§20.F9). */
  readonly freshnessBySource: Readonly<Partial<Record<SourceFamily, number>>>;
  readonly snapshotIds: readonly string[];
  readonly engineVersion: string;
  /** Optional opaque D1/D2 diagnostics carried into the result. */
  readonly d1Diagnostics?: unknown;
  readonly d2Diagnostics?: unknown;
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

  readonly registryVersion: string;
  readonly inferenceLayerVersion: string;
  readonly envReferenceVersion: string;
  readonly reproducibility: ReproducibilityId;
  readonly checksum: string;
  readonly serialized: string;
}

export type { EngineInvocation };
