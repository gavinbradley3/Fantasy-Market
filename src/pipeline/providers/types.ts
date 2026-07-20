// The typed provider boundary. A ProviderAdapter turns ONE provider's raw
// payload into a list of provider-neutral ProviderRecords plus a parse report.
// Provider-specific response shapes never escape this boundary — normalization,
// identity resolution, and the engines see only ProviderRecord.

import type { CanonicalStatus, ProviderId, SupportedPosition } from '@/pipeline/types';

// A single normalized-but-not-yet-canonical player record from one provider.
// Fields are optional because providers differ in coverage; absence here means
// "this provider did not supply it", which normalization turns into an explicit
// MissingField. Values are already type-checked (numbers are numbers), but no
// cross-provider reconciliation has happened yet.
export interface ProviderRecord {
  readonly provider: ProviderId;
  /** This provider's primary key for the player (always present). */
  readonly providerPlayerId: string;
  /** Cross-provider ids this provider happens to carry (Sleeper carries many). */
  readonly crossIds: {
    readonly sleeper?: string;
    readonly gsis?: string;
    readonly espn?: string;
    readonly yahoo?: string;
    readonly sportradar?: string;
  };
  readonly position: SupportedPosition;
  readonly fullName?: string;
  readonly team?: string;
  readonly age?: number;
  readonly birthDate?: string; // ISO date
  readonly nflSeasonsCompleted?: number;
  readonly rookieYear?: number;
  readonly draftYear?: number;
  readonly draftRound?: number;
  readonly draftPick?: number;
  readonly heightInches?: number;
  readonly weightPounds?: number;
  readonly jerseyNumber?: number;
  readonly status?: CanonicalStatus;
  readonly injuryDesignation?: string;
  readonly headshotUrl?: string;
}

// Why a raw entry was rejected before it could become a ProviderRecord. Kept
// coarse on purpose — actionable context without dumping raw payloads.
export type RejectReason =
  | 'MALFORMED' // failed schema validation
  | 'UNSUPPORTED_POSITION' // not one of QB/RB/WR/TE
  | 'DUPLICATE_PROVIDER_ID' // a second entry with the same primary id
  | 'MISSING_PRIMARY_ID'; // no usable primary key

export interface RejectedEntry {
  readonly provider: ProviderId;
  readonly reason: RejectReason;
  /** A stable, non-sensitive locator (the offending id or key), never a dump. */
  readonly locator: string;
}

export interface AdapterResult {
  readonly provider: ProviderId;
  readonly records: readonly ProviderRecord[];
  readonly rejected: readonly RejectedEntry[];
}

// A ProviderAdapter is deterministic: same raw payload + timestamp in, same
// AdapterResult out. `parse` never throws on individual bad records — it
// rejects them and keeps going, so one malformed entry cannot poison a payload.
export interface ProviderAdapter {
  readonly provider: ProviderId;
  parse(raw: unknown): AdapterResult;
}
