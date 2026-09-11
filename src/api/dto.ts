// PlayerTicker internal HTTP API (Phase 9) — transport DTOs + response projections.
//
// The API layer translates HTTP ↔ application DTOs. It exposes ONLY stable, projected shapes:
// it never returns raw persistence records (serialized payloads, schema versions, integrity
// digests are not leaked). Every field here is derived from an application-layer DTO or a
// deliberately narrowed projection of a persistence read.

import type {
  HealthReport,
  PublicationMetadata,
  RefreshExecutionResult,
  SchedulerStatus,
} from '@/application';
import type { PublicationBundle, RefreshRunView } from '@/persistence';
import type { MarketFormat, MarketSnapshot } from '@/market/types';
import { MARKET_ATTRIBUTION, type MarketAttribution } from './marketAttribution';
import {
  projectPublishedPlayer,
  withPositionalRanks,
  type PublishedPlayerProjection,
} from './publicationProjection';

/** A framework-agnostic normalized request (built by the node:http adapter or tests). */
export interface ApiRequest {
  readonly method: string;
  /** Path without query string, e.g. "/publication/history". */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** Parsed JSON body for writes, or undefined. */
  readonly body?: unknown;
}

/** A framework-agnostic response the adapter serializes to the wire. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Uniform error envelope. Never carries stack traces or provider payloads. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    /** Optional validation issues (field → message), for 400s. */
    readonly issues?: readonly string[];
  };
}

/** POST /refresh acknowledgement — accepted/skipped with a reason. */
export interface RefreshAckResponse {
  readonly runId: string | null;
  readonly accepted: boolean;
  readonly skipped: boolean;
  readonly reason: string | null;
  readonly status: RefreshExecutionResult['status'];
  readonly published: boolean;
  readonly publicationId: string | null;
}

/**
 * One projected board entry: identity + content checksums + the display fields the entry's
 * own published artifacts already carry (see `publicationProjection.ts`). Serialized payloads,
 * schema versions and integrity digests of the underlying records are still never leaked, and
 * nothing here is computed — an absent field is `null`, never a placeholder value.
 */
export interface BoardEntryResponse extends PublishedPlayerProjection {
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

/** GET /publication — current published board as a stable projection. */
export interface PublicationResponse {
  readonly publication: PublicationMetadata;
  readonly entries: readonly BoardEntryResponse[];
}

// ---- external market ----

/**
 * One external market quote, projected.
 *
 * DELIBERATELY NARROWER THAN STORAGE. `sourcePlayerId`, `sourceConsensusRank`,
 * `sourcePosition` and `sourceTeam` are retained in the database for audit but are NOT
 * exposed here: re-serving another party's id space and expert-consensus ranks over HTTP
 * would be redistributing their dataset rather than showing a comparison. PlayerTicker
 * publishes only what it actually compares against.
 *
 * `source` and `format` repeat on every record even though the envelope carries them, so a
 * quote lifted out of its response still says who published it and in which lens.
 */
export interface MarketQuoteResponse {
  readonly canonicalPlayerId: string;
  readonly source: string;
  readonly format: MarketFormat;
  /** The source's own scale. `null` means the source published no value — never 0. */
  readonly value: number | null;
  readonly overallRank: number | null;
  readonly positionRank: number | null;
  /** The instant the SOURCE says this quote is for. */
  readonly sourceTimestamp: string;
  /** The instant PlayerTicker captured it. */
  readonly ingestedAt: string;
  readonly freshness: string;
  readonly provenance: string;
}

/** GET /market — the latest quote per player from one external source, plus its attribution. */
export interface MarketResponse {
  readonly source: string;
  readonly format: MarketFormat;
  /** Who published these numbers, under what terms. Never omitted. */
  readonly attribution: MarketAttribution;
  /** The newest source stamp across the returned quotes, or null when there are none. */
  readonly sourceTimestamp: string | null;
  /** The source's own dataset version for the newest quote, when it publishes one. */
  readonly sourceVersion: string | null;
  /** The newest capture instant held, or null. */
  readonly capturedAt: string | null;
  /**
   * How many distinct captures are stored. A consumer needs this before offering ANY movement
   * window: with one capture there is nothing to compare against, so a "7-day change" would
   * be invented rather than measured.
   */
  readonly captureCount: number;
  readonly quoteCount: number;
  readonly quotes: readonly MarketQuoteResponse[];
}

/** One projected source outcome for a run (no serialized payloads). */
export interface RunSourceResponse {
  readonly provider: string;
  readonly capability: string;
  readonly required: boolean;
  readonly mode: string;
  readonly status: string;
  readonly errorCode: string | null;
  readonly failureStage: string | null;
  readonly retryable: boolean | null;
}

/** GET /history/:runId — a durable run projected to a stable shape. */
export interface RunResponse {
  readonly runId: string;
  readonly status: string;
  readonly mode: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly requiredFailure: boolean;
  readonly sourceCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly snapshotId: string | null;
  readonly sources: readonly RunSourceResponse[];
}

// ---- projections (persistence/application → stable API DTOs) ----

export function toRefreshAck(r: RefreshExecutionResult): RefreshAckResponse {
  return {
    runId: r.runId || null,
    accepted: !r.skipped,
    skipped: r.skipped,
    reason: r.skipReason ?? (r.failure ? r.failure.code : null),
    status: r.status,
    published: r.published,
    publicationId: r.publicationId,
  };
}

export function toPublicationResponse(bundle: PublicationBundle, metadata: PublicationMetadata): PublicationResponse {
  // Positional rank is the one field a per-player artifact cannot carry, because it is a
  // statement about the cohort. It is assigned here, over the projected board, so ranking
  // stays a pure function of the published values and never re-runs a valuation.
  return {
    publication: metadata,
    entries: withPositionalRanks(
      bundle.entries.map((e) => ({
        canonicalId: e.canonicalId,
        position: e.position,
        normalizedInputChecksum: e.normalizedInput.checksum,
        outputChecksum: e.output.checksum,
        ...projectPublishedPlayer(e.normalizedInput.serialized, e.output.serialized),
      })),
    ),
  };
}

export function toRunResponse(view: RefreshRunView): RunResponse {
  return {
    runId: view.run.runId,
    status: view.run.status,
    mode: view.run.mode,
    startedAt: view.run.startedAt,
    completedAt: view.run.completedAt,
    requiredFailure: view.run.requiredFailure,
    sourceCount: view.run.sourceCount,
    successCount: view.run.successCount,
    failureCount: view.run.failureCount,
    snapshotId: view.run.snapshotId,
    sources: view.sources.map((s) => ({
      provider: s.provider,
      capability: s.capability,
      required: s.required,
      mode: s.mode,
      status: s.status,
      errorCode: s.errorCode,
      failureStage: s.failureStage,
      retryable: s.retryable,
    })),
  };
}

export type { HealthReport, SchedulerStatus, PublicationMetadata, RefreshExecutionResult };
export type { PublishedCompositesResponse, PublishedPlayerProjection } from './publicationProjection';

/** Project stored market snapshots onto the read-only wire shape. */
export function toMarketResponse(
  source: string,
  format: MarketFormat,
  snapshots: readonly MarketSnapshot[],
  captureInstants: readonly string[],
): MarketResponse {
  // The newest quote decides the response's headline stamps. `getLatestMarketSnapshots`
  // returns one row per player and a player the last capture omitted keeps an older row, so
  // the maximum is taken rather than the first row's value.
  let newest: MarketSnapshot | null = null;
  for (const s of snapshots) {
    if (newest === null || s.sourceTimestamp > newest.sourceTimestamp) newest = s;
  }

  return {
    source,
    format,
    attribution: MARKET_ATTRIBUTION[source] ?? MARKET_ATTRIBUTION.unknown,
    sourceTimestamp: newest?.sourceTimestamp ?? null,
    sourceVersion: newest?.sourceVersion ?? null,
    capturedAt: captureInstants.length > 0 ? captureInstants[captureInstants.length - 1] : null,
    captureCount: captureInstants.length,
    quoteCount: snapshots.length,
    quotes: snapshots.map((s) => ({
      canonicalPlayerId: s.canonicalPlayerId,
      source: s.source,
      format: s.format,
      value: s.value,
      overallRank: s.overallRank,
      positionRank: s.positionRank,
      sourceTimestamp: s.sourceTimestamp,
      ingestedAt: s.ingestedAt,
      freshness: s.freshness,
      provenance: s.provenance,
    })),
  };
}
