# PlayerTicker Real-Data Integration — Phase 1: Identity & Source Resolution

Status: implemented, integrated on the four-position (WR/RB/TE/QB) baseline.
Scope: **identity only** — no statistics, no engine inputs, no prices. The
WR/RB/TE/QB valuation engines and their golden outputs are untouched by this
layer and must remain so. QB identity support corresponds to the completed QB
engine and shared-UI integration; wiring live performance data into any engine
remains a later phase. The identity directory's `ptp_…` ids are a separate
namespace from the demo pool's authored `pt_XXXX` ids until a later bridge is
implemented.

## What this layer does

A provider-neutral player directory that identifies and reconciles QB/RB/WR/TE
players across PlayerTicker, Sleeper, and nflverse/GSIS:

- one **stable PlayerTicker player id** (`ptp_…`) per physical player;
- validated extraction of identity fields from both providers;
- deterministic cross-provider matching with explicit refusal of ambiguity;
- preserved unmatched/ambiguous records for manual review;
- cached snapshots with provenance, freshness, checksums, and error states;
- safe degradation when a provider is down.

## Network boundary

PlayerTicker is a statically deployed browser SPA (Vite build, no backend).
The Sleeper player map is ~5 MB and nflverse CSVs are larger — clients must
never download them. The boundary is therefore an **explicit ingestion
command** run by a maintainer (at most once per day, per Sleeper's documented
limit):

```
npm run ingest:identity -- [--season 2025] [--offline] [--timeout 30000] [--no-enrichment]
```

It writes:

| Path | Purpose | Committed? |
| --- | --- | --- |
| `src/data/identity/player-directory.json` | versioned normalized directory (players, source-id maps, review, provenance) | yes |
| `src/data/identity/identity-review.json` | human-readable unmatched/ambiguous review report | yes |
| `src/data/identity/manual-mappings.json` | reviewer-authored resolutions, applied on the next run | yes (hand-edited) |
| `.cache/identity/*` | raw provider payloads (last valid copy per source) | no (gitignored) |

The app reads the committed snapshot via
`loadCommittedDirectory()` (`src/services/identity/directory.ts`) — a dynamic
import, validated with zod on load, degrading to an empty directory rather
than crashing. Until the first real ingestion run the committed snapshot is a
valid empty placeholder whose freshness reports `neverIngested: true`.

## Data sources (pinned)

| Source | Exact location | Fields used |
| --- | --- | --- |
| Sleeper | `GET https://api.sleeper.app/v1/players/nfl` (documented public API, no auth) | `player_id`, names, `birth_date`, `age`, `position`, `fantasy_positions`, `team`, `status`, `injury_status`, `practice_participation`, `depth_chart_order`, `years_exp`, `active`, `gsis_id`, `espn_id`, `yahoo_id` |
| nflverse rosters | `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv` | `season`, `team`, `position`, `status`, names, `birth_date`, `gsis_id`, **`sleeper_id`** (published crosswalk), `espn_id`, `years_exp` |
| nflverse players (enrichment only) | `https://github.com/nflverse/nflverse-data/releases/download/players/players.csv` | `gsis_id`, `display_name`, `birth_date` (backfill), `draft_round` |

CSV only — no R/Python/parquet dependency. Required-column absence throws
(`NflverseSchemaError`); malformed individual rows/records are quarantined and
counted, never fatal. Unknown provider fields pass through harmlessly.

## Module map (`src/services/identity/`)

| File | Responsibility |
| --- | --- |
| `types.ts` | provider-neutral types: `CanonicalPlayerIdentity`, `PlayerSourceIdMap`, `ResolutionResult`, snapshot/provenance/review shapes |
| `normalize.ts` | versioned (`NORMALIZATION_VERSION`) team/position/name/birth-date normalization; raw values are preserved alongside |
| `csv.ts` | minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF) |
| `schemas.ts` | zod schemas: lenient per-record provider validation, strict snapshot/manual-mappings validation |
| `sleeperIdentity.ts` | raw Sleeper map → validated `SleeperIdentityRecord[]` |
| `nflverse.ts` | roster/players CSV → validated `NflverseIdentityRecord[]` + enrichment |
| `resolver.ts` | deterministic matching, id minting, canonical merge, review report |
| `ingest.ts` | orchestrator: fetch → cache → validate → resolve → snapshot; failure policy |
| `directory.ts` | runtime read side: indexed lookups, freshness, staleness, review access |
| `scripts/ingest-player-identity.mts` | CLI wrapper (file-backed cache, output writing, summary) |

## Identity & matching rules

Ids are minted once, anchored to the strongest stable source id available
(`ptp_gsis_<gsis_id>`, else `ptp_slp_<sleeper_id>`), and preserved forever via
the mapping table. They never encode team/status/season, so trades, cuts,
display-name changes, and new seasons cannot move them. (The demo pool's
authored `pt_XXXX` ids are a separate namespace; the `ptp_` prefix guarantees
no collision.)

Match order (each Sleeper record vs. nflverse), applied in two passes so
name-based matches can never steal a stable-id claim:

1. `EXISTING_MAPPING` — prior snapshot mappings (fed forward every run);
2. `DIRECT_CROSSWALK` — nflverse roster's published `sleeper_id` column;
3. `GSIS_ID` — Sleeper's published `gsis_id` field (whitespace-trimmed);
4. `NAME_BIRTHDATE_POSITION` — exact name key + birth date + compatible position (confidence HIGH);
5. `NAME_TEAM_POSITION` — exact name key + team + compatible position, only
   when exactly one same-name candidate exists at all (auto-matched but
   confidence `REVIEW_REQUIRED`, listed for confirmation);
6. `MANUAL` — `manual-mappings.json`, reviewer decisions; they override prior mappings.

Refusals: >1 candidate at any level, duplicate names without a stronger
identifier, incompatible positions, or an already-claimed source id →
`AMBIGUOUS`, **no mapping is created** and the record is listed in the review
report with candidate descriptions. Unmatched records are preserved as
single-source identities (`NEW_IDENTITY` — a documented addition to the method
enum, since pretending a match occurred would corrupt the audit trail) so a
later run can attach the other provider without id churn.

Merge precedence for paired records: Sleeper wins volatile facts (team,
status, injury, practice, depth order, age); nflverse wins curated facts
(display name, birth date, draft round). Cross-provider disagreements set
quality flags (`NAME_MISMATCH`, `TEAM_MISMATCH`, `BIRTHDATE_MISMATCH`,
`POSITION_MISMATCH`) instead of being silently resolved. Missing values stay
`null` — never coerced to zero; `years_exp: 0` (rookie) is preserved as `0`.

## Failure behaviour

- Provider refresh fails, raw cache exists → build from cache, source marked
  `stale: true` with the error string and the ORIGINAL `fetchedAt`.
- Required source has neither network nor cache → **abort without writing**;
  the previously committed snapshot remains the last valid state.
- `players.csv` enrichment failures are warnings, never fatal.
- Prior mappings are always fed forward; a degraded run cannot erase them or
  invent new matches.
- Checksums (FNV-1a pair) detect duplicate ingestion of unchanged data.

## Review workflow

`identity-review.json` lists every ambiguous, review-required, and unmatched
record with name, position, team, birth date, source id, refusal reason, and
candidate descriptions (`gsisId name pos team born`). To resolve one manually:
verify the player, add an entry to `manual-mappings.json`
(`{ playerTickerId, source, sourcePlayerId, note }`), and re-run
`npm run ingest:identity`.

## Explicitly out of scope (later phases)

Weekly statistics, play-by-play, snap/route metrics, rolling windows, engine
input builders, market price/ADP/dynasty value, Sleeper trending integration
with this directory, and any UI redesign. The existing
`SleeperMetadataProvider` (demo-pool display metadata) is untouched and
continues to serve the current UI.
