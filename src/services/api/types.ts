// Browser-safe contracts for the PlayerTicker internal HTTP API (Phase 10).
//
// These are DELIBERATE DUPLICATES of the API layer's response DTOs, not imports of them.
// `@/api` is Node-only (node:http, node:sqlite, scheduler, persistence); importing anything
// from it — even a type — would put a browser file one careless `import` away from pulling the
// backend into the bundle, and the boundary tests forbid it outright. The cost of duplication
// is one contract to keep in step; the docs for it live in `docs/FRONTEND_API_CONTRACT.md`,
// and `src/api/frontendIntegration.test.ts` keeps the two honest — it parses a REAL server
// response with the schemas in `publication.ts`/`health.ts`, so a server-side shape change
// that drifted from these types would fail there.
//
// Nothing in this file has behavior. Nothing here may import React or Node.

export type ApiPositionCode = string;

/** Composite scores as published by a valuation engine. Absent horizon → null. */
export interface ApiComposites {
  readonly weekly: number | null;
  readonly ros: number | null;
  readonly oneYear: number | null;
  readonly threeYear: number | null;
  readonly dynasty: number | null;
}

/** One player on a published board, exactly as `GET /publication` projects it. */
export interface ApiBoardEntry {
  readonly canonicalId: string;
  readonly position: ApiPositionCode;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
  readonly name: string | null;
  readonly team: string | null;
  readonly age: number | null;
  readonly playerStatus: string | null;
  readonly asOf: string | null;
  readonly outputStatus: string | null;
  readonly readiness: string | null;
  readonly readinessMissingCount: number | null;
  readonly honestyState: string | null;
  readonly engineInvoked: boolean;
  readonly publicConfidenceLabel: string | null;
  readonly confidenceScore: number | null;
  readonly confidenceLabel: string | null;
  readonly volatilityScore: number | null;
  readonly volatilityLabel: string | null;
  /** Null whenever no engine ran for this player — never a zeroed stand-in. */
  readonly composites: ApiComposites | null;
  readonly limitations: readonly string[];
}

export interface ApiPublicationMetadata {
  readonly publicationId: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly boardChecksum: string;
  readonly entryCount: number;
  readonly publishedAt: string;
  readonly supersededPublicationId: string | null;
}

/** `GET /publication` — the current published board. */
export interface ApiPublicationResponse {
  readonly publication: ApiPublicationMetadata;
  readonly entries: readonly ApiBoardEntry[];
}

/** `GET /health` — the backend's deterministic self-report. */
export interface ApiHealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly scheduler: { readonly enabled: boolean; readonly running: boolean; readonly state: string };
  readonly persistence: { readonly available: boolean };
  readonly publication: {
    readonly hasCurrent: boolean;
    readonly currentPublicationId: string | null;
    readonly boardChecksum: string | null;
  };
  readonly replay: { readonly available: boolean };
  readonly transport: { readonly requiredProviders: readonly string[]; readonly replayEnabled: boolean };
  readonly checkedAt: string;
}

/** The uniform error envelope every non-2xx response carries. */
export interface ApiErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly string[];
  };
}
