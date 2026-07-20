# PlayerTicker Real-Data Pipeline (Foundation Milestone)

This document describes the first production-quality slice of PlayerTicker's
real-data pipeline: the boundary that turns approved free-source provider data
into stable, canonical, provenance-tracked player records and evaluates whether
those records are ready to enter the frozen WR / RB / TE / QB valuation engines.

It began as a **metadata foundation** and now includes the **nflverse statistics
stage** and the **nflverse snap-count / participation stage** (below). Later
milestones add the projections and context stages.

> See [`DATA_PIPELINE_STATS.md`](./DATA_PIPELINE_STATS.md) for the statistics
> stage and [`DATA_PIPELINE_SNAPS.md`](./DATA_PIPELINE_SNAPS.md) for the
> snap-count / participation stage: datasets, per-position field ownership,
> the position-specific route-proxy authorization, and honest readiness
> measurement.

## Architecture at a glance

```
raw provider payloads
   │  (fixtures/pipeline/raw/*.json — or live Sleeper)
   ▼
Raw snapshot layer            src/pipeline/snapshot.ts
   │  provider, schemaVersion, retrievedAt, season, recordCount, checksum
   ▼
Provider adapters             src/pipeline/providers/{sleeper,nflverse}/
   │  typed ProviderRecord[] + rejected entries (never throws per-record)
   ▼
Identity resolution           src/pipeline/identity.ts
   │  strong-id union → canonical clusters (NEVER merges on name)
   ▼
Normalization                 src/pipeline/normalize.ts
   │  field precedence + provenance + explicit missing-data states
   ▼
Canonical validation          src/pipeline/validation.ts
   │  semantic range/identity checks
   ▼
Engine-input readiness        src/pipeline/readiness/engineReadiness.ts
   │  canonical (+ future-stage metrics) → exact engine input OR typed gap report
   ▼
Pipeline report               src/pipeline/report.ts
```

The orchestrator (`src/pipeline/runPipeline.ts`) is pure — snapshots in, report
out, no IO — so the whole pipeline is deterministic and unit-testable. The CLI
(`scripts/run-pipeline.ts`) handles file/network IO around it.

## Approved providers and source precedence

Authority: `DESIGN.md §14.3` (future data sources) and `§15` (licensing). No
standalone audit file exists; §14.3 is the audit of record. Only free,
ToS-compliant sources are used.

| Provider | Fields used | Precedence | Fallback | Limitations |
|---|---|---|---|---|
| **Sleeper** (`/players/nfl`) | name, team, position, availability/injury, age, birth_date, experience, height, weight, jersey; ids: sleeper, gsis, espn, yahoo, sportradar | **Primary** for all live metadata | nflverse fills metadata gaps | No draft capital; no usage stats; ToS: fetch ≤ 1×/day |
| **nflverse** (players dataset) | draft year/round/pick, rookie year, GSIS join key; ids: gsis, sleeper, espn, yahoo, sportradar; metadata as fallback | **Primary** for draft capital & GSIS | Sleeper (metadata only) | Open data; release-to-release column drift; no live injuries |

Field ownership is enforced in `normalize.ts`: metadata uses
`[sleeper, nflverse]` precedence; draft capital uses `[nflverse, sleeper]`.
Disagreements are kept at the higher-precedence value **and reported as metadata
conflicts** — never silently dropped.

## Canonical identity strategy

- `canonical_id` is the permanent system-of-record id (`DESIGN §27`). It is
  independent of any single provider; provider ids are retained and added over
  time, never repurposed.
- Resolution priority (strong ids only):
  1. a **shared strong id** joins records across providers into one cluster;
  2. a **persisted identity map** (`fixtures/pipeline/identity-map.json`) pins the
     canonical id for known players;
  3. otherwise a new id is **minted deterministically** from the strongest
     available provider id (`pt-<hash>`), stable across runs and machines.
- **Names never merge players.** There is no code path that unions two records
  without a shared strong id. Two different players sharing a normalized name are
  kept separate and reported as an ambiguous **name collision** for a future
  resolution queue.
- Inconsistencies are surfaced, not hidden: an identity map that points two
  clusters at one id is reported as a **duplicate canonical id** and fails the run.

## Missing-data behavior

Every canonical field is a `FieldState<T>` — either **present** (with provider,
provenance `DIRECT|DERIVED|FALLBACK`, and source timestamp) or **missing** (with
a reason: `NOT_PROVIDED`, `UNSUPPORTED_BY_SOURCE`, `INVALID`). Placeholder values
(`0`, `""`, `false`, `"Unknown"`) are never used where they could be mistaken for
real data. Example: headshots are `UNSUPPORTED_BY_SOURCE` this milestone (no
licensed image source, `DESIGN §15.3`).

## Engine-input readiness

All four positions have a real, frozen engine: **WR, RB, TE, and QB**. The
readiness layer converts a canonical player into the **exact** public input type
each engine expects (`WRMVPInput` / `RBMVPInput` / `TEMVPInput` / `QBMVPInput`) —
no engine formula, threshold, type, or golden is touched. The non-metadata portion
of each input is typed as `Omit<EngineInput, metadataKeys>`, so the engines remain
the single source of truth for their own shapes.

- Metadata this milestone supplies: `player_id`, `player_name`, `team`, `age`,
  `nfl_seasons_completed`, `draft_round` (null = engine-defined unknown),
  `injury_status` (derived from canonical status), and the as-of date
  (`as_of_timestamp` for WR/RB/TE, `as_of` for QB).
- Everything else (usage, efficiency, projections, role context, and non-null
  required fields like `career_routes`, `expected_games_remaining`, or QB
  `career_pass_attempts`) comes from **future stages** — reported per field as
  `stats`, `projections`, or `context`.
- A player is `READY` only when required metadata is present **and** a complete
  metrics supplement is provided. No value is manufactured to make an engine run.
- **QB is fully supported by the readiness architecture** — there is no
  `ENGINE_UNAVAILABLE` state for it. A live, metadata-only QB is `NOT_READY`
  because its stats/projections/context inputs are missing, reported per field by
  stage. QB's injury enum has no `UNKNOWN`, so a QB with no known availability
  status is `NOT_READY` (missing `injury_status`) rather than assumed healthy.

Because this milestone has no live stats source, live records for every position
are correctly reported **not valuation-ready**. The boundary is proven end-to-end
by committed demonstration supplements (`fixtures/pipeline/metrics.sample.json`)
that carry one WR through `evaluateWideReceiver` and one QB through
`evaluateQuarterback` in tests and in the fixture pipeline.

## Snapshots

Raw payloads are wrapped as snapshots with `provider`, `schemaVersion`,
`retrievedAt`, `season`, `recordCount`, and a deterministic `checksum`
(`src/pipeline/snapshot.ts`). `verifySnapshot` re-checks the checksum and record
count on load; a mismatch fails the run. Committed fixtures are small and
deterministic (generated with a fixed capture timestamp). Large external datasets
are **not** committed.

## Running the pipeline

No credentials are needed for fixture mode; a fresh clone can run it immediately.

```bash
npm install

# Full offline fixture pipeline (deterministic), text report:
npm run pipeline:fixture

# Explicit modes / options:
npm run pipeline -- --mode fixture                       # offline, committed snapshots
npm run pipeline -- --mode validate                      # snapshot + canonical validation only
npm run pipeline -- --mode live --out-snapshots ./out    # refresh Sleeper over the network
npm run pipeline -- --mode fixture --json --out report.json

# Regenerate committed snapshot fixtures after editing a raw payload:
npm run generate:pipeline-fixtures
```

- **fixture** (default): loads committed snapshots, runs the full pipeline.
- **live**: refreshes Sleeper metadata via the app's `SleeperClient`; nflverse
  uses its committed snapshot (a live nflverse CSV pull is a future stage). Writes
  captured raw snapshots to `--out-snapshots` when provided. Live failures never
  make the deterministic tests depend on the network.
- **validate**: verifies snapshot integrity and canonical validation only; exits
  non-zero on any integrity or validation failure.

Exit code is non-zero only for a **true** pipeline failure (bad snapshot, nothing
loaded, corrupted identities). Ordinary missing optional data and not-yet-ready
players are reported, not fatal.

## Generated outputs

- `fixtures/pipeline/snapshots/{sleeper,nflverse}.snapshot.json` — committed,
  checksummed raw snapshots (regenerated by `generate:pipeline-fixtures`).
- `--out <path>` — a JSON pipeline report (not committed).

## Current limitations / next milestone

- **No stats/projections/context stages yet** — so live players are metadata-only
  and reported not valuation-ready for all four positions. This is expected.
- **Live nflverse** pull (CSV → snapshot) is not implemented; live mode refreshes
  Sleeper and reuses the committed nflverse snapshot.
- Identity resolution is strong-id-only by design; composite/fuzzy matching is a
  deliberately deferred, audit-gated future addition.

Per-position input still required from later stages:

- **WR / TE:** career routes, route participation, targets-per-route-run,
  efficiency metrics, projected volume, and role context.
- **RB:** career touches/carries/routes, snap & carry shares, rushing/receiving
  efficiency, projected team volume, and role context.
- **QB:** career and recent passing/rushing volume and efficiency, expected
  active-game workload, offensive/protection context, depth-chart & role status.

**Recommended next milestone:** a **stats stage** — an nflverse weekly/seasonal
usage + efficiency adapter that produces the `stats`-owned supplement fields for
all four positions (WR/TE routes & targets, RB touches & efficiency, QB pass/rush
volume & efficiency), joined to canonical ids by GSIS. That is the single change
that moves the most players from `NOT_READY` to `READY`.
