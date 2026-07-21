// Registry loading, validation, and typed constant access (REGISTRY §1, §16, §21).
//
// The registry is the single source of the AIL's runtime constants. Phase 1 loads
// and validates the infrastructure registry and the canonical environment
// reference; it exposes typed accessors. It performs NO inference math.

import {
  AIL_SCHEMA_VERSION,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  HIGH_BAND,
  IMPORTANCE_WEIGHT,
  INFERENCE_LAYER_VERSION,
  LOW_BAND,
  NULL_FIELD_CONFIDENCE,
  PLAYER_CONFIDENCE_CAP,
  PLAYER_CONFIDENCE_FLOOR,
  REGISTRY_VERSION,
  TTL_REGISTRY,
  WGM_FLOOR_IN,
  type ImportanceTier,
  type TtlEntry,
  type TtlKey,
} from './constants';
import {
  ENV_REFERENCE_CHECKSUM,
  ENV_REFERENCE_VERSION,
  loadEnvReference,
  verifyEnvReferenceChecksum,
  type EnvReference,
} from './envReference';

export class RegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryValidationError';
  }
}

export interface InferenceRegistry {
  readonly registryVersion: string;
  readonly inferenceLayerVersion: string;
  readonly schemaVersion: string;
  readonly confidence: {
    readonly min: number;
    readonly max: number;
    readonly lowBand: number;
    readonly highBand: number;
    readonly playerFloor: number;
    readonly playerCap: number;
    readonly wgmFloorIn: number;
  };
  readonly envReference: EnvReference;
  importanceWeight(tier: ImportanceTier): number;
  ttl(key: TtlKey): TtlEntry;
  nullFieldConfidence(kind: keyof typeof NULL_FIELD_CONFIDENCE): number;
}

const SEMVER = /^air-\d+\.\d+\.\d+$/;

/**
 * Load and validate the registry. Throws `RegistryValidationError` on any
 * inconsistency (bad version format, env-reference checksum mismatch, band
 * ordering). Deterministic and side-effect free.
 */
export function loadRegistry(): InferenceRegistry {
  validateVersions();
  validateBands();
  validateEnvReferenceIntegrity();

  const envReference = loadEnvReference();

  return {
    registryVersion: REGISTRY_VERSION,
    inferenceLayerVersion: INFERENCE_LAYER_VERSION,
    schemaVersion: AIL_SCHEMA_VERSION,
    confidence: {
      min: CONFIDENCE_MIN,
      max: CONFIDENCE_MAX,
      lowBand: LOW_BAND,
      highBand: HIGH_BAND,
      playerFloor: PLAYER_CONFIDENCE_FLOOR,
      playerCap: PLAYER_CONFIDENCE_CAP,
      wgmFloorIn: WGM_FLOOR_IN,
    },
    envReference,
    importanceWeight: (tier) => IMPORTANCE_WEIGHT[tier],
    ttl: (key) => TTL_REGISTRY[key],
    nullFieldConfidence: (kind) => NULL_FIELD_CONFIDENCE[kind],
  };
}

function validateVersions(): void {
  for (const v of [REGISTRY_VERSION, INFERENCE_LAYER_VERSION]) {
    if (!SEMVER.test(v)) {
      throw new RegistryValidationError(`invalid registry version format: ${v}`);
    }
  }
}

function validateBands(): void {
  const ordered =
    CONFIDENCE_MIN < LOW_BAND &&
    LOW_BAND < HIGH_BAND &&
    HIGH_BAND <= CONFIDENCE_MAX &&
    PLAYER_CONFIDENCE_FLOOR >= CONFIDENCE_MIN &&
    PLAYER_CONFIDENCE_CAP <= CONFIDENCE_MAX;
  if (!ordered) {
    throw new RegistryValidationError('confidence band/floor/cap ordering is invalid');
  }
}

function validateEnvReferenceIntegrity(): void {
  if (!verifyEnvReferenceChecksum()) {
    throw new RegistryValidationError(
      `env reference ${ENV_REFERENCE_VERSION} checksum mismatch (expected ${ENV_REFERENCE_CHECKSUM})`,
    );
  }
}
