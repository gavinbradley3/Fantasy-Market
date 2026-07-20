// Canonical PlayerTicker data-pipeline types (real-data foundation milestone).
//
// These types are the boundary between raw provider payloads and the frozen
// valuation engines. Nothing here weakens or reaches into an engine: the
// pipeline PRODUCES canonical records, and a separate readiness layer maps
// those records into the engines' own public input types.
//
// Two ideas are load-bearing and repeated everywhere:
//   1. Every canonical field is a FieldState<T> — either present WITH
//      provenance, or explicitly missing WITH a reason. We never invent 0/""/
//      false/"Unknown" for absent data (DESIGN §14.2, §27).
//   2. Canonical identity is independent of any single provider. `canonical_id`
//      is the permanent system-of-record id (DESIGN §27); provider ids are
//      added, never repurposed.

import type { Position } from '@/types/market';

// The four positions PlayerTicker values. Re-exported from the shared market
// type so there is exactly one definition of "supported position".
export type SupportedPosition = Position; // 'QB' | 'RB' | 'WR' | 'TE'

export const SUPPORTED_POSITIONS: readonly SupportedPosition[] = ['QB', 'RB', 'WR', 'TE'];

export function isSupportedPosition(value: string): value is SupportedPosition {
  return value === 'QB' || value === 'RB' || value === 'WR' || value === 'TE';
}

// Providers approved by the DESIGN §14.3 data audit for THIS milestone. Sleeper
// (player metadata/identity) and nflverse (open ids + draft/roster data). Others
// named in §27 are reserved as id slots but not yet ingested.
export type ProviderId = 'sleeper' | 'nflverse';

export const PROVIDER_IDS: readonly ProviderId[] = ['sleeper', 'nflverse'];

// How a present value came to be. DIRECT = taken verbatim from the provider;
// DERIVED = computed from other provider fields (e.g. age from birth_date);
// FALLBACK = filled from a lower-precedence provider when the primary lacked it.
export type Provenance = 'DIRECT' | 'DERIVED' | 'FALLBACK';

// Why a value is absent. Distinguishing these is the whole point: an engine
// consumer treats "the source doesn't carry this field" differently from
// "the source carried it but it failed validation".
export type MissingReason =
  | 'NOT_PROVIDED' // no approved source supplied this field for this player
  | 'UNSUPPORTED_BY_SOURCE' // no approved source can supply this field at all
  | 'INVALID'; // a source supplied it but it failed validation

export interface PresentField<T> {
  readonly present: true;
  readonly value: T;
  readonly provider: ProviderId;
  readonly provenance: Provenance;
  /** ISO-8601 timestamp of the snapshot the value came from. */
  readonly sourceTimestamp: string;
}

export interface MissingField {
  readonly present: false;
  readonly reason: MissingReason;
  /** Short, non-sensitive note (never a raw payload dump). */
  readonly note?: string;
}

// Discriminated union — exhaustive `present` handling is enforced by callers.
export type FieldState<T> = PresentField<T> | MissingField;

// Availability, normalized across providers. Mirrors the engines' notion of
// status but stays provider-neutral; the readiness layer maps it to each
// engine's own injury enum.
export type CanonicalStatus = 'active' | 'injured' | 'suspended' | 'inactive';

// Provider identifiers retained on the canonical record. Every id is optional:
// a player known only to Sleeper has no gsis id, and vice-versa. Keys mirror
// DESIGN §27's multi-id table (only the audited-for-this-milestone subset is
// ever populated; the rest are reserved slots).
export interface ProviderIds {
  readonly sleeper?: string;
  readonly gsis?: string; // nflverse / NFL GSIS join key
  readonly espn?: string;
  readonly yahoo?: string;
  readonly sportradar?: string;
}

export interface CanonicalIdentity {
  /** Permanent system-of-record id, e.g. "pt_0042" or a derived "pt-…". */
  readonly canonical_id: string;
  /** Retained provider ids. Added over time, never repurposed. */
  readonly provider_ids: ProviderIds;
  /** lowercase, diacritics stripped, suffixes removed (DESIGN §27). */
  readonly name_normalized: string;
  /** True when `canonical_id` was minted this run (no prior mapping existed). */
  readonly newly_created: boolean;
}

// Per-record provenance so a canonical player is fully auditable back to the
// snapshots that produced it.
export interface CanonicalProvenance {
  /** Providers that contributed at least one field, sorted, de-duped. */
  readonly sources: readonly ProviderId[];
  /** Deterministic generation stamp (pipeline config, never Date.now). */
  readonly generated_at: string;
}

// The canonical player record. Identity + position are always known (a record
// with neither a strong id nor a supported position never becomes canonical).
// Everything else is a FieldState.
export interface CanonicalPlayer {
  readonly identity: CanonicalIdentity;
  readonly position: SupportedPosition;
  readonly full_name: FieldState<string>;
  readonly team: FieldState<string>;
  readonly age: FieldState<number>;
  readonly birth_date: FieldState<string>;
  readonly nfl_seasons_completed: FieldState<number>;
  readonly rookie_year: FieldState<number>;
  readonly draft_year: FieldState<number>;
  readonly draft_round: FieldState<number>;
  readonly draft_pick: FieldState<number>;
  readonly height_inches: FieldState<number>;
  readonly weight_pounds: FieldState<number>;
  readonly jersey_number: FieldState<number>;
  readonly status: FieldState<CanonicalStatus>;
  readonly injury_designation: FieldState<string>;
  readonly headshot_url: FieldState<string>;
  readonly provenance: CanonicalProvenance;
}
