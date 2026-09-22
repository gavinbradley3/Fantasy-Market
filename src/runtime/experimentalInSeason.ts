// Explicit, non-serving evaluation of the existing inference pipeline without in-season
// participation. This module is intentionally separate from createLivePipeline: production
// source requirements, persistence, publication, and scheduler wiring remain unchanged.

import type { BuildInputOptions, IngestionProvider, NormalizedSnapshot } from '@/ingestion';
import { digest, stableStringify } from '@/inference/util/checksum';
import type { ModelTier } from '@/accessible';
import {
  buildDefaultRegistry,
  computeRequestKey,
  defaultTransportConfig,
  HttpClient,
  refreshSources,
  systemClock,
  type Clock,
  type HttpClient as HttpClientType,
  type ProviderCapability,
  type RawPayloadStore,
  type RefreshMode,
  type RefreshRequest,
  type SourceResult,
  type TransportConfig,
  ENVELOPE_SCHEMA_VERSION,
} from '@/transport';
import { PRODUCTION_CURVE } from '@/utility/productionCurve';
import { NFLVERSE_PARTICIPATION_DELIVERY_POLICY } from '@/transport/providers/nflverseParticipationPolicy';
import { selectInferenceBuilds, type EngineVersions } from './selection';
import { buildSourcePlan, REQUIRED_PROVIDERS } from './sources';
import { applyExperimentalRoleGate } from './experimentalRoleGate';
import { validateRoleReferences } from './experimentalRoleReferences';
import { CONTRACT as ROLE_POLICY } from './experimentalRoleEvidence';

export const EXPERIMENTAL_IN_SEASON_CONFIGURATION = {
  id: 'playerticker.experimental.in-season-participation-independent/v1',
  version: 1,
  productionPublicationAuthorized: false,
  supportedPeriod: {
    firstSeason: NFLVERSE_PARTICIPATION_DELIVERY_POLICY.firstPostseasonOnlySeason,
    /** Conservative regular-season window; the experiment does not infer postseason completion. */
    utcMonthStart: 9,
    utcMonthEnd: 12,
  },
  participationPolicyUrl: NFLVERSE_PARTICIPATION_DELIVERY_POLICY.documentationUrl,
  supportedValuedPaths: ['QB:FULL', 'RB:ACCESSIBLE', 'WR:ACCESSIBLE', 'TE:ACCESSIBLE'],
} as const;

export const EXPERIMENTAL_ROLE_GATED_CONFIGURATION = {
  ...EXPERIMENTAL_IN_SEASON_CONFIGURATION,
  id: 'playerticker.experimental.in-season-participation-independent/v2-role-gated',
  version: 2,
  sourceConfigurationId: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,
  rolePolicyId: ROLE_POLICY.id,
} as const;
export type ExperimentalInSeasonConfigurationId = typeof EXPERIMENTAL_IN_SEASON_CONFIGURATION.id | typeof EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id;

export interface ExperimentalInSeasonOptions {
  /** Must exactly name the versioned experiment. No environment or date selects it. */
  readonly configurationId: ExperimentalInSeasonConfigurationId;
  /** Exactly one explicitly named valuation season is supported by v1. */
  readonly valuationSeasons: readonly number[];
  /** Optional game-only career coordinates; every configured coordinate remains mandatory. */
  readonly careerSeasons?: readonly number[];
  /** Explicit and fixed: this evaluator never defaults to the wall clock. */
  readonly asOf: string;
  /** Explicit live/replay choice; replay never changes configuration based on today's date. */
  readonly mode: RefreshMode;
  /** Sleeper is optional whether requested or omitted. */
  readonly includeSleeper: boolean;
  /** Caller-recorded exact candidate identity; validated but never inferred from a mutable checkout. */
  readonly codeIdentity: { readonly sha: string; readonly tree: string };
  readonly engineVersions?: EngineVersions;
  readonly conditional?: boolean;
  /** v2 only. Validated at this boundary; missing/malformed evidence holds eligibility. */
  readonly roleReferences?: unknown;
}

export interface ExperimentalInSeasonDeps {
  readonly payloadStore: RawPayloadStore;
  readonly transportConfig?: TransportConfig;
  readonly client?: HttpClientType;
  readonly clock?: Clock;
  readonly signal?: AbortSignal;
}

export type ExperimentalSourceState =
  | 'success'
  | 'requested_failure'
  | 'intentionally_unsupported_for_period';

export interface ExperimentalSourceDiagnostic {
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly requestKey: string;
  readonly required: boolean;
  readonly state: ExperimentalSourceState;
  readonly payloadChecksum: string | null;
  readonly error: { readonly code: string; readonly stage: string; readonly retryable: boolean } | null;
  readonly reason: string | null;
}

export type ExperimentalInferenceStatus =
  | 'valued'
  | 'legitimate_insufficient'
  | 'failed_inference'
  | 'missing_inference'
  | 'malformed_null_result'
  | 'unsupported_model_path';

export interface ExperimentalPlayerDiagnostic {
  readonly canonicalId: string;
  readonly position: BuildInputOptions['position'];
  readonly inferenceStatus: ExperimentalInferenceStatus;
  readonly selectedTier: ModelTier | null;
  readonly selectedPath: string | null;
  readonly selectedPathRequiredCapabilities: readonly string[];
  readonly selectedPathHasRequiredEvidence: boolean;
  readonly valued: boolean;
  readonly outputChecksum: string | null;
  readonly engineVersion: string | null;
  readonly unavailableInputs: readonly string[];
  readonly roleClaim: string | null;
  readonly roleValidity: 'UNRESOLVED_NOT_PRODUCTION_VALIDATED';
  readonly error: string | null;
}

export interface ExperimentalInSeasonResult {
  readonly evaluationId: string;
  readonly configuration: {
    readonly id: ExperimentalInSeasonConfigurationId;
    readonly version: 1 | 2;
    readonly sourceConfigurationId?: string;
    readonly rolePolicyId?: string;
    readonly productionPublicationAuthorized: false;
    readonly roleValidity: 'UNRESOLVED_NOT_PRODUCTION_VALIDATED';
  };
  readonly replayInputs: {
    readonly mode: RefreshMode;
    readonly valuationSeasons: readonly number[];
    readonly careerSeasons: readonly number[];
    readonly asOf: string;
    readonly includeSleeper: boolean;
    readonly requestedCoordinates: readonly string[];
    readonly payloadChecksums: readonly string[];
    readonly codeIdentity: { readonly sha: string; readonly tree: string };
    readonly roleReferences?: ReturnType<typeof applyExperimentalRoleGate>['referenceIdentity'];
  };
  readonly versions: {
    readonly experimentalResultSchema: 'playerticker.experimental-evaluation/1' | 'playerticker.experimental-evaluation/2';
    readonly transportEnvelopeSchema: string;
    readonly registryVersions: readonly string[];
    readonly inferenceLayerVersions: readonly string[];
    readonly engineVersions: readonly string[];
    readonly curveVersion: string;
    readonly productionPersistenceSchema: 'NOT_APPLICABLE_NONPERSISTED';
  };
  readonly sources: readonly ExperimentalSourceDiagnostic[];
  readonly sourcePlanComplete: boolean;
  readonly inferenceComplete: boolean;
  readonly experimentalEvaluationComplete: boolean;
  readonly players: readonly ExperimentalPlayerDiagnostic[];
  readonly snapshotId: string | null;
  readonly warnings: readonly string[];
  readonly roleGate?: Omit<ReturnType<typeof applyExperimentalRoleGate>, 'players'>;
}

const BASE_PATH_CAPABILITIES = ['nflverse:identity', 'nflverse:schedule', 'nflverse:roster', 'nflverse:games'] as const;

/** Only these evidence-selected valued paths are authorized by experiment v1. */
const PATH_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  'QB:FULL': BASE_PATH_CAPABILITIES,
  'RB:ACCESSIBLE': BASE_PATH_CAPABILITIES,
  'WR:ACCESSIBLE': BASE_PATH_CAPABILITIES,
  'TE:ACCESSIBLE': BASE_PATH_CAPABILITIES,
};

export function experimentalPathRequiredCapabilities(
  position: BuildInputOptions['position'],
  tier: ModelTier,
): readonly string[] | null {
  return PATH_REQUIREMENTS[`${position}:${tier}`] ?? null;
}

function assertExplicitSupportedOptions(options: ExperimentalInSeasonOptions): number {
  if (options.configurationId !== EXPERIMENTAL_IN_SEASON_CONFIGURATION.id && options.configurationId !== EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id) {
    throw new Error(`unsupported experimental configuration: ${String(options.configurationId)}`);
  }
  if (options.configurationId === EXPERIMENTAL_IN_SEASON_CONFIGURATION.id && options.roleReferences !== undefined) {
    throw new Error('role references require explicit v2 configuration; v1 semantics are unchanged');
  }
  if (options.valuationSeasons.length !== 1 || !Number.isInteger(options.valuationSeasons[0])) {
    throw new Error('experimental v1 requires exactly one explicit integer valuation season');
  }
  const season = options.valuationSeasons[0]!;
  const instant = new Date(options.asOf);
  if (!Number.isFinite(instant.getTime())) throw new Error('experimental v1 requires an explicit valid --as-of');
  const month = instant.getUTCMonth() + 1;
  const period = EXPERIMENTAL_IN_SEASON_CONFIGURATION.supportedPeriod;
  if (season < period.firstSeason || instant.getUTCFullYear() !== season || month < period.utcMonthStart || month > period.utcMonthEnd) {
    throw new Error(
      `experimental v1 supports explicitly selected September-December seasons ${period.firstSeason}+ only`,
    );
  }
  for (const career of options.careerSeasons ?? []) {
    if (!Number.isInteger(career)) throw new Error('career seasons must be integers');
  }
  if (!/^[0-9a-f]{40}$/i.test(options.codeIdentity.sha) || !/^[0-9a-f]{40}$/i.test(options.codeIdentity.tree)) {
    throw new Error('experimental v1 requires explicit 40-hex code SHA and tree identities');
  }
  return season;
}

function coordinate(request: RefreshRequest): string {
  return computeRequestKey(request.provider, request.capability, request.params ?? {});
}

export function buildExperimentalInSeasonSourcePlan(options: ExperimentalInSeasonOptions): {
  readonly requested: readonly RefreshRequest[];
  readonly omitted: readonly ExperimentalSourceDiagnostic[];
} {
  const season = assertExplicitSupportedOptions(options);
  const ordinaryPlan = buildSourcePlan({
    seasons: [season],
    ...(options.careerSeasons ? { careerSeasons: options.careerSeasons } : {}),
    effectiveDate: options.asOf,
    mode: options.mode,
    includeSleeper: options.includeSleeper,
    ...(options.conditional !== undefined ? { conditional: options.conditional } : {}),
  });
  const omittedRequests = ordinaryPlan.filter(
    (request) => request.provider === 'nflverse' && request.capability === 'participation' && request.params?.season === String(season),
  );
  if (omittedRequests.length !== 1) throw new Error('experimental source plan expected exactly one valuation participation coordinate');
  return {
    requested: ordinaryPlan.filter((request) => !omittedRequests.includes(request)),
    omitted: omittedRequests.map((request) => ({
      provider: request.provider,
      capability: request.capability,
      requestKey: coordinate(request),
      required: false,
      state: 'intentionally_unsupported_for_period',
      payloadChecksum: null,
      error: null,
      reason: `documented in-season non-delivery: ${EXPERIMENTAL_IN_SEASON_CONFIGURATION.participationPolicyUrl}`,
    })),
  };
}

function sourceDiagnostic(source: SourceResult): ExperimentalSourceDiagnostic {
  const failed = source.outcome === 'failed';
  return {
    provider: source.provider,
    capability: source.capability,
    requestKey: source.requestKey,
    required: source.provider === 'nflverse',
    state: failed ? 'requested_failure' : 'success',
    payloadChecksum: source.payloadChecksum ?? null,
    error: source.error
      ? { code: source.error.code, stage: source.error.stage, retryable: source.error.retryable }
      : null,
    reason: null,
  };
}

function unavailableInputs(result: NonNullable<import('@/transport').InferenceOutcome['result']>): string[] {
  return [...new Set([
    ...result.readinessMissing,
    ...(result.accessibleOutput?.materialMissingInputs ?? []),
    ...(result.accessibleOutput?.provenance.unavailableFields ?? []),
  ])].sort();
}

function roleClaim(result: NonNullable<import('@/transport').InferenceOutcome['result']>): string | null {
  if (result.accessibleOutput) return result.accessibleOutput.role;
  const depthChart = result.inferredFields.find((field) => field.field === 'depth_chart_status')?.value;
  return typeof depthChart === 'string' && depthChart.length > 0 ? depthChart : null;
}

export function classifyExperimentalPlayers(
  builds: readonly BuildInputOptions[],
  inference: readonly import('@/transport').InferenceOutcome[],
  sourcePlanComplete: boolean,
): ExperimentalPlayerDiagnostic[] {
  return builds.map((build) => {
    const outcome = inference.find((item) => item.canonicalId === build.canonicalId && item.position === build.position);
    const base = {
      canonicalId: build.canonicalId,
      position: build.position,
      roleValidity: 'UNRESOLVED_NOT_PRODUCTION_VALIDATED' as const,
    };
    if (!outcome) {
      return { ...base, inferenceStatus: 'missing_inference' as const, selectedTier: null, selectedPath: null, selectedPathRequiredCapabilities: [], selectedPathHasRequiredEvidence: false, valued: false, outputChecksum: null, engineVersion: null, unavailableInputs: [], roleClaim: null, error: 'selected player has no inference outcome' };
    }
    if (!outcome.ok) {
      return { ...base, inferenceStatus: 'failed_inference' as const, selectedTier: null, selectedPath: null, selectedPathRequiredCapabilities: [], selectedPathHasRequiredEvidence: false, valued: false, outputChecksum: null, engineVersion: null, unavailableInputs: [], roleClaim: null, error: outcome.error ?? 'inference failed' };
    }
    if (!outcome.result) {
      return { ...base, inferenceStatus: 'malformed_null_result' as const, selectedTier: null, selectedPath: null, selectedPathRequiredCapabilities: [], selectedPathHasRequiredEvidence: false, valued: false, outputChecksum: null, engineVersion: null, unavailableInputs: [], roleClaim: null, error: 'successful inference carried no result' };
    }

    const result = outcome.result;
    const legitimateInsufficient = result.modelTier === 'INSUFFICIENT';
    const selectedPath = legitimateInsufficient ? null : `${build.position}:${result.modelTier}`;
    const requirements = legitimateInsufficient ? [] : experimentalPathRequiredCapabilities(build.position, result.modelTier) ?? [];
    const supportedValuedPath = requirements.length > 0;
    const valued = result.modelTier === 'FULL'
      ? result.engineOutput !== null
      : result.modelTier === 'ACCESSIBLE'
        ? result.accessibleOutput !== null
        : false;
    const malformedValued = result.modelTier !== 'INSUFFICIENT' && !valued;
    const inferenceStatus: ExperimentalInferenceStatus = malformedValued
      ? 'malformed_null_result'
      : legitimateInsufficient
        ? 'legitimate_insufficient'
        : supportedValuedPath
          ? 'valued'
          : 'unsupported_model_path';
    return {
      ...base,
      inferenceStatus,
      selectedTier: result.modelTier,
      selectedPath,
      selectedPathRequiredCapabilities: requirements,
      selectedPathHasRequiredEvidence: sourcePlanComplete && supportedValuedPath,
      valued,
      outputChecksum: result.outputChecksum,
      engineVersion: result.reproducibility.engineVersion,
      unavailableInputs: unavailableInputs(result),
      roleClaim: roleClaim(result),
      error: inferenceStatus === 'unsupported_model_path' ? `model path ${selectedPath} is not authorized by experimental v1` : null,
    };
  });
}

/**
 * Run the real acquisition → normalization → selection → evidence → tier → inference path.
 * The return type deliberately contains no RefreshResult, builds, persistence handle, or
 * publish method, so an experiment cannot be handed to production persistence by accident.
 */
export async function evaluateExperimentalInSeason(
  options: ExperimentalInSeasonOptions,
  deps: ExperimentalInSeasonDeps,
): Promise<ExperimentalInSeasonResult> {
  const plan = buildExperimentalInSeasonSourcePlan(options);
  const roleGated = options.configurationId === EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id;
  const references = roleGated ? validateRoleReferences(options.roleReferences, options) : null;
  const clock = deps.clock ?? systemClock;
  const registry = buildDefaultRegistry();
  const transportConfig = deps.transportConfig ?? defaultTransportConfig();
  const client = deps.client ?? new HttpClient({ clock });
  let builds: readonly BuildInputOptions[] = [];
  const refresh = await refreshSources(
    {
      sources: plan.requested,
      policy: { requiredProviders: REQUIRED_PROVIDERS },
      inference: (snapshot: NormalizedSnapshot) => {
        builds = selectInferenceBuilds(snapshot, {
          asOf: options.asOf,
          valuationSeasons: options.valuationSeasons,
          ...(options.engineVersions ? { engineVersions: options.engineVersions } : {}),
        });
        return builds;
      },
    },
    { registry, config: transportConfig, store: deps.payloadStore, client, clock, ...(deps.signal ? { signal: deps.signal } : {}) },
  );

  const acquired = refresh.sources.map(sourceDiagnostic);
  const requestedKeys = plan.requested.map(coordinate).sort();
  const returnedKeys = new Set(refresh.sources.map((source) => source.requestKey));
  const mandatoryKeys = plan.requested.filter((request) => request.provider === 'nflverse').map(coordinate);
  const sourcePlanComplete = mandatoryKeys.every((key) => {
    const source = refresh.sources.find((item) => item.requestKey === key);
    return source !== undefined && source.outcome !== 'failed';
  }) && requestedKeys.every((key) => returnedKeys.has(key));

  const baselinePlayers = classifyExperimentalPlayers(builds, refresh.inference, sourcePlanComplete);
  const gated = references ? applyExperimentalRoleGate(baselinePlayers, references, sourcePlanComplete, options.asOf, refresh.snapshot ?? null) : null;
  const players = gated?.players ?? baselinePlayers;
  const roleGate = gated ? (({ players: _players, ...diagnostic }) => diagnostic)(gated) : null;
  const terminal = new Set<ExperimentalInferenceStatus>(['valued', 'legitimate_insufficient']);
  const inferenceComplete = builds.length > 0 && refresh.inference.length === builds.length && players.every((player) => terminal.has(player.inferenceStatus));
  const payloadChecksums = [...refresh.summary.payloadChecksums].sort();
  const identity = {
    configurationId: options.configurationId,
    valuationSeasons: [...options.valuationSeasons],
    careerSeasons: [...(options.careerSeasons ?? [])].sort((a, b) => a - b),
    asOf: options.asOf,
    mode: options.mode,
    includeSleeper: options.includeSleeper,
    codeIdentity: options.codeIdentity,
    requestedCoordinates: requestedKeys,
    payloadChecksums,
    snapshotId: refresh.snapshot?.snapshotId ?? null,
    players: players.map((player) => ({ canonicalId: player.canonicalId, position: player.position, status: player.inferenceStatus, outputChecksum: player.outputChecksum })),
    ...(roleGate ? { roleGate } : {}),
  };

  return {
    evaluationId: `experiment-${digest(stableStringify(identity))}`,
    configuration: {
      id: options.configurationId,
      version: roleGated ? 2 : 1,
      ...(roleGated ? { sourceConfigurationId: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id, rolePolicyId: ROLE_POLICY.id } : {}),
      productionPublicationAuthorized: false,
      roleValidity: 'UNRESOLVED_NOT_PRODUCTION_VALIDATED',
    },
    replayInputs: {
      mode: options.mode,
      valuationSeasons: [...options.valuationSeasons],
      careerSeasons: [...(options.careerSeasons ?? [])].sort((a, b) => a - b),
      asOf: options.asOf,
      includeSleeper: options.includeSleeper,
      requestedCoordinates: requestedKeys,
      payloadChecksums,
      codeIdentity: { ...options.codeIdentity },
      ...(roleGate ? { roleReferences: roleGate.referenceIdentity } : {}),
    },
    versions: {
      experimentalResultSchema: roleGated ? 'playerticker.experimental-evaluation/2' : 'playerticker.experimental-evaluation/1',
      transportEnvelopeSchema: ENVELOPE_SCHEMA_VERSION,
      registryVersions: [...new Set(refresh.inference.flatMap((outcome) => outcome.result ? [outcome.result.registryVersion] : []))].sort(),
      inferenceLayerVersions: [...new Set(refresh.inference.flatMap((outcome) => outcome.result ? [outcome.result.inferenceLayerVersion] : []))].sort(),
      engineVersions: [...new Set(players.flatMap((player) => player.engineVersion ? [player.engineVersion] : []))].sort(),
      curveVersion: PRODUCTION_CURVE.curveVersion,
      productionPersistenceSchema: 'NOT_APPLICABLE_NONPERSISTED',
    },
    sources: [...acquired, ...plan.omitted].sort((a, b) => a.requestKey.localeCompare(b.requestKey)),
    sourcePlanComplete,
    inferenceComplete,
    experimentalEvaluationComplete: sourcePlanComplete && inferenceComplete && (!roleGate || roleGate.numericalEvaluationComplete),
    players,
    snapshotId: refresh.snapshot?.snapshotId ?? null,
    ...(roleGate ? { roleGate } : {}),
    warnings: [
      'EXPERIMENTAL_NON_SERVING: production publication is not authorized',
      'ROLE_VALIDITY_UNRESOLVED: appearance-window role claims can remain stale after missed team opportunities',
      'POPULATION_ACCURACY_NOT_VALIDATED: synthetic control flow is not population validation',
      ...(roleGated ? ['PROVISIONAL_ROLE_GATE: eligibility hold means current valuation assumptions are unsupported, not zero dynasty value'] : []),
    ],
  };
}
