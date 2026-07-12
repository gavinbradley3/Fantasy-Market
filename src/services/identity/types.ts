// Provider-neutral player identity types (Real-Data Integration, Phase 1).
//
// This layer owns the STABLE PlayerTicker player id and the crosswalk between
// external providers (Sleeper, nflverse/GSIS). It carries identity facts only —
// no statistics, no prices, no valuation inputs. The four valuation engines
// never read these types; nothing here may leak into engine behaviour.
//
// Naming note: the demo pool's authored `pt_XXXX` ids (src/data/pool.ts) are a
// separate, hand-curated namespace. Directory-minted ids use the distinct
// `ptp_` prefix so the two can never collide.

import type { Position } from '@/types/market';

/** Stable PlayerTicker-owned player id (`ptp_…`). Never derived from team. */
export type PlayerTickerPlayerId = string;

export type IdentitySource = 'SLEEPER' | 'NFLVERSE';
export type IdentityProvenanceSource = IdentitySource | 'MANUAL';

export type MatchMethod =
  | 'EXISTING_MAPPING'
  | 'DIRECT_CROSSWALK'
  | 'GSIS_ID'
  | 'NAME_BIRTHDATE_POSITION'
  | 'NAME_TEAM_POSITION'
  | 'MANUAL'
  /**
   * Repository adaptation (documented deviation from the illustrative enum):
   * a single-source record preserved with a freshly minted id — no cross-
   * provider match occurred, and pretending one did would corrupt the audit
   * trail. The mapping is still EXACT: the id is anchored to the source id.
   */
  | 'NEW_IDENTITY';

export type MatchConfidence = 'EXACT' | 'HIGH' | 'REVIEW_REQUIRED';

/** One row of the source-id crosswalk: provider id → PlayerTicker id. */
export interface PlayerSourceIdMap {
  playerTickerId: PlayerTickerPlayerId;
  source: IdentitySource;
  sourcePlayerId: string;
  matchMethod: MatchMethod;
  confidence: MatchConfidence;
  /** ISO timestamp of the ingestion run that first created this mapping. */
  validFrom: string;
  /** null while the mapping is current. */
  validTo: string | null;
}

/**
 * Provider-neutral identity record. Field semantics: `null` means the value is
 * missing/unknown at the source — it is NEVER a stand-in for zero, and missing
 * numerics are never coerced to 0.
 */
export interface CanonicalPlayerIdentity {
  playerTickerId: PlayerTickerPlayerId;
  sleeperId: string | null;
  gsisId: string | null;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  /** ISO date (YYYY-MM-DD) when known. */
  birthDate: string | null;
  /** Provider-reported age; never computed locally (would be time-dependent). */
  age: number | null;
  position: Position;
  /** Canonical team abbreviation, or null for free agents / unknown. */
  team: string | null;
  /** 0 is meaningful (rookie); null means the provider did not say. */
  yearsExperience: number | null;
  draftRound: number | null;
  rosterStatus: string | null;
  injuryStatus: string | null;
  practiceStatus: string | null;
  depthChartOrder: number | null;
  provenance: {
    sources: IdentityProvenanceSource[];
    /** ISO timestamp of the ingestion run that produced this record. */
    collectedAt: string;
    effectiveSeason: number | null;
    qualityFlags: string[];
  };
}

/** Outcome of resolving one provider record against the directory. */
export type ResolutionResult =
  | { status: 'MATCHED'; playerTickerId: PlayerTickerPlayerId; method: MatchMethod }
  | { status: 'AMBIGUOUS'; candidates: string[]; reason: string }
  | { status: 'UNMATCHED'; reason: string }
  | { status: 'INVALID'; reason: string };

// ---------- validated provider identity records (post-extraction) ----------

/** Identity-relevant subset of one Sleeper /players/nfl record, validated. */
export interface SleeperIdentityRecord {
  sleeperId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  age: number | null;
  position: Position;
  fantasyPositions: string[];
  teamRaw: string | null;
  team: string | null; // normalized; null = free agent or unrecognized
  yearsExperience: number | null;
  status: string | null;
  injuryStatus: string | null;
  practiceStatus: string | null;
  depthChartOrder: number | null;
  active: boolean | null;
  gsisId: string | null; // Sleeper-published crosswalk id (trimmed)
  espnId: string | null;
  yahooId: string | null;
  nameKey: string; // normalized comparison key (see normalize.ts)
}

/** Identity-relevant subset of one nflverse roster/players row, validated. */
export interface NflverseIdentityRecord {
  gsisId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  position: Position;
  teamRaw: string | null;
  team: string | null;
  season: number | null;
  rosterStatus: string | null;
  yearsExperience: number | null;
  draftRound: number | null;
  sleeperId: string | null; // nflverse-published crosswalk id
  espnId: string | null;
  nameKey: string;
}

// ---------- snapshot / provenance ----------

export interface ProviderSourceMeta {
  /** Exact endpoint or dataset URL the data came from. */
  url: string;
  /** ISO timestamp of the last SUCCESSFUL retrieval. */
  fetchedAt: string | null;
  /** Content checksum of the raw payload (duplicate-ingestion guard). */
  checksum: string | null;
  recordCount: number | null;
  /** Records that failed per-record validation (quarantined, not fatal). */
  invalidRecords: number | null;
  /** True when this run served cached data because the provider failed. */
  stale: boolean;
  /** Human-readable error from the most recent failed refresh, else null. */
  error: string | null;
}

export interface DirectoryReviewEntry {
  source: IdentitySource;
  sourcePlayerId: string;
  fullName: string;
  position: string;
  team: string | null;
  birthDate: string | null;
  reason: string;
  /** Candidate descriptions ("gsisId fullName team birthDate") for manual review. */
  candidates: string[];
}

export interface DirectoryReview {
  ambiguous: DirectoryReviewEntry[];
  unmatched: DirectoryReviewEntry[];
  methodCounts: Record<MatchMethod, number>;
  /** Cross-provider merges flagged for human confirmation (REVIEW_REQUIRED). */
  reviewRequired: DirectoryReviewEntry[];
}

/** The versioned, committed output of one ingestion run. */
export interface PlayerDirectorySnapshot {
  schemaVersion: 1;
  normalizationVersion: number;
  generatedAt: string;
  effectiveSeason: number | null;
  sources: {
    sleeper: ProviderSourceMeta;
    nflverseRoster: ProviderSourceMeta;
    nflversePlayers: ProviderSourceMeta;
  };
  players: CanonicalPlayerIdentity[];
  sourceIdMaps: PlayerSourceIdMap[];
  review: DirectoryReview;
}
