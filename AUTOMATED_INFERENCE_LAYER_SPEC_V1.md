# AUTOMATED_INFERENCE_LAYER_SPEC_V1.md

**Document status:** Design specification (V1). Specification-only. No production
code, engine change, or player value is produced by this document.

**Estimand governance:** This layer is subordinate to
`docs/valuation-models/MARKET_MODEL_FOUNDATION_V2.md` (the constitution). Where
this document and the constitution disagree, the constitution governs. Where an
individual engine's binding implementation contract (WR §26, RB §26, TE §26, QB
§26) and an earlier explanatory section disagree, the binding implementation
contract governs.

**Authoritative baseline (verified):** branch
`claude/playerticker-automated-inference-spec-lm3kt3` reset to the readiness-frontier
tip `8b03353c451e93549ba3c193eda9be45ecd19124`
(`origin/claude/playerticker-live-readiness-frontier`), `982` passing tests, four
frozen engines (WR/RB/TE/QB), canonical metadata + nflverse weekly-stat + snap +
limited participation pipelines, staged provenance/readiness, readiness-frontier
audit. See the completion report for verification detail.

**Self-audit result (Section 33):** The MVP contract (Section 32) is designed so
two competent developers implementing only that section against the same
normalized snapshots and as-of date produce materially equivalent outputs. Every
residual divergence is either specified, marked as a required product decision
(Section 31), or explicitly excluded from the MVP.

---

## Table of contents

1. Purpose and system boundary
2. Complete field inventory
3. Source strategy
4. Normalized inference feature model
5. Inference output contract
6. Projection framework
7. Role inference
8. Competition pressure
9. Contract security
10. Team and quarterback environment
11. Availability and expected games
12. Routes problem
13. QB starts problem
14. Model hierarchy and fallbacks
15. Confidence model
16. Integration with valuation confidence
17. Explanation system
18. Versioning and model governance
19. Validation and calibration
20. Public honesty layer
21. Readiness policy
22. Position-specific inference contracts
23. Edge cases
24. TypeScript architecture
25. Deterministic execution contract
26. Testing contract
27. Golden fixtures
28. Operational workflow
29. Cost and practicality
30. Implementation phases
31. Required specification decisions
32. Practical MVP contract (binding)
33. Mandatory analysis questions + specification self-audit

---

# Section 1 — Purpose and system boundary

## 1.1 Responsibility of the inference layer

The Automated Inference Layer (AIL) converts **objective, automatically
obtainable public data** into the projection, role, environment, availability,
and context inputs the frozen WR/RB/TE/QB engines require but that free source
adapters cannot supply directly. Its single output is a set of **inference
supplements**: `Partial<MetricsSupplement>` entries keyed by canonical id and
position, each field carrying an explicit provenance, confidence, and
explanation. The AIL replaces the *authored* supplement path envisioned by
`READINESS_FRONTIER_AUDIT.md` Strategy E/F+ with a *deterministic, versioned,
model-derived* supplement path, so that normal weekly operation requires no
player-by-player manual entry.

The AIL exists to answer exactly one class of question: *"Given only information
available on or before an as-of date, what is the best deterministic estimate of
each unresolved engine input, how was it produced, and how much should the
product trust it?"* It does not price players, rank them, detect mispricing, or
render UI.

## 1.2 What each neighbouring component owns

| Component | Owns | Does NOT own |
|---|---|---|
| **Source adapters** (`src/pipeline/providers/**`, `stats/**`, `snaps/**`, `participation/**`) | Fetching provider payloads; producing `FieldState<T>` facts with `DIRECT`/`DERIVED`/`FALLBACK` provenance and honest `missing` reasons; snapshot capture | Any estimate, projection, classification, or forward-looking value |
| **Feature builder** (AIL, new) | Provider-neutral, as-of-safe features computed from normalized facts | Provider I/O; engine formulas |
| **Inference models** (AIL, new) | Deterministic per-field estimates, classifications, confidence, explanation fragments | Mutating facts; calling engines |
| **Supplement generator** (AIL, new) | Emitting `MetricsSupplements` entries + a parallel inference-provenance sidecar | Deciding readiness |
| **Readiness** (`readiness/engineReadiness.ts`) | Structural completeness check → `READY`/`NOT_READY`; building the exact engine input by spread | Whether a value is *reliable* |
| **Valuation engines** (frozen `*-model/`) | Components, composites, EFO, engine confidence, volatility, engine fallbacks | Any AIL concept; the AIL never edits them |
| **Public confidence composer** (AIL, new, Section 16) | Combining engine confidence with inference coverage/quality into a public confidence + honesty state | Changing engine *values* |
| **UI** | Presentation, disclosure badges | Producing estimates |

## 1.3 What the AIL explicitly does NOT do

- It never mutates a frozen engine formula, threshold, type, or golden output.
- It never labels an estimate as `DIRECT` provider data (constitution P23, §8.4).
- It never fabricates a value to force readiness; a field it cannot estimate is
  emitted `UNAVAILABLE`, leaving the player `NOT_READY` for that engine.
- It never makes a runtime LLM/network call, reads the wall clock, or uses
  unversioned external projections inside a calculation (Core Principle 1).
- It never treats subjective free text as data (constitution §11.9, §19.3).
- It performs no player-by-player manual entry in normal operation; the only
  manual surface is the versioned model registry and an exceptional
  incident-control override (Section 14.6).

## 1.4 System diagram

```
Providers (nflverse pbp/weekly/rosters/schedules, Sleeper metadata, injury feed)
  ↓                                                   [source adapters]
Snapshots (immutable, snapshot-id + sourceTimestamp + license)
  ↓                                                   [snapshot store]
Normalized facts (CanonicalPlayer + FieldState facts, provenance-tagged)
  ↓                                                   [normalize]
Feature construction (as-of-clamped, provider-neutral InferenceFeatures)
  ↓                                                   [AIL: features/]
Inference models (per field: value + provenance + confidence + explanation)
  ↓                                                   [AIL: shared/ wr/ rb/ te/ qb/]
Inference supplements (MetricsSupplements + InferenceSidecar)
  ↓                                                   [AIL: registry/ supplement]
Readiness (structural completeness → READY_* / NOT_READY)
  ↓                                                   [readiness/engineReadiness]
Frozen valuation engines (WR/RB/TE/QB) — unchanged
  ↓
Public confidence composer + honesty state
  ↓                                                   [AIL: reporting/]
Public valuation, disclosure, explanations
```

The AIL occupies the "Feature construction → Inference models → Inference
supplements" band and the "Public confidence composer" band. Everything above
"Normalized facts" and the engines themselves are pre-existing and unchanged.

---

# Section 2 — Complete field inventory

## 2.1 How to read this matrix

Every unresolved engine input (the `MetricsSupplement` keys — i.e. every field
outside the eight shared metadata keys already produced by the canonical
pipeline) is listed. Columns:

- **Blocking**: `yes` if the readiness model requires it present for the engine
  to be callable (all non-metadata supplement keys are required-present today;
  see `engineReadiness.ts` `*_REQUIRED_SUPPLEMENT`). "Nullable" indicates the
  engine accepts `null` as a *defined unknown* — the key must still be present.
- **Stage**: current owning stage from `readiness/metrics.ts`
  (`stats`/`projections`/`context`), or `metadata`.
- **Availability class**: from `readiness-audit/classifier.ts`.
- **Inference model**: the AIL model id that will produce it (Sections 6–13), or
  `— (adapter)` when a free source adapter already supplies it and the AIL only
  passes it through / fills gaps.
- **Output class**: the `provenance` the AIL stamps (Section 5): `DERIVED`,
  `MODEL_ESTIMATE`, `MODEL_CLASSIFICATION`, `PROXY`, `FALLBACK`, `UNAVAILABLE`,
  `NOT_APPLICABLE`. (`DIRECT` is reserved for source adapters; the AIL never
  emits it.)

Each field is additionally assigned one **disposition**: `directly-sourceable`,
`mechanically-derivable`, `statistically-projectable`,
`deterministically-classifiable`, `defensible-proxy`, `engine-owned-fallback`,
`impossible-without-contract-change`, or `should-remain-unavailable`.

## 2.2 Shared / multi-position concepts

| Concept | Positions | Nullable | Blocking | Stage | Avail. class | Inference model | Output class | Disposition |
|---|---|---|---|---|---|---|---|---|
| expected_games_remaining | WR/RB/TE/QB | no | yes | projections | DERIVABLE_FREE | `avail.expected_games` (S11) | MODEL_ESTIMATE | statistically-projectable |
| projected_team_dropbacks | WR/RB/TE | yes | yes | projections | DERIVABLE_FREE | `proj.team_volume` (S6/S10) | MODEL_ESTIMATE | statistically-projectable |
| projected_team_non_qb_rush_attempts | RB | yes | yes | projections | DERIVABLE_FREE | `proj.team_volume` | MODEL_ESTIMATE | statistically-projectable |
| team_points_per_drive | WR/RB/TE | yes | yes | projections | DERIVABLE_FREE | `env.team_offense` (S10) | MODEL_ESTIMATE | mechanically-derivable |
| team_red_zone_trips_per_game | RB/TE | yes | yes | projections | DERIVABLE_FREE | `env.team_offense` | MODEL_ESTIMATE | mechanically-derivable |
| qb_environment_score | WR/TE | yes | yes | context | DERIVABLE_FREE | `env.qb_environment` (S10) | MODEL_ESTIMATE | mechanically-derivable |
| offensive_environment_score | QB | yes | yes | context | DERIVABLE_FREE | `env.team_offense` | MODEL_ESTIMATE | mechanically-derivable |
| protection_context_score | QB | yes | yes | context | DERIVABLE_FREE | `env.protection` (S10) | MODEL_ESTIMATE | mechanically-derivable |
| competition_pressure | WR/RB/TE/QB | yes | yes | context | AUTHORED_ESTIMATE | `role.competition` (S8) | MODEL_ESTIMATE | statistically-projectable |
| contract_security | WR/RB/TE/QB | yes | yes | context | AUTHORED_ESTIMATE | `stability.roster_security` (S9) | MODEL_ESTIMATE | deterministically-classifiable |
| organizational_commitment | QB | yes | yes | context | AUTHORED_ESTIMATE | `stability.roster_security` | MODEL_ESTIMATE | deterministically-classifiable |
| practice_status | WR/RB/TE | no(enum) | yes | context | DIRECT_FREE | `— (injury adapter)` (S11) | DERIVED | directly-sourceable |
| workload_ramp_factor | RB/TE | yes | yes | context | DERIVABLE_FREE | `avail.ramp` (S11) | DERIVED | mechanically-derivable |

## 2.3 Role / stability classifications (position-shaped)

| Field | Positions | Nullable | Blocking | Stage | Avail. class | Inference model | Output class | Disposition |
|---|---|---|---|---|---|---|---|---|
| route_role_change | WR | no(enum) | yes | context | AUTHORED_FACT | `role.change` (S7) | MODEL_CLASSIFICATION | deterministically-classifiable |
| role_change | RB/TE | no(enum) | yes | context | AUTHORED_FACT | `role.change` | MODEL_CLASSIFICATION | deterministically-classifiable |
| depth_chart_role | TE | no(enum) | yes | context | DIRECT_FREE | `role.depth_chart` (S7) | MODEL_CLASSIFICATION | deterministically-classifiable |
| depth_chart_status | QB | no(enum) | yes | context | DIRECT_FREE | `role.depth_chart` | MODEL_CLASSIFICATION | deterministically-classifiable |
| role_status | QB | no(enum) | yes | context | AUTHORED_FACT | `role.qb_role` (S7) | MODEL_CLASSIFICATION | deterministically-classifiable |
| prospect_type | TE | no(enum) | yes | context | AUTHORED_FACT | `role.te_prospect` (S7) | MODEL_CLASSIFICATION | deterministically-classifiable |
| coaching_continuity | RB/TE | no(enum) | yes | context | DERIVABLE_FREE | `env.continuity` (S10) | MODEL_CLASSIFICATION | mechanically-derivable |
| teammate_return_flag | RB/TE | no(bool) | yes | context | AUTHORED_FACT | `role.competition` (S8) | MODEL_CLASSIFICATION | deterministically-classifiable |
| incoming_competition_flag | RB | no(bool) | yes | context | AUTHORED_FACT | `role.competition` | MODEL_CLASSIFICATION | deterministically-classifiable |
| another_receiving_te_flag | TE | no(bool) | yes | context | AUTHORED_FACT | `role.competition` | MODEL_CLASSIFICATION | deterministically-classifiable |
| temporary_opportunity_flag | TE | no(bool) | yes | context | AUTHORED_FACT | `role.change` | MODEL_CLASSIFICATION | deterministically-classifiable |
| new_team_flag | TE | no(bool) | yes | context | DIRECT_FREE | `env.continuity` | DERIVED | mechanically-derivable |
| high_recent_workload_flag | RB | no(bool) | yes | context | DERIVABLE_FREE | `avail.workload` (S11) | DERIVED | mechanically-derivable |
| team_change | QB | no(bool) | yes | context | DIRECT_FREE | `env.continuity` | DERIVED | mechanically-derivable |
| major_system_change | QB | no(bool) | yes | context | DERIVABLE_FREE | `env.continuity` | MODEL_CLASSIFICATION | mechanically-derivable |
| recent_role_change | QB | no(bool) | yes | context | AUTHORED_FACT | `role.change` | MODEL_CLASSIFICATION | deterministically-classifiable |
| qb_rush_pressure | RB | yes | yes | context | DERIVABLE_FREE | `env.qb_rush_pressure` (S10) | MODEL_ESTIMATE | mechanically-derivable |

## 2.4 Historical blockers (routes / starts)

| Field | Positions | Nullable | Blocking | Stage | Avail. class | Inference model | Output class | Disposition |
|---|---|---|---|---|---|---|---|---|
| career_routes | WR/RB/TE | no | yes | stats | PAID_ONLY (spec-fallback) | `routes.career` (S12) | PROXY / MODEL_ESTIMATE | impossible-without-contract-change (see S12/S31) |
| career_targets | TE | no | yes | stats | DERIVABLE_FREE | `— (stats adapter)` | DERIVED | mechanically-derivable |
| career_touches | RB | no | yes | stats | DERIVABLE_FREE | `— (stats adapter)` | DERIVED | mechanically-derivable |
| career_carries | RB | no | yes | stats | DERIVABLE_FREE | `— (stats adapter)` | DERIVED | mechanically-derivable |
| career_games_played | QB | no | yes | stats | DERIVABLE_FREE | `— (stats adapter)` | DERIVED | mechanically-derivable |
| career_pass_attempts / career_rush_attempts | QB | no | yes | stats | DERIVABLE_FREE | `— (stats adapter)` | DERIVED | mechanically-derivable |
| career_starts | QB | no | yes | stats | PAID_ONLY (spec-fallback) | `starts.career` (S13) | PROXY / MODEL_ESTIMATE | impossible-without-contract-change (see S13/S31) |
| recent_starts | QB | no | yes | stats | PAID_ONLY (spec-fallback) | `starts.recent` (S13) | PROXY / MODEL_ESTIMATE | impossible-without-contract-change |
| route_participation_last4/last8 | WR/RB/TE | yes | yes(present) | stats | PAID_ONLY→proxy | `routes.recent` (S12) | PROXY / UNAVAILABLE | defensible-proxy / engine-owned-fallback (TE) |
| targets_per_route_run | WR/RB/TE | yes | yes(present) | stats | PAID_ONLY→proxy | `routes.tprr` (S12) | MODEL_ESTIMATE / UNAVAILABLE | defensible-proxy |

## 2.5 Statistically-projectable per-position volume/efficiency inputs

These are *nullable* engine inputs (defined unknown = `null`) that the AIL fills
where free stats permit, else emits `UNAVAILABLE` (present as `null`). They are
`DERIVED` when a direct free counting-stat ratio exists, `MODEL_ESTIMATE` when a
projection/shrinkage model produces them. The complete per-position lists are the
remaining `*_REQUIRED_SUPPLEMENT` keys not covered in 2.2–2.4:

- **WR:** `target_share`, `expected_fantasy_points_per_target`,
  `catch_rate_over_expected`, `depth_adjusted_yards_per_target`,
  `average_depth_of_target`, `expected_td_rate_per_target`,
  `previous_route_participation`, `previous_targets_per_route_run`,
  `career_targets_per_route_run`, `career_expected_fantasy_points_per_target`.
- **RB:** `snap_share_last4/last8`, `carry_share_last4`, `goal_line_carry_share`,
  `red_zone_carry_share`, `yards_per_carry`, `rushing_success_rate`,
  `explosive_run_rate`, `catch_rate`, `receiving_yards_per_reception`,
  `previous_snap_share`, `previous_carry_share`, `previous_route_participation`,
  `career_yards_per_carry`, `career_targets_per_route_run`, `career_catch_rate`,
  `career_receiving_yards_per_reception`.
- **TE:** `snap_share_last4`, `target_share`, `average_depth_of_target`,
  `red_zone_target_rate`, `end_zone_target_rate`, `catchable_target_rate`,
  `catch_rate`, `yards_per_target`, `yards_per_reception`, `yac_per_reception`,
  and their `career_*`/`previous_*` companions.
- **QB:** `recent_*` counting stats (games/starts excepted), `designed_rush_attempts`,
  `scrambles`, `goal_line_rush_attempts`, `adjusted_yards_per_attempt`,
  `completion_percentage_over_expected`, `explosive_pass_rate`,
  `expected_active_game_*`, `probability_active`, `prior_*`.

**Disposition summary.** Directly-sourceable (adapter pass-through):
metadata + `practice_status` + counting stats. Mechanically-derivable: team
environment rates, ratios, continuity/change flags, ramp. Statistically-projectable:
all forward-looking volume, expected games, expected active-game workload,
competition pressure. Deterministically-classifiable: roles, role-change, contract
security, boolean context flags. Defensible-proxy: `route_participation_*`,
`targets_per_route_run` (WR pass-snap proxy). Engine-owned-fallback: TE
`route_participation_*` via snap share (already inside the frozen TE engine — the
AIL supplies `snap_share_last4` and lets the engine proxy). Impossible-without-
contract-change / should-remain-unavailable-until-amended: WR/RB/TE
`career_routes` and QB `career_starts`/`recent_starts` (Sections 12, 13, 31).

---

# Section 3 — Source strategy

## 3.1 Principles

Every source obeys constitution §8 (data contract, tiers, legal gate) and §9
(market lineage — not used by the intrinsic AIL except through the classified-event
pathway, which the AIL does not implement in the MVP). The AIL consumes only
**snapshotted** provider data: an immutable capture with `snapshotId`,
`sourceTimestamp`, provider, owner, and license, so historical replay reads the
exact bytes available on/before the as-of date. No source is a runtime dependency
of a calculation; calculations read snapshots only.

## 3.2 Source catalogue

| # | Provider / family | Fields required | Refresh | Identifiers | Hist. coverage | Schema stability | License/redistribution | Snapshot strategy | Outage behaviour |
|---|---|---|---|---|---|---|---|---|---|
| S1 | nflverse weekly stats (already in repo) | counting stats, receptions, targets, carries, pass/rush box | weekly (post-game) | GSIS + nflverse id | 1999– | high (adapter guards drift) | CC-BY-4.0 (code/data) — usable | committed synthetic fixtures + real snapshot slot | stale-value + reduced recency confidence |
| S2 | nflverse snap counts (already in repo) | offensive snap counts, snap share | weekly | GSIS | 2012– | high | CC-BY-4.0 | as S1 | as S1 |
| S3 | nflverse play-by-play (pbp) — **candidate** | dropbacks, pass/run split, air yards, EPA, success, explosive, red-zone, goal-line, scrambles, sacks, CPOE where present | weekly | GSIS + game/play id | 1999– (advanced cols later) | medium (columns evolve) | CC-BY-4.0 for nflverse layer; **NGS-derived columns uncertain** | committed synthetic + real slot; per-column availability flags | column-missing → field `UNAVAILABLE`, not faked |
| S4 | nflverse rosters | team, position, status, depth ordering (where present), years-exp | daily/weekly | GSIS/nflverse | 1999– | high | CC-BY-4.0 | as S1 | metadata already handles |
| S5 | nflverse schedules | team games, opponent, dates, season phase | seasonal + weekly updates | team/game id | 1999– | high | CC-BY-4.0 | snapshot per as-of | required for expected_games; outage → schedule prior |
| S6 | Sleeper metadata (already in repo) | identity, age, draft, team, injury designation, depth-chart hints | daily | Sleeper id | current | medium | ToS permits app use; no redistribution of bulk dumps | metadata pipeline owns | already handled |
| S7 | Official injury report / practice participation — **candidate** | injury designation, practice FULL/LIMITED/DNP, game status | weekly (Wed–Fri) | team + player | current + limited history | medium | **verify at implementation** (league feed terms) | snapshot per report; provenance `DIRECT` from adapter | missing → `practice_status = UNKNOWN`, availability confidence reduced |
| S8 | nflverse depth charts — **candidate** | ordered depth chart per team/position | weekly | GSIS/nflverse | 2016– (varies) | **low/uncertain** | CC-BY-4.0 layer; completeness varies | snapshot; coverage flag | missing/incomplete → depth role from usage model, not ordering |
| S9 | Transactions / roster moves — **candidate** | signings, releases, trades, IR/PUP/suspension list | daily | team + player | current + history varies | medium | verify | snapshot; event log | missing → `role_change=UNKNOWN`, flags default per S23 |
| S10 | Contract / salary-cap datasets (e.g. OTC-style) — **candidate, Tier 2** | years remaining, guarantees, dead cap, option/tag | seasonal | team + player, name-matched | current | low (name-match risk) | **redistribution unclear — do NOT assume** | if licensed: snapshot; else NOT used | absent → reduced roster-security model (S9), no true-contract claim |

## 3.3 Legality and fallback discipline

- **Committed data policy** mirrors `PARTICIPATION_FEASIBILITY.md` §5/§6: where a
  source's redistribution terms are materially unclear (S3 NGS columns, S10
  contracts), the repository commits **synthetic fixtures with the real schema
  shape** and records `license` + attribution in the snapshot, so a
  license-cleared swap is a data change, not a code change. No calculation depends
  on a source whose legality is unresolved *without* a defined fallback path.
- **Candidate sources (S3, S7, S8, S9, S10)** are marked *implementation-time
  verification required*. The design never assumes a candidate exists: every field
  it would supply also has a lower-tier fallback in Sections 6–13 that degrades to
  `UNAVAILABLE` (not a fabricated value) if the candidate is absent.
- **No prohibited scraping.** Sources limited to nflverse (open), Sleeper
  (app-permitted), and league-published injury/transaction reports under verified
  terms. Contracts (S10) enter only if commercial rights are confirmed (§8.5);
  otherwise the reduced roster-security model (S9) is authoritative.

## 3.4 Source health

Each source snapshot carries a freshness age (as-of minus sourceTimestamp) and a
coverage ratio. Both feed field confidence (Section 15) and the operational
source-health report (Section 28). A stale source never silently produces a
current value: it produces the last snapshot's value with a recency penalty, and
past a hard staleness bound (Section 28.3) the dependent fields degrade to
`INSUFFICIENT_DATA`.

---

# Section 4 — Normalized inference feature model

## 4.1 Facts vs. features

**Facts** are `FieldState<T>` values from source adapters (present-with-provenance
or missing-with-reason). The AIL never rewrites a fact. **Features** are the
provider-neutral, as-of-clamped, aggregated quantities the inference models
consume. A feature is a pure function of facts + the as-of date + the feature
version. Every feature records its provenance chain back to the facts it used and
whether any input was a proxy.

## 4.2 Feature record contract

```ts
interface FeatureValue<T> {
  key: string;                 // canonical feature name, e.g. "recent.target_share_l4"
  value: T | null;             // null = not computable (never 0/"" as a stand-in)
  unit: string;                // "share_0_1" | "per_game" | "count" | "yards" | "rate_0_1" | "flag" | "enum" | "years" | "seasons"
  window: AggWindow;           // { kind: "last_n_games"|"season"|"career"|"prior_season"|"static", n?: number }
  asOf: string;                // ISO; every input fact.sourceTimestamp <= asOf
  featureVersion: string;      // semver of the feature definition
  provenance: "DERIVED" | "PROXY" | "MISSING";
  usedProxy: boolean;
  inputs: { factKey: string; provider: string; sourceTimestamp: string }[];
  coverage: number;            // 0..1 fraction of the intended window actually observed
}
```

Rules per feature (declared in the feature registry, Section 24):
**type; unit; valid range** (out-of-range fact ⇒ `INVALID` handling, Section 23);
**missing behaviour** (→ `value:null, provenance:"MISSING"`, never a silent
default); **aggregation window** and weighting; **as-of behaviour** (strict
`sourceTimestamp <= asOf`; no post-as-of fact may enter); **whether a proxy is
permitted** and which.

## 4.3 Feature groups

**G1 Player identity & career** — canonical_id; position; age; nfl_seasons_completed;
draft_round; draft_pick; team; career_games; career_seasons; career counting
totals (routes only via S12 proxy). Units: years/seasons/count. Windows:
static/career.

**G2 Recent usage** — snap_share_l4/l8; target_share_l4/l8; carry_share_l4;
route_participation_l4/l8 (proxy, S12); touch_share_l4; goal_line/red_zone
opportunity shares; rolling trend windows (l4 vs l8, current vs prior season).
Unit: share_0_1 / per_game. Window: last_n_games / prior_season.

**G3 Team environment** — plays_per_game; neutral-pace proxy; pass_rate;
dropbacks_per_game; points_per_drive; red_zone_trips_per_game; scoring
efficiency; sack_rate; pressure proxies. Unit: per_game / rate_0_1. Window:
season / last_n_games with offseason prior.

**G4 Competition** — same_position_teammates count; teammate draft-capital
aggregate; teammate recent-usage aggregate; recent additions/departures
(transactions); roster concentration (share held by top teammate). Unit:
count/share. Window: current roster as-of.

**G5 Availability** — injury_designation (enum); practice_status (enum);
games_missed_recent; active/inactive history; schedule_games_remaining;
recent-return flag; recurrence history. Unit: enum/count/per_game.

**G6 Contract & stability** — years_under_team_control (if S10) OR the reduced set
(draft_round, experience, years_with_team from rosters, transaction recency, age,
recent usage); option/tag status (if S10). Unit: years/enum. Every G6 feature
flags `usedProxy=true` unless it comes from confirmed contract data (S10).

## 4.4 As-of and determinism guarantees

- Feature construction takes `asOf` explicitly; it never reads `Date.now()`.
- All aggregation is over facts with `sourceTimestamp <= asOf`; games strictly
  before the as-of date's information cutoff (constitution §10.2, P25).
- Ordering is by canonical_id then feature key (stable, locale-independent).
- A feature whose coverage falls below its registered minimum returns
  `value:null` (drives `INSUFFICIENT_DATA` downstream), never an extrapolation.

---

# Section 5 — Inference output contract

## 5.1 Canonical field-level output

```ts
type InferenceStatus =
  | "AVAILABLE"          // usable value; engine input present
  | "LOW_CONFIDENCE"     // usable value present, confidence below the low band
  | "INSUFFICIENT_DATA"  // could not estimate to minimum evidence; value null
  | "UNAVAILABLE"        // no lawful/known method produced it; value null
  | "NOT_APPLICABLE";    // field not defined for this player/position/state

type InferenceProvenance =
  | "DERIVED"            // deterministic function of present facts
  | "MODEL_ESTIMATE"     // projection/regression/shrinkage estimate
  | "MODEL_CLASSIFICATION" // discrete class from a scored rule set
  | "PROXY"              // authorized substitute input (e.g. WR pass-snap routes)
  | "FALLBACK";          // lower-tier default within the field's own ladder (S14)
// DIRECT / UNAVAILABLE / NOT_APPLICABLE are represented via source facts or status,
// never as an AIL `provenance` on a present value.

interface InputEvidence {
  featureKey: string;
  provider: string;         // originating provider(s), joined & sorted
  sourceTimestamp: string;
  usedProxy: boolean;
  weight: number;           // 0..1 relative contribution (rounded, S5.3)
}

interface ExplanationFragment {
  code: string;             // stable enum, e.g. "TARGET_SHARE_RISING"
  polarity: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  template: string;         // fixed template id
  args: Record<string, string | number>;
}

interface InferredField<T> {
  field: string;            // engine input key, e.g. "target_share"
  value: T | null;
  status: InferenceStatus;
  provenance: InferenceProvenance | null;  // null iff value is null
  confidence: number;       // 0..1000 integer (S5.3); field-level (S15)
  modelId: string;          // e.g. "wr.target_share"
  modelVersion: string;     // semver
  asOf: string;             // ISO
  effectiveFor: string;     // ISO or season/week token the estimate applies to
  expiresAfter: string;     // ISO; past this the value is stale (S5.4)
  inputsUsed: InputEvidence[];
  assumptions: string[];    // stable codes
  limitations: string[];    // stable codes
  explanation: ExplanationFragment[];
}
```

## 5.2 Status semantics (binding)

- `AVAILABLE` ⇔ `value !== null` and `confidence >= LOW_BAND` (Section 15.5).
- `LOW_CONFIDENCE` ⇔ `value !== null` and `confidence < LOW_BAND`. The engine
  input is still present (readiness may pass); the public layer flags it.
- `INSUFFICIENT_DATA` ⇔ evidence below the field's minimum sample; `value=null`,
  `provenance=null`. Nullable engine fields stay present (null); non-nullable
  blocking fields make the player `NOT_READY`.
- `UNAVAILABLE` ⇔ no lawful/known deterministic method exists for this player
  (e.g. `career_routes` for a 2025 rookie with no covered participation and no
  authorized proxy). `value=null`, `provenance=null`.
- `NOT_APPLICABLE` ⇔ field undefined for the state (e.g. `recent_starts` for a QB
  with zero recent games — see S13); `value=null`, distinct from `UNAVAILABLE`.
- **Neutral-default exemption (governs for enum/bool fields):** the `value=null,
  provenance=null` rule above applies to kinds (a) nullable numeric/string and
  (b) non-nullable numeric/string only. For a **non-nullable enum or boolean field
  whose engine contract defines a neutral member** and for which the registry
  authorizes that member as the field's fallback (Registry §12, §20.F3), the field
  is instead emitted **present** with `status = LOW_CONFIDENCE`, `value = the
  authorized neutral member`, `provenance = MODEL_CLASSIFICATION`, limitation
  `NEUTRAL_DEFAULT`, and the neutral-default confidence of Registry §20.F2/F3. It is
  never `AVAILABLE` (missing knowledge is never presented as available), and it keeps
  the player evaluable (present, so readiness is not failed by an enum that has a
  defined UNKNOWN/neutral state). The Numeric Registry emission matrix (§12) is the
  single binding table.

## 5.3 Numeric precision & ordering

- **Confidence** is an integer `0..1000` (thousandths); serialized as an integer
  to avoid float drift. Public display maps to 0–100 by integer division rules
  (Section 16.4).
- **Value precision:** each field declares a fixed decimal precision in the model
  registry (Registry §1.1 precision table is binding; scores 0–100 → **integer**).
  Rounding is **round half away from zero** at serialization only (Registry §1,
  reusing `te-model/percentiles.ts roundTo`; this supersedes the earlier
  "round-half-to-even" wording); internal math is full precision. This mirrors the
  engines' own "store full precision, round at boundary" rule (`stats/derive.ts`).
- **Serial ordering:** fields serialize in a fixed registry order per position;
  `inputsUsed` sorted by `featureKey`; `assumptions`/`limitations` sorted by code;
  `explanation` in emission order defined by the explanation composer (Section 17).
  No ordering derives from object-key iteration or filesystem order.

## 5.4 Effective dates, expiration, stale treatment

- `effectiveFor` names the season/week (or ROS window) the estimate targets.
- `expiresAfter = asOf + fieldTtl(field)` from the registry (e.g. injury/practice
  = 7 days; projections = until next scheduled run; role class = 14 days;
  contract security = 180 days). A consumer reading a value after `expiresAfter`
  must treat it as stale: recompute if inputs available, else keep the value with
  a stale limitation code and a recency confidence penalty (Section 15.3).

## 5.5 Omitted vs. null

- Every field the AIL is responsible for is **always represented in the
  `InferredField` array** (never dropped from it). Whether it is then *emitted into
  the `MetricsSupplement`* as present-value, present-null, or **omitted** is governed
  solely by the Registry §12 emission matrix (a non-nullable numeric field that
  cannot be estimated is omitted from the supplement → `NOT_READY`; a nullable field
  is present-null; an authorized neutral enum/bool is present with its neutral
  member). The earlier "never omitted from the supplement" phrasing is superseded by
  Registry §12. Fields outside the position's schema appear in neither collection.
- `null` value + `INSUFFICIENT_DATA`/`UNAVAILABLE`/`NOT_APPLICABLE` are distinct
  and must round-trip; a consumer must never coerce `null` to 0 (constitution
  P23; pipeline "never invent a value").

---

# Section 6 — Projection framework

## 6.1 Universal projection form

Every forward-looking volume estimate uses the same bounded, deterministic form:

```
projected_rate      = shrink(player_rate_recent, player_prior, k)
projected_share     = clamp( blend(recent_share, career_share, role_adj), lo, hi )
projected_team_vol  = team_forecast(env_features)               // per-game
projected_player_vol_per_game = projected_share × projected_team_vol × role_adj
projected_games     = expected_games_remaining                   // Section 11
```

Where:

- `shrink(x, prior, k) = (n·x + k·prior) / (n + k)` with `n` the observed sample
  (routes, targets, carries, attempts) and `k` a position-specific prior strength
  from the registry. This mirrors the engines' own shrinkage discipline
  (constitution P7; `*-model/shrinkage.ts`).
- `blend(recent, career, role_adj)` is a fixed convex weight
  `w_recent·recent + (1−w_recent)·career`, then a bounded additive `role_adj` from
  the role class (Section 7). `w_recent` grows with recent sample coverage.
- `team_forecast` is the Section 10 environment model (points/drive, dropbacks,
  rush attempts), itself shrunk to a league prior offseason and to season-to-date
  in-season.
- All outputs are clamped to registered `[lo, hi]` bounds (per field, per
  position) to prevent false precision and runaway extrapolation.

## 6.2 Weighting, priors, regression, bounds (declared per field)

Each projected field's registry entry declares: **baseline** (recent window or
league median); **recency weighting** `w_recent(coverage)` as a step or linear
schedule; **career prior** source and `k`; **age/experience prior** additive
adjustment curve (small, monotone, bounded — constitution P16); **team-volume
forecast** dependency; **role adjustment** map (Section 7 class → additive/mult
factor); **injury adjustment** (Section 11 ramp/probability); **min/max bounds**;
**regression-to-mean** target and strength; **rookie handling**; **missing-data
fallback** (ladder, Section 14); **confidence formula** (Section 15).

## 6.3 Phase behaviour

- **Preseason** (no current-season games): baseline = prior season shrunk to
  career + age prior; team forecast = prior-season team shrunk to league;
  `w_recent`=0. Confidence capped at MEDIUM (extrapolation).
- **Early season** (1–4 games): `w_recent` ramps with coverage; heavy shrinkage.
- **Mid/late season**: `w_recent` high; team forecast season-to-date.
- **Remaining-season**: multiply per-game by `expected_games_remaining`.
- **Weekly refresh**: same formula, new snapshot; determinism preserved by as-of.

## 6.4 Position projection targets

**WR:** expected_games (S11); projected_team_dropbacks (S10); target_share
(shrunk recent share blended to career, role-adjusted); route participation
(S12, proxy or UNAVAILABLE); receiving volume via engine EFO (AIL supplies
inputs, not EFO).

**RB:** expected_games; projected_team_non_qb_rush_attempts + dropbacks (S10);
carry_share (recent/career blend, role-adjusted); snap_share_l4/l8; targets via
target_share × dropbacks; total touches = carries + receptions (engine computes
downstream).

**TE:** expected_games; projected_team_dropbacks; snap_share_l4 (drives the
engine's own route proxy); target_share; route participation via engine-owned
fallback (AIL supplies snap share, not routes).

**QB:** expected_games (S11); starts (S13); expected_active_game_pass_attempts =
shrink(recent attempts/start, league) × dropback_share adj; designed_rush /
scrambles / goal-line per start; team play volume (S10); passing environment (S10).

## 6.5 Small-sample / rookie / return handling

- **Rookie (0 NFL games):** no player rate; use draft-capital + position archetype
  prior only; `w_recent=0`; confidence capped LOW–MEDIUM; many efficiency fields
  emit `INSUFFICIENT_DATA` (present as null where nullable).
- **Second-year / small sample:** heavy shrinkage (`k` large relative to `n`);
  explicit small-sample limitation code.
- **Returning from absence:** apply Section 11 ramp; widen bounds; recency
  penalty for the gap.

---

# Section 7 — Role inference

## 7.1 Common method

Role is a `MODEL_CLASSIFICATION`: a deterministic score over objective signals →
argmax class with declared tie-breaking. No class is ever inferred from roster
ordering alone unless the depth-chart source (S8) is present, current
(`sourceTimestamp` within TTL), and coverage-complete for the team; otherwise
usage-derived signals govern (constitution: "Do not infer role solely from roster
ordering").

Each position declares: **allowed classes**; **signals** (feature keys +
thresholds); **scoring** (weighted sum → per-class score); **tie-break** (fixed
class priority order); **minimum evidence** (below which class = `uncertain`,
status `INSUFFICIENT_DATA`); **stale behaviour** (past TTL → `uncertain` + penalty);
**preseason** (draft capital + prior-year usage) vs **in-season** (current usage);
**confidence**; **explanation codes**.

## 7.2 WR role classes

`alpha_x`, `high_volume_primary`, `secondary_starter`, `slot_specialist`,
`field_stretcher`, `rotational`, `reserve_developmental`, `uncertain`.

Signals (in-season): route_participation_l4 (proxy), target_share_l4, adot
(field-stretcher vs slot), snap_share, air-yards share. Example rule anchors
(registry-tuned): `route_part ≥ 0.85 AND target_share ≥ 0.24` → `alpha_x`;
`target_share ≥ 0.20` → `high_volume_primary`; slot vs stretcher split on adot
band. Preseason: draft capital + prior-year target_share.

## 7.3 RB role classes

`lead_back`, `committee_leader`, `early_down`, `receiving_back`,
`goal_line_specialist`, `committee_member`, `reserve`, `uncertain`. Signals:
snap_share_l4, carry_share_l4, route_participation_l4, target_share,
goal_line_carry_share. Anchors: `snap ≥ 0.65 AND carry_share ≥ 0.6` →
`lead_back`; high route_participation + low carry_share → `receiving_back`; high
goal_line share + modest snaps → `goal_line_specialist`.

## 7.4 TE role classes + `prospect_type` + `depth_chart_role`

Role classes: `primary_receiving`, `every_down_starter`, `route_first_specialist`,
`blocking_heavy_starter`, `committee`, `reserve`, `uncertain`. `depth_chart_role`
∈ {TE1, TE2, TE3_OR_DEPTH, UNKNOWN} from usage (snap_share rank among team TEs)
unless S8 present. `prospect_type` ∈ {RECEIVING, BALANCED, BLOCKING_FIRST,
UNKNOWN}: for veterans, from realized route_participation vs snap_share gap
(blocking gap) + target rate; for rookies, from draft capital + college
receiving profile if a covered feature exists, else `UNKNOWN` (honest).

## 7.5 QB role classes (`role_status`, `depth_chart_status`)

`role_status` ∈ engine enum {ESTABLISHED_STARTER, YOUNG_COMMITTED_STARTER,
ROOKIE_EXPECTED_STARTER, BRIDGE_STARTER, TEMPORARY_INJURY_REPLACEMENT,
COMPETITION, RECENTLY_BENCHED, BACKUP}. Signals: recent_start_rate (S13 proxy),
career_starts (S13), age/experience, depth-chart status (S8/usage),
transaction/role-change events (S9). `depth_chart_status` ∈ {STARTER, CO_STARTER,
BACKUP, PRACTICE_SQUAD, FREE_AGENT} from usage (recent snap majority) + roster.
Anchors: recent_start_rate ≥ 0.9 AND career_starts ≥ 48 → `ESTABLISHED_STARTER`;
rookie + expected starter signals → `ROOKIE_EXPECTED_STARTER`; benched event → 
`RECENTLY_BENCHED`. Minimum evidence gate prevents fabricating a starter class for
a QB with no start signal (→ `BACKUP`/`uncertain`).

## 7.6 Role-change model (`route_role_change`/`role_change`/`recent_role_change`/`temporary_opportunity_flag`)

A `MODEL_CLASSIFICATION` over a *change* in role signals across windows:
`PROMOTED` if role-size features rose beyond a registered threshold between prior
and current windows (and/or a confirmed transaction removed a competitor, S9);
`DEMOTED` if fell; `STABLE` if within band; `UNKNOWN` if either window lacks
coverage. `temporary_opportunity_flag` (TE) / `TEMPORARY_INJURY_REPLACEMENT` (QB)
set only when the promotion is attributable to a confirmed teammate absence (S7/S9)
that is expected to reverse. No role-change is inferred from a single game
(constitution §19.3 single-game policy).

---

# Section 8 — Competition pressure

## 8.1 Model

`competition_pressure ∈ [0,1]` (higher = worse for the subject), a
`MODEL_ESTIMATE` from an internal score, plus the boolean competition flags
(`teammate_return_flag`, `incoming_competition_flag`, `another_receiving_te_flag`)
as `MODEL_CLASSIFICATION`.

Internal score (position-weighted, registry coefficients):

```
pressure_raw = Σ_teammates  g(teammate)   over same-position, same-team teammates
g(teammate)  = draft_capital_weight(round,pick)
             × recency_weight(acquisition/return)
             × usage_weight(teammate_recent_share)
             × health_availability_weight
competition_pressure = squash(pressure_raw / position_norm)      // logistic to [0,1]
```

- **Draft capital**: earlier round/pick → higher weight (bounded).
- **Recent additions** (S9 transactions within window) increase pressure;
  **departures** decrease it.
- **Injured competitors** are down-weighted by availability (Section 11), never
  removed — an injured starter still constrains ROS opportunity.
- **Rookies** as competitors weighted by draft capital only (no usage yet).
- **Practice-squad/fringe** teammates near-zero weight unless recently elevated.
- **Offseason vs regular season**: offseason uses draft capital + prior usage;
  in-season uses current usage shares.

## 8.2 Public categories

Map score to `{LOW, MODERATE, ELEVATED, HIGH}` by registered cut points for
display; the engine consumes the `[0,1]` value directly. Confidence reflects
roster-data coverage and transaction recency (Section 15).

---

# Section 9 — Contract security / roster security

## 9.1 Two clearly-separated models

- **True contract model** (only if S10 licensed): `contract_security ∈ [0,1]` from
  years remaining, guarantees, dead-cap, option/tag. Provenance `MODEL_ESTIMATE`,
  assumption code `TRUE_CONTRACT_DATA`.
- **Reduced roster-security model** (default, no paid data): `MODEL_ESTIMATE` from
  free signals only, assumption code `ROSTER_SECURITY_PROXY`, and a mandatory
  limitation code `NOT_TRUE_CONTRACT_DATA` so it is never presented as contract
  fact (constitution P18, §8.4).

## 9.2 Reduced model (default, binding)

```
security_raw = a1·draft_capital_tier            // higher pick → more secure
             + a2·experience_curve(age, seasons) // veterans on a team → stable, then decline
             + a3·years_with_team_proxy          // from rosters/transactions
             + a4·recent_usage_share             // usage → investment signal
             − a5·recent_negative_txn            // benching/trade-block/IR churn (S9)
contract_security = clamp(squash(security_raw), 0.05, 0.95)
```

QB `organizational_commitment` uses the same reduced model plus draft-capital
dominance (a franchise QB's commitment is dominated by draft investment +
recent_start_rate). Categories `{LOW, MEDIUM, HIGH}` for display; engine consumes
`[0,1]`. TTL 180 days; expires slowly (contracts change rarely). Confidence
lowered whenever the reduced proxy is used vs true contract data.

---

# Section 10 — Team and quarterback environment

## 10.1 Team offensive environment (`team_points_per_drive`, `offensive_environment_score`, `team_red_zone_trips_per_game`, `projected_team_dropbacks`, `projected_team_non_qb_rush_attempts`)

All `MODEL_ESTIMATE`/`DERIVED` from free team aggregates (S1/S3 pbp):

```
team_points_per_drive   = shrink(season_pts/drive, league_prior, k_team)
dropbacks_per_game      = shrink(season_dropbacks/g, league_prior, k_team)
non_qb_rush_att/game    = shrink(season_rush_att/g − qb_rush/g, league_prior, k_team)
red_zone_trips/game     = shrink(season_rz_trips/g, league_prior, k_team)
offensive_environment_score (0..100) = 100 · percentile(blend(pts/drive, EPA/play, success_rate))
```

Offseason: prior-season team shrunk to league, plus coaching/QB continuity
adjustment (Section 10.4). Team-change (player moved teams): use the **new**
team's environment; player-specific history stays with the player, environment
follows the team.

## 10.2 QB environment for receivers (`qb_environment_score` 0..100)

```
qb_environment_score = 100 · percentile( w1·team_pass_efficiency
                                        + w2·adjusted_yards_per_attempt_team
                                        + w3·(1 − sack_rate)
                                        + w4·starter_stability )
```

`starter_stability` from Section 13 recent_start_rate of the projected starter.
Rookie-QB team: shrink to a rookie-QB league prior (reduced, wider uncertainty).
Backup-QB (starter injured): use the expected starter's profile if identifiable,
else team prior with a `QB_UNCERTAIN` limitation.

## 10.3 Protection & RB rush-pressure

- `protection_context_score` (QB, 0..100): from team sack_rate + pressure proxies
  (S3), shrunk. `UNAVAILABLE`→null if pbp pressure columns absent (nullable field).
- `qb_rush_pressure` (RB, `[0,1]`): share of team goal-line/rush opportunity the QB
  consumes (mobile QB reduces RB goal-line value); from QB rush attempts near goal
  line / team goal-line carries. Nullable; null if uncomputable.

## 10.4 Continuity / change flags (`coaching_continuity`, `new_team_flag`, `team_change`, `major_system_change`)

`coaching_continuity` ∈ {CONTINUITY, CHANGE, UNKNOWN} from offseason coaching-move
facts (S9) or team OC/HC identity across seasons if a covered feature exists;
`UNKNOWN` if not observable. `new_team_flag`/`team_change` = player's team differs
from prior-season team (DERIVED from rosters — directly observable).
`major_system_change` = coaching change AND/OR scheme-family change flag; if only
coaching observable, set from coaching change with a limitation code.

---

# Section 11 — Availability and expected games

## 11.1 Expected games remaining (`expected_games_remaining`, all positions)

Fully automated, deterministic:

```
games_left_schedule = count(team games with kickoff > asOf, from S5 schedule)
avail_prob(state)   = registered per-state availability probability (below)
expected_games_remaining = round1( games_left_schedule × avail_prob × durability_adj )
```

- `durability_adj` from historical availability (games_missed rate), bounded
  `[0.85, 1.0]` for healthy players; recurrence history lowers it within the band.
- Result is bounded `[0, games_left_schedule]`.

## 11.2 Per-state availability probability (registered)

| State | avail_prob (this-week / ROS blend) | Notes |
|---|---|---|
| HEALTHY / active | 0.97 | normal |
| QUESTIONABLE + FULL practice | 0.85 | |
| QUESTIONABLE + LIMITED | 0.65 | |
| QUESTIONABLE + DNP/UNKNOWN | 0.45 | |
| DOUBTFUL | 0.20 | |
| OUT | 0.00 this week; ROS uses return prior | |
| IR / PUP | 0.00 near-term; bounded return prior by designation | never a fabricated return date |
| SUSPENDED | 0.00 for known suspension games; resumes after | from S9 |
| FREE_AGENT | low team-dependent prior | may be `NOT_APPLICABLE` if no team |
| PRACTICE_SQUAD | low | |
| recently activated | ramp (Section 11.3) | |

## 11.3 Workload ramp (`workload_ramp_factor` RB/TE; `probability_active` QB)

- `workload_ramp_factor ∈ [0,1]`: reuses the frozen TE engine's status/practice
  lookup semantics (the AIL supplies the value only when the field is required and
  the engine's own lookup would otherwise fire; to avoid divergence the AIL uses
  the **same** mapping table as `te-model/fallbacks.ts workloadRampLookup`,
  referenced by version, never re-derived).
- `probability_active` (QB, nullable): = `avail_prob(state)` from 11.2, clamped.
- `high_recent_workload_flag` (RB): true if recent snaps/carries per game exceed a
  registered heavy-usage threshold (durability/​regression signal).

## 11.4 Honest injury discipline

No recovery date is fabricated from free-text news (constitution §19; task
prohibition). When no reliable return date exists, ROS availability uses a bounded
probabilistic prior by designation (IR/PUP/OUT) with **reduced confidence** and a
`RETURN_TIMELINE_UNKNOWN` limitation. Suspensions with known length (S9) subtract
exactly the suspended games; rumored discipline never prices a full absence.

---

# Section 12 — Routes problem

## 12.1 Established facts (from `PARTICIPATION_FEASIBILITY.md`, WR §175, `snaps/proxyRegistry.ts`)

- Free per-player route/participation feeds **ended after 2023**; post-2023 routes
  are paid. For a live 2025+ market, participation satisfies **zero** active-player
  `career_routes` (coverage ends 2023; every active player is PARTIAL/UNAVAILABLE).
- **WR** has an authorized proxy: `proxy_routes = pass_play_snaps × 0.97`
  (WR §5.1.4 / §175, pipeline-owned) — but its input (pass-play snaps) is **not**
  in the nflverse snap-count dataset (needs pbp pass/run split), so today it is
  reported `UNAVAILABLE`, never faked.
- **TE** has an **engine-owned** route fallback: `clamp(snap_share_last4 × 0.72,
  0, 0.85)` applied *inside* the frozen TE engine when RP4/RP8 are null. The AIL
  must **not** compute TE routes; it supplies `snap_share_last4` and lets the
  engine proxy.
- **RB** inherits **neither** proxy; the WR ×0.97 rule is WR-only.
- `career_routes` is a **blocking, non-null** engine field for WR/RB/TE. A blocking
  field cannot be satisfied by a nullable proxy alone.

## 12.2 Option analysis (per the task's seven options)

| Option | WR | RB | TE | Verdict |
|---|---|---|---|---|
| 1 current-season snap-share route model | routes/window only, nullable | RB-specific proxy exists in RB spec for *participation*, not career count | engine already owns it | does not satisfy blocking `career_routes` |
| 2 pass-play participation estimate | **authorized** for WR window+career **if** pbp pass/run split available | not authorized | n/a | best WR path; needs S3 pbp |
| 3 targets+snaps regression | possible for `targets_per_route_run` proxy | possible for RP4 | n/a | fills nullable window fields, not career count |
| 4 role-class route-rate model | window only | window only | n/a | nullable only |
| 5 partial historical prior + current usage | career count still uncovered post-2023 | same | same | PARTIAL → cannot satisfy full-career field |
| 6 engine-contract amendment | redefine `career_routes` to accept an estimated/effective count | same | same | **the only path that makes career_routes satisfiable for active players** |
| 7 paid data | satisfies directly | satisfies | satisfies | out of hobby scope |

## 12.3 Recommended route strategy (binding for the MVP)

**Nullable window fields** (`route_participation_last4/last8`,
`targets_per_route_run`): the AIL supplies them as `PROXY`/`MODEL_ESTIMATE`
**only where authorized**:

- **WR**: if S3 pbp provides pass-play snaps → `route_participation = pass_play_snaps
  ÷ team_dropbacks` (per window) and `proxy career via × 0.97`; else `UNAVAILABLE`
  (present as null — nullable, non-blocking).
- **TE**: AIL supplies `snap_share_last4`; leaves `route_participation_*` as null
  so the frozen engine's own §26.5.2.2 proxy fires (do not pre-empt it).
- **RB**: `route_participation_last4` via the **RB-specific** spec proxy only if the
  RB binding contract defines one usable from free data; otherwise `UNAVAILABLE`
  (null). The WR ×0.97 rule is never applied to RB.

**Blocking `career_routes`** (WR/RB/TE): under **current contracts it stays
`UNAVAILABLE`** for post-2023 active players → those players remain `NOT_READY`.
The AIL does **not** silently substitute a snap-derived count into a blocking
career field (task prohibition; §8.4). The only way to make active WR/RB/TE
`READY` automatically is **Decision D1 (Section 31)**: amend the engine contract
to accept an **effective/estimated route exposure** field with `PROXY`/`MODEL_ESTIMATE`
provenance and a reduced-confidence tier, redefining `career_routes` as a
forward-looking exposure estimate rather than a literal charted career total.

## 12.4 If D1 is approved — estimator specs

- **WR effective career routes** = Σ over covered games of `pass_play_snaps × 0.97`
  (S3 pbp) + for post-2023 uncovered seasons, `Σ estimated_games × snap_share ×
  team_dropbacks × 0.97` (a `MODEL_ESTIMATE`, clearly tagged). Calibrate the ×0.97
  and any snap→pass-snap ratio against the 2016–2023 charted set (the §1153
  proxy-validation category). Target: proxy-vs-charted route MAPE ≤ Decision D5
  bound (Section 31). Confidence tier reduced by a registered `ROUTE_PROXY` penalty.
- **RB / TE**: define per-position snap→route factors separately (RB backs run
  routes on a minority of pass snaps; TE the engine already owns its factor). Never
  reuse the WR factor cross-position.

Until D1 is approved, `career_routes` is `impossible-without-contract-change` and
the honest MVP outcome is: WR/RB/TE with covered participation history
(≤2023 backtest) can be COMPLETE; **live active WR/RB/TE remain NOT_READY on
`career_routes`** exactly as the readiness frontier reports.

---

# Section 13 — QB starts problem

## 13.1 Facts

- `career_starts`, `recent_starts` are **blocking, non-null** QB fields.
- There is **no free official-starts feed**; presence in participation ≠ an
  official start (`PARTICIPATION_FEASIBILITY.md` §5). Populating official starts
  from snaps is explicitly prohibited unless the spec is amended.

## 13.2 Distinctions (must be preserved)

- **Official start** — the league-recorded starter (unavailable free).
- **Inferred functional start** — a game the QB played the majority of snaps /
  threw ≥ a registered attempt threshold and was the first passer (derivable from
  free weekly stats + pbp).
- **Games played** — appeared (free).
- **Majority-snap game** — ≥50% offensive snaps (free from snap counts).

## 13.3 Recommendation (binding for the MVP)

- Prefer a **direct automated official-starts source** if one is verified at
  implementation (some nflverse tables carry a starter indicator — S3/S4
  candidate). If present and coverage-complete → `DERIVED`, high confidence.
- Otherwise define a clearly-named **inferred functional start** metric:
  `functional_start(game) = (qb_snap_share ≥ 0.5) AND (pass_attempts ≥ T_start)`
  with `career_starts_est = Σ functional_start`, `recent_starts_est` over the recent
  window, `recent_start_rate = recent_starts_est ÷ recent_games`. Provenance
  `MODEL_ESTIMATE` (or `PROXY`), reduced-confidence tier, limitation code
  `INFERRED_START_NOT_OFFICIAL`.
- **`recent_starts` when `recent_games = 0`** → `NOT_APPLICABLE` (null), not a
  fabricated 0-of-0 rate.

## 13.4 Contract decision

Because starts are blocking and non-null, using inferred functional starts to make
a QB `READY` **requires Decision D2 (Section 31)**: amend the QB contract to accept
an inferred-start field with `MODEL_ESTIMATE` provenance, or add a direct
official-starts source. Until then, live QBs without an official-starts feed remain
`NOT_READY` on starts (matching the frontier). The AIL never writes snap counts
into `career_starts` under the current contract.

---

# Section 14 — Model hierarchy and fallbacks

## 14.1 Universal ladder (evaluated per field, top-down)

1. **Current direct data** (source fact, `DIRECT` — adapter, not AIL).
2. **Current derived data** (`DERIVED` — deterministic function of present facts).
3. **High-confidence model estimate** (`MODEL_ESTIMATE`/`MODEL_CLASSIFICATION`,
   evidence ≥ field's full-sample threshold).
4. **Position-specific proxy** (`PROXY`, e.g. WR pass-snap routes) — only where
   authorized for that position.
5. **Historical prior** (player career shrunk value).
6. **League / archetype prior** (`FALLBACK`).
7. **Unavailable** (`UNAVAILABLE`/`INSUFFICIENT_DATA`, value null).

## 14.2 Per-transition rules (declared per field in the registry)

Each field declares, for each rung it uses: **minimum evidence** to occupy the
rung; **confidence penalty** applied on descending to it (cumulative, Section 15);
**readiness treatment** (nullable field → present-null allowed; blocking field →
only rungs producing a typed bounded value satisfy readiness; a blocking field that
falls to rung 7 makes the player `NOT_READY`); **explanation** code emitted;
**expiration** (TTL for the rung's value).

## 14.3 Field-specific, not generic

Fallbacks are **field-specific**: there is no single neutral default across fields.
Where the frozen engines already own a fallback ladder (WR `fallbacks.ts`, TE
`resolveCanonicalValues`, RB/QB `fallbacks.ts`), the AIL **does not duplicate or
pre-empt it** — it supplies the highest-quality input it can and lets the engine's
own canonical resolution apply the engine-owned rungs (e.g. TE route proxy, career
TPRR, reference medians, status→ramp). The AIL's ladder governs only fields the AIL
is responsible for producing.

---

# Section 15 — Confidence model

## 15.1 Field-level confidence (deterministic)

Confidence is an integer `0..1000`. Start at `1000` and subtract registered,
itemized penalties; clamp to `[0,1000]`. This mirrors the engines' own
"start-100, subtract penalties" structure (`wr-model/confidence.ts`) but is a
**separate** object (constitution §17: six distinct confidence objects; AIL
confidence is a Data-Quality/State-Uncertainty composite, never the engine's
Intrinsic-Estimate Confidence).

```
conf(field) = clamp(1000
  − p_recency(age_of_inputs)          // step schedule by staleness vs TTL
  − p_sample(coverage, min_sample)    // more below-sample → larger penalty
  − p_completeness(missing_inputs)    // each missing required feature
  − p_proxy(proxy_depth)              // PROXY rung + depth
  − p_fallback(rung)                  // per rung descended (S14)
  − p_extrapolation(distance)         // preseason/future distance
  − p_role_volatility                 // recent role-change/uncertain class
  − p_injury_uncertainty              // QUESTIONABLE/return-unknown
  − p_disagreement(signal_spread)     // independent signals disagree
  − p_model_error(validated_mae_band) // from Section 19 calibration
, 0, 1000)
```

Every penalty is a registered constant or a registered step function of a measured
input — no undocumented intuition (Core Principle 4). Agreement among independent
signals *raises* effective confidence by producing zero disagreement penalty (it is
modeled as absence of `p_disagreement`, not a bonus, to keep the ceiling at 1000).

## 15.2 Player-level aggregation (not a naive mean)

A single critical low-confidence field must be able to dominate. Method (binding):

```
player_conf = min(
  weighted_geometric_mean( conf(field)^{w_field} over required fields ),
  weakest_critical = min over CRITICAL fields of conf(field)
) 
```

- `w_field` are registered position-specific importance weights (e.g. WR:
  route/target-share fields weighted highest; QB: starts/attempts/environment).
- **CRITICAL fields** per position (registered): the blocking opportunity drivers
  (WR: career_routes, target/route participation, projected_team_dropbacks,
  expected_games; RB: snap/carry share, expected_games, team rush volume; TE:
  routes/snap, target_share, expected_games; QB: starts, expected pass attempts,
  expected_games, offensive_environment). Weakest-critical caps the player score.
- Geometric mean (not arithmetic) so one very low field drags the product;
  weakest-critical enforces the hard cap. Registered `floor`/`cap` bound the result.

## 15.3 Recency / stale handling

`p_recency` is 0 while `asOf ≤ expiresAfter`, then increases stepwise; past a hard
staleness bound the field's status degrades to `INSUFFICIENT_DATA` (value retained
with a `STALE` limitation, but not counted as reliable).

## 15.4 Calibration linkage

`p_model_error` is set from the field model's validated error band (Section 19).
A model with no completed validation is capped at MEDIUM confidence and carries an
`UNVALIDATED_MODEL` limitation (constitution §23.3 Temporary Placeholder / §19.x).

## 15.5 Bands

`LOW_BAND` and `HIGH_BAND` are registered integer thresholds on the 0..1000 scale
(default `LOW_BAND=400`, `HIGH_BAND=750`, subject to Decision D6). Field status
`LOW_CONFIDENCE` below `LOW_BAND`; player honesty state (Section 20) derives from
the aggregate.

---

# Section 16 — Integration with valuation confidence

## 16.1 Architecture (outside the engine)

The frozen engines compute their own confidence (`confidence.score/label`)
unchanged. Public confidence is composed **after** the engine returns, in the AIL
reporting layer:

```
public_confidence = engine_confidence_0_1
                  × inference_coverage_factor      // share of engine inputs that were
                                                   //  DIRECT/DERIVED vs MODEL/PROXY/FALLBACK
                  × inference_quality_factor        // f(player_conf from S15.2)
                  × source_quality_factor           // f(source freshness/coverage, S3.4)
public_confidence_0_100 = round( clamp(public_confidence,0,1) × 100 )
```

## 16.2 Binding rules

- This composition affects **presentation only** — the honesty state, the
  disclosure badge, and whether a player is published/ranked. It **never mutates an
  engine value, component, composite, or EFO** (constitution P10, §17.8; task
  prohibition). Value changes from uncertainty are permitted only through the
  engines' own named mechanisms, which this layer does not touch.
- `inference_coverage_factor` and `inference_quality_factor` are bounded `[0.5,1.0]`
  and `[0.3,1.0]` respectively (registered) so estimated inputs visibly lower public
  confidence without zeroing a valid valuation.
- **Disclosure**: the report lists, per engine input, whether it was DIRECT/DERIVED
  (verified) vs MODEL_ESTIMATE/MODEL_CLASSIFICATION/PROXY/FALLBACK (estimated), so
  the UI can render exactly which inputs are estimated (constitution §17.10, §20;
  Section 20 honesty states).
- **Filtering/labelling**: players whose aggregate falls below the honesty
  `LIMITED` threshold (Section 20) are labelled and may be excluded from published
  rankings/market movement per Decision D7, but their engine value is unchanged.

---

# Section 17 — Explanation system

## 17.1 Structured, deterministic fragments

Explanations are arrays of `ExplanationFragment` (Section 5.1): a stable `code`, a
`polarity`, a fixed `template` id, and typed `args`. Free text is generated only by
rendering a fixed template with rounded args — never authored per player, never LLM
(constitution §22, §11.9). Determinism: identical inputs → byte-identical fragments
in a fixed emission order.

## 17.2 Required fragment categories (per inferred field and per player)

- **Primary supporting factors** (top-N POSITIVE by contribution weight).
- **Counter-signals** (top-M NEGATIVE).
- **Fallback usage** (each rung descended, with the rung code).
- **Missing evidence** (each required feature that was absent).
- **Confidence explanation** (the dominant penalties from Section 15).
- **Source freshness** (oldest input age vs TTL).
- **Model version** (modelId@modelVersion).

## 17.3 Language discipline

Templates use association language, never causal claims ("target share rose from
18% to 23%"; "the prior target leader was removed by a confirmed transaction";
"snap share remains above 85%") — constitution §22.2. Contribution weights are
model attributions, tagged as such; explanation confidence is separate and never a
causal assertion (§17.7).

## 17.4 Example (rendered from fragments)

> Projected target share increased because:
> - recent target share rose from 18% to 23% [`TARGET_SHARE_RISING`, +]
> - the prior target leader left the team (confirmed transaction) [`COMPETITOR_DEPARTED`, +]
> - snap share remains above 85% [`SNAP_SHARE_HIGH`, +]
> - competition pressure is moderate [`COMPETITION_MODERATE`, neutral]
> Confidence reduced by: proxy route input (−), 5-game sample (−). Inputs as of 2025-09-30 (fresh). Model wr.target_share@1.2.0.

---

# Section 18 — Versioning and model governance

## 18.1 Version identifiers (all semver)

Separate, independently-incrementable versions for: **feature definitions**
(`featureVersion`), **inference formulas/models** (`modelVersion` per modelId),
**coefficients** (registry `coefficientSetVersion`), **thresholds**
(`thresholdSetVersion`), **source mappings** (`sourceMapVersion`), **confidence
logic** (`confidenceVersion`), **explanation templates** (`explanationVersion`). A
top-level `inferenceLayerVersion` pins a coherent bundle of all of them.

## 18.2 Reproducibility key

A production output is reproducible from: `{ snapshotIds[], normalizedInputChecksum,
inferenceLayerVersion (⊃ all sub-versions), asOf, engineVersion }`. The
`normalizedInputChecksum` is a stable hash (reuse `pipeline/hash.ts`) of the sorted
normalized facts. Re-running with the same key yields byte-identical output.

## 18.3 Semver policy

- **Patch**: bug fix with no output change on the golden set.
- **Minor**: output changes within tolerance on non-golden players; goldens
  unchanged or regenerated under an approved integration task.
- **Major/breaking**: schema change, provenance/status semantics change, or a
  change that moves golden outputs. Requires approval + fixture regeneration +
  historical-bridge analysis (constitution §20.6, §25.13).

## 18.4 Recalculation, replay, migration, fixtures, approval

- **Historical replay** always uses the versions recorded with the historical
  output; a later model produces a *reconstructed* value, labelled as such
  (constitution §20.5).
- **Model migration**: a changed model gets a new `modelVersion`; old outputs stay
  attached to the version that produced them (P28).
- **Fixture regeneration** is allowed only under an explicit approved task; the AIL
  never regenerates engine goldens (task prohibition).
- **Approval**: coefficient/threshold/model changes require model-governance
  sign-off (the human-in-the-loop surface); routine weekly runs change no version.

---

# Section 19 — Validation and calibration

## 19.1 Per-model validation (no future leakage)

Every inference model is validated **walk-forward / rolling-origin** on historical
snapshots: freeze at as-of date T, predict, compare to realized outcome after T;
never use post-T data (constitution §25.4, §25.7, P25). Random row-level CV is
prohibited (leaks player/season/era).

## 19.2 Metrics by model type

- **Continuous projections** (volume, shares, environment, expected games): MAE and
  RMSE vs realized; rank correlation; calibration of prediction intervals (coverage
  by confidence band).
- **Classifications** (role, role-change, contract/roster security, competition):
  accuracy + a declared **observable outcome proxy** (below), plus calibration of
  the class probabilities.
- **Availability**: expected_games vs actual games played (MAE); active-probability
  calibration.

## 19.3 Observable outcome proxies for "subjective" classes

| Class model | Outcome proxy (future, observable) |
|---|---|
| role class | future snap/route/carry share vs class expectation |
| competition pressure | future opportunity retention (share held N weeks later) |
| contract/roster security | next-season roster retention (still on team) |
| expected games | actual games played |
| role-change (PROMOTED/DEMOTED) | signed change in role size over following weeks |

## 19.4 Promotion gate (production-ready)

A model is `production-ready` only when: walk-forward MAE/accuracy beats the naive
baseline (last value / league prior / position baseline) out of sample
(constitution §25.11); interval calibration within tolerance; stability across ≥2
season folds; no future leakage in the replay test. Until then it is capped at
MEDIUM confidence with `UNVALIDATED_MODEL` (Section 15.4). Decision D5 sets the
route-proxy error bound; D-series (Section 31) set the numeric tolerances.

---

# Section 20 — Public honesty layer

## 20.1 States

| State | Evidence requirement | Confidence range (0..1000 aggregate) | Max fallback depth | Public wording | In rankings? | Market movement published? |
|---|---|---|---|---|---|---|
| VERIFIED | all engine inputs DIRECT/DERIVED (no MODEL/PROXY/FALLBACK on any CRITICAL field) | ≥ HIGH_BAND | rung ≤2 on criticals | "Verified statistics" | yes | yes |
| ESTIMATED_HIGH_CONFIDENCE | criticals present; ≥1 MODEL_ESTIMATE but validated; agg ≥ HIGH_BAND | ≥ HIGH_BAND | ≤3 | "Includes PlayerTicker estimates (high confidence)" | yes | yes |
| ESTIMATED | criticals present; agg in [LOW_BAND, HIGH_BAND) | [400,750) | ≤5 | "Combines verified stats with PlayerTicker estimates" | yes | yes (flagged) |
| LIMITED | criticals present but agg < LOW_BAND, or heavy proxy/fallback | < LOW_BAND | ≤6 | "Limited data — low-confidence estimate" | Decision D7 | no by default |
| UNAVAILABLE | ≥1 blocking field UNAVAILABLE/INSUFFICIENT (NOT_READY) | n/a | n/a | "Not enough data to value" | no | no |

## 20.2 Global disclosure

The product must state prominently that forward-looking valuations **combine
verified statistics with automated PlayerTicker estimates**, and expose per-input
provenance on demand (Section 16.2). No estimated value is ever presented as a
verified fact.

---

# Section 21 — Readiness policy (architecture only; no code/contract change here)

## 21.1 Current state

Readiness is binary `READY`/`NOT_READY` (+`ENGINE_UNAVAILABLE`, unused for the four
positions). A field counts present if the key exists on the supplement, even if
`null` (null = engine-defined unknown). Blocking = all non-metadata supplement keys.

## 21.2 Proposed states (architecture-level recommendation)

Refine `READY` into three, keeping `NOT_READY`:

- **READY_DIRECT** — every required input present and every CRITICAL input
  DIRECT/DERIVED (honesty VERIFIED). Engine safe to call.
- **READY_ESTIMATED** — every required input present and typed-bounded; some
  CRITICAL inputs are MODEL_ESTIMATE/MODEL_CLASSIFICATION with validated models.
  Engine safe to call. Honesty ESTIMATED(_HIGH).
- **READY_LIMITED** — every required input present and typed-bounded, but heavy
  proxy/fallback or aggregate < LOW_BAND. Engine safe to call; honesty LIMITED.
- **NOT_READY** — ≥1 required blocking input UNAVAILABLE/INSUFFICIENT (value null on
  a non-nullable field). Engine **not** called.

## 21.3 Safety rule (binding)

The engine may be called for READY_DIRECT/ESTIMATED/LIMITED **iff every required
engine input has a typed, bounded value** (nullable fields may be null; non-nullable
fields must be non-null and in range). Readiness is **not** relaxed merely because
confidence is low — low confidence routes to READY_LIMITED/honesty, never to calling
an engine with a missing non-nullable input. This is an architecture recommendation;
implementing the state split is **Decision D3** (Section 31) and touches only the
readiness layer, never an engine.

---

# Section 22 — Position-specific inference contracts

Each contract lists: (1) required normalized inputs (features); (2) optional
inputs; (3) output fields (engine supplement keys); (4) formulas (by reference to
Sections 6–13); (5) classifications; (6) fallbacks; (7) confidence; (8)
explanations; (9) minimum samples; (10) edge cases; (11) invalid-input behaviour;
(12) serialization. Common items (invalid→INVALID handling, serialization order,
confidence method) are inherited from Sections 5, 14, 15, 25.

## 22.1 WR inference contract

- **Required features:** identity/career (G1); recent usage snap/target shares
  (G2); team environment dropbacks/points-per-drive (G3); availability (G5).
- **Optional:** pbp pass-play snaps (enables WR route proxy); air-yards (adot).
- **Outputs:** `target_share`, `projected_team_dropbacks`, `qb_environment_score`,
  `team_points_per_drive`, `expected_games_remaining`, `practice_status`,
  `competition_pressure`, `contract_security`, `route_role_change`,
  `route_participation_last4/last8` (PROXY/UNAVAILABLE), `targets_per_route_run`,
  efficiency `previous_*`/`career_*` companions, and `career_routes`
  (UNAVAILABLE unless D1). Formulas: S6 (projections), S7 (route_role_change),
  S8 (competition), S9 (contract), S10 (qb env), S11 (games), S12 (routes).
- **Classifications:** WR role (S7.2) drives role_adj + route_role_change.
- **Fallbacks:** S14 ladder; do not pre-empt WR engine `fallbacks.ts`.
- **Confidence:** S15; CRITICAL = {career_routes, route_participation/target_share,
  projected_team_dropbacks, expected_games_remaining}.
- **Min samples:** target_share needs ≥ registered target sample; else shrink/​null.
- **Edge/invalid:** S23; out-of-range share → INVALID → drop to prior rung.

## 22.2 RB inference contract

- **Required features:** G1; snap/carry/route shares (G2); team rush+dropback
  volume, red-zone (G3); availability + workload (G5).
- **Outputs:** `snap_share_last4/last8`, `carry_share_last4`,
  `projected_team_non_qb_rush_attempts`, `projected_team_dropbacks`,
  `team_points_per_drive`, `team_red_zone_trips_per_game`, `qb_rush_pressure`,
  `expected_games_remaining`, `workload_ramp_factor`, `competition_pressure`,
  `contract_security`, `role_change`, `teammate_return_flag`,
  `incoming_competition_flag`, `coaching_continuity`, `high_recent_workload_flag`,
  efficiency + `career_*`/`previous_*`, and `career_routes`/`career_touches`/
  `career_carries` (routes UNAVAILABLE unless D1; touches/carries DERIVED).
- **Classifications:** RB role (S7.3); role_change (S7.6). **No WR route proxy.**
- **Confidence:** CRITICAL = {snap/carry share, expected_games, team rush volume,
  career_touches}.

## 22.3 TE inference contract

- **Required features:** G1; snap_share + target share (G2); dropbacks, red-zone,
  qb env (G3); availability (G5).
- **Outputs:** `snap_share_last4`, `target_share`, `average_depth_of_target`,
  red/end-zone rates, catch/eff rates + `career_*`, `projected_team_dropbacks`,
  `team_points_per_drive`, `team_red_zone_trips_per_game`, `qb_environment_score`,
  `competition_pressure`, `contract_security`, `depth_chart_role`, `prospect_type`,
  `role_change`, `coaching_continuity`, `teammate_return_flag`,
  `another_receiving_te_flag`, `temporary_opportunity_flag`, `new_team_flag`,
  `expected_games_remaining`, `workload_ramp_factor`, `career_routes`/`career_targets`.
  **Leave `route_participation_*` null** so the engine's own §26.5.2.2 snap proxy
  fires; supply `snap_share_last4`. `career_routes` UNAVAILABLE unless D1;
  `career_targets` DERIVED.
- **Classifications:** TE role + prospect_type + depth_chart_role (S7.4).

## 22.4 QB inference contract

- **Required features:** G1; recent passing/rushing counting stats (G2); team
  offense + protection (G3); availability (G5); competition (G4).
- **Outputs:** recent counting stats (DERIVED), `designed_rush_attempts`,
  `scrambles`, `goal_line_rush_attempts`, `adjusted_yards_per_attempt`,
  `completion_percentage_over_expected`, `explosive_pass_rate`, `team_dropback_share`,
  `expected_active_game_*`, `offensive_environment_score`, `protection_context_score`,
  `depth_chart_status`, `role_status`, `competition_pressure`,
  `organizational_commitment`, `probability_active`, `expected_games_remaining`,
  `expected_games_limited`, `team_change`, `major_system_change`, `recent_role_change`,
  `prior_*`, and `career_games_played/pass_attempts/rush_attempts` (DERIVED),
  `career_starts`/`recent_starts` (S13; UNAVAILABLE/inferred per D2).
- **Classifications:** QB role_status + depth_chart_status (S7.5).
- **Confidence:** CRITICAL = {career_starts, expected_active_game_pass_attempts,
  expected_games_remaining, offensive_environment_score}.

---

# Section 23 — Edge cases

| Case | Behaviour |
|---|---|
| Rookie, no NFL stats | draft-capital + archetype priors only; efficiency fields INSUFFICIENT_DATA→null; career_routes/starts UNAVAILABLE; honesty ≤ LIMITED |
| Second-year small sample | heavy shrinkage; SMALL_SAMPLE limitation |
| Free agent (no team) | team-dependent fields NOT_APPLICABLE/UNAVAILABLE; NOT_READY on team-required inputs |
| Traded player | environment follows new team; player history stays with player; `team_change`/`new_team_flag` true; widen bounds; integration-delay limitation |
| Position change | classify under new position; prior-position usage down-weighted; flag |
| Multi-team season | aggregate player usage across stints; team environment = current team |
| Injured reserve | avail_prob 0 near-term; bounded return prior; RETURN_TIMELINE_UNKNOWN; NOT a fabricated date |
| Suspension | subtract known suspended games (S9); resume after |
| Retirement uncertainty | if no team + inactive → NOT_APPLICABLE/UNAVAILABLE; not valued |
| Practice-squad promotion | low role/competition weight until usage appears |
| Midweek transaction | as-of snapshot governs; only facts ≤ asOf enter |
| Late-season call-up | tiny sample → priors; LIMITED honesty |
| Backup QB → starter | role_status flips on confirmed start signal (S13); TEMPORARY_INJURY_REPLACEMENT if starter-injury driven |
| Committee backfield | RB role = committee_*; competition_pressure elevated |
| Coaching change | coaching_continuity=CHANGE; major_system_change per S10.4; widen uncertainty |
| Team relocation/abbrev change | canonical identity + team-id mapping absorbs it; no value change |
| Postseason data | excluded from base windows unless a registered flag includes it (default: regular season only) |
| Missing source feed | dependent fields UNAVAILABLE; never faked; source-health alarm |
| Stale snapshot | recency penalty; past hard bound → INSUFFICIENT_DATA |
| Conflicting providers | precedence rule (registered); disagreement penalty; never average silently |
| Zero denominators | `safeDiv` → null (never NaN/Infinity), matching `stats/derive.ts` |
| No remaining games | expected_games_remaining=0; ROS fields NOT_APPLICABLE where undefined |
| Duplicate players | identity resolution upstream; AIL keys on canonical_id only |
| Unsupported position | out of scope; no supplement emitted |

---

# Section 24 — TypeScript architecture

## 24.1 Module tree

```
src/inference/
  types/           inferredField.ts, status.ts, provenance.ts, evidence.ts   (pure)
  features/        registry.ts, build.ts, windows.ts, groups/{identity,usage,team,competition,availability,stability}.ts  (pure)
  registry/        modelRegistry.ts, coefficients.ts, thresholds.ts, ttl.ts, versions.ts  (pure data + lookup)
  shared/          projection.ts, shrinkage.ts, environment.ts, availability.ts, competition.ts, stability.ts, roleChange.ts  (pure)
  confidence/      field.ts, aggregate.ts, bands.ts  (pure)
  explanations/    fragments.ts, templates.ts, compose.ts  (pure)
  wr/              infer.ts, role.ts, routes.ts  (pure)
  rb/              infer.ts, role.ts  (pure)
  te/              infer.ts, role.ts  (pure)
  qb/              infer.ts, role.ts, starts.ts  (pure)
  supplement/      toSupplements.ts, sidecar.ts  (pure)   // → MetricsSupplements + InferenceSidecar
  validation/      walkForward.ts, metrics.ts, calibration.ts  (I/O at edges only)
  fixtures/        golden loader/writer (deterministic)
  reporting/       publicConfidence.ts, honesty.ts, report.ts  (pure)
  index.ts         runInference(snapshotBundle, asOf, versions) → InferenceRun   (orchestrator)
```

## 24.2 Purity and I/O separation

- Everything under `features/`, `shared/`, `wr|rb|te|qb/`, `confidence/`,
  `explanations/`, `supplement/`, `reporting/` is **pure**: no I/O, no clock, no
  randomness, no global state. Inputs in, values out.
- I/O (snapshot loading, report writing) lives only in the orchestrator and
  `validation/`/`fixtures/` edges, mirroring the existing pipeline's separation.
- **Provider separation**: models consume `InferenceFeatures`, never raw provider
  payloads. Adapters/normalization stay in `src/pipeline/**`.

## 24.3 Public APIs

- `buildFeatures(facts, asOf, featureVersion) → InferenceFeatures` (pure).
- `inferWR|RB|TE|QB(features, registry, asOf) → InferredField<...>[]` (pure).
- `toSupplements(inferred[]) → { supplements: MetricsSupplements, sidecar: InferenceSidecar }`.
- `composePublicConfidence(engineOutput, sidecar, sources) → PublicConfidence`.
- `runInference(bundle, asOf, versions) → InferenceRun` (orchestrator; the only
  non-pure top-level).
- **Model registry** and **version registry** are the single source of coefficients,
  thresholds, TTLs, bounds, CRITICAL sets, importance weights, and semver — no magic
  numbers inline (mirrors `*-model/constants.ts`). No monolithic inference function:
  each field model is a small named unit registered by `modelId`.

---

# Section 25 — Deterministic execution contract

## 25.1 Order (binding)

1. Load source snapshots (by id; immutable).
2. Enforce as-of cutoff (drop every fact with `sourceTimestamp > asOf`).
3. Normalize facts (existing pipeline).
4. Build features (pure; as-of-clamped).
5. Validate features (range/coverage; out-of-range → INVALID).
6. Execute position inference (per field model).
7. Calculate field confidence (Section 15.1).
8. Build explanations (Section 17).
9. Generate supplements + sidecar (Section 5, 24.3).
10. Assess readiness (Section 21; existing `assessReadiness` over merged supplements).
11. Call frozen engine where readiness permits (typed-bounded inputs only).
12. Calculate public confidence + honesty state (Sections 16, 20).
13. Serialize report (stable order, fixed precision).

## 25.2 Stability rules

- **Sorting**: players by canonical_id; fields by registry order; evidence by
  featureKey; assumptions/limitations by code. All comparisons are byte/`<`
  ordinal, locale-independent.
- **Precision**: per Section 5.3; round-half-to-even at serialization only.
- **No filesystem-order dependence**: registries are explicit ordered arrays;
  directory reads (fixtures) are sorted before use.
- **No clock/random/network** in steps 4–13.

---

# Section 26 — Testing contract

## 26.1 Unit tests

Feature formulas (windows, shares, as-of clamping); projection formulas (shrinkage,
blend, bounds, phase behaviour); classifications (role, role-change, contract,
competition — including tie-breaks and minimum-evidence gates); confidence
(penalties monotone; aggregate weakest-critical dominance; bands); bounds (no output
outside registered `[lo,hi]`); fallbacks (each rung, each penalty); explanations
(fragment codes, template rendering, order).

## 26.2 Position tests

Full `inferWR|RB|TE|QB` over representative feature sets; verify each output field's
value/status/provenance/confidence and that TE leaves route_participation null (engine
proxy), RB never uses WR route proxy, QB starts honesty.

## 26.3 Edge fixtures

rookie; veteran; injured; traded; role change; committee; backup→starter; missing
sources; stale sources; incomplete history — each asserts the Section 23 behaviour.

## 26.4 Determinism

Repeated run byte-identical; **shuffled input order** identical; controlled/injected
`asOf` (no wall clock); no `NaN`; no `Infinity`; stable serialized ordering (assert
on serialized bytes).

## 26.5 Historical replay

No fact with `sourceTimestamp > asOf` influences output (assert via a spy/guard);
fixtures reproduce prior outputs under their recorded versions; a model-version bump
produces a *distinguishable* output while the old version still reproduces the old.

## 26.6 Confidence calibration (property tests)

direct > proxy; fresh > stale; full sample > small sample; conflicting evidence
lowers confidence; a critical-field uncertainty lowers the **player** aggregate below
the mean of fields.

## 26.7 Engine integrity

**No engine formula/type/threshold changed**; **no golden engine output changed**
(assert the existing 982 tests still pass unchanged); the AIL supplement conforms to
the current engine input contracts (type-level: `toSupplements` returns
`Partial<MetricsSupplement>` and, when complete, satisfies the engine input by spread).
New AIL goldens live under `src/inference/fixtures/`, separate from engine goldens.

---

# Section 27 — Golden fixtures

Synthetic (never real current player values; `PARTICIPATION_FEASIBILITY.md` §5
licensing discipline). Each fixture is a self-contained JSON with: `asOf`;
normalized facts; expected features; expected inferred fields
(value/status/provenance/confidence); explanation anchor codes; readiness state;
and the serialized output bytes. Minimum set:

`established_wr1`, `emerging_wr`, `rookie_wr`, `lead_rb`, `committee_rb`,
`receiving_rb`, `elite_te`, `low_route_te`, `established_qb`, `rookie_qb`,
`backup_promoted_qb`, `injured_player`, `traded_player`, `free_agent`,
`severely_incomplete_player`.

Each fixture doubles as a determinism + replay anchor (Section 26.4/26.5). Fixtures
are regenerated only under an approved task (Section 18.4).

---

# Section 28 — Operational workflow

## 28.1 Normal automated run

Scheduled: refresh source snapshots → validate snapshots (schema/coverage) →
recompute features + inference for all players at the run's `asOf` → assess
readiness → call engines for READY_* → compose public confidence/honesty → emit
reports: **source-health**, **readiness**, **confidence-distribution**,
**material-change** (diff vs last run, driver-attributed), and a **publishing gate**
that withholds players below the honesty publish threshold. No player-by-player
manual editing.

## 28.2 Failure handling

| Event | Behaviour |
|---|---|
| One provider fails | its fields UNAVAILABLE/fallback ladder; source-health alarm; other providers proceed |
| One dataset stale | recency penalty; past hard bound → INSUFFICIENT_DATA; alarm |
| Model cannot produce a value | field UNAVAILABLE/INSUFFICIENT; player may drop to NOT_READY/LIMITED |
| Confidence below threshold | honesty LIMITED; publishing gate withholds market movement (D7) |
| Player changes teams | environment recomputed for new team next run; team_change flag |
| Injury between runs | reflected at next scheduled snapshot; no mid-run wall-clock reaction |

## 28.3 Staleness bounds

Registered per source (e.g. injury/practice hard bound 10 days; weekly stats 10
days in-season; schedule 60 days). Past the bound, dependent fields degrade rather
than present a confident stale value.

## 28.4 Exceptional incident override (not normal workflow)

A versioned, logged, reviewer-approved override file may pin a single field for a
single player during a data incident (e.g. a provider emits a corrupt value). It is
labelled `INCIDENT_OVERRIDE`, carries an owner + expiry, and is **not** part of
normal operation (Core Principle 3; constitution §23.3 Temporary Placeholder).

---

# Section 29 — Cost and practicality (hobby-stage)

| Component | Rel. complexity | Maintenance | MVP? |
|---|---|---|---|
| Source ingestion (reuse existing adapters + add schedule/pbp) | medium | source-drift hotspot | MVP-critical (schedule); pbp for routes |
| Feature generation | medium | moderate | MVP-critical |
| Projections (games, team volume, shares) | medium | coefficient tuning | MVP-critical |
| Role models | low–medium | threshold drift | MVP-critical (drives many flags) |
| Environment models | low | low | MVP-critical (many fields, high leverage) |
| Route estimation | high | proxy calibration + legal (pbp) | defer past MVP unless D1 approved |
| QB starts | medium | source verification | defer unless D2 approved |
| Confidence + honesty | low–medium | band tuning | MVP-critical |
| Reporting | low | low | useful, not blocking |

**MVP-critical:** environment, expected games, role/flags, projections, confidence.
**Can wait:** route estimation, QB starts (both need a contract decision anyway),
contract-true data. **Hotspots:** source schema drift; proxy calibration; threshold
tuning. **Overengineering risk:** modeling paid-data fields, joint distributions,
or per-player tuning before the free-derivable fields are shipped. Prefer a system
one developer runs with a versioned registry.

---

# Section 30 — Implementation phases (prioritized by players moved to evaluable, not field count)

- **Phase A — Core framework.** types, registries, versioning, provenance,
  confidence, explanations, deterministic orchestrator. *Deliverable:* pure
  scaffolding + tests. *Verify:* determinism/replay tests green; 982 engine tests
  untouched. *Readiness impact:* 0 (enables everything).
- **Phase B — Automatically inferable facts.** expected_games, team volume,
  environment (points/drive, dropbacks, red-zone, qb/off environment, protection),
  continuity/change flags, practice_status pass-through, direct role/depth signals.
  *Readiness impact:* fills every DERIVABLE_FREE/DIRECT_FREE projection+context
  field — removes the projections/context wall but **not** routes/starts.
- **Phase C — Position projections.** WR/RB/TE/QB shares, efficiency, expected
  active-game workload, competition_pressure, roster-security. *Readiness impact:*
  completes all free-derivable supplement fields; players are now blocked **only**
  by career_routes / QB starts.
- **Phase D — Difficult blockers (gated on decisions).** routes (D1 + pbp),
  QB starts (D2 + source), contract-true (S10 license). *Readiness impact:* the
  decisive one — **unlocks live active WR/RB/TE/QB** to READY_ESTIMATED. This is
  where 100–150 curated relevant players become evaluable.
- **Phase E — Integration + public confidence.** supplements/sidecar wiring,
  readiness-state split (D3), public confidence/honesty, reports, UI disclosure.
  *Readiness impact:* turns evaluable players into publishable, honestly-labelled
  values.

Dependencies: A→B→C→(D,E). D is the gating milestone for live readiness and depends
on Section 31 decisions, not on more engineering alone.

---

# Section 31 — Required specification decisions

Each decision names the current contract, options, recommendation, impact, risk, and
the exact document/section to amend. **These are not silently resolved.**

**D1 — May a MODEL_ESTIMATE/PROXY satisfy the blocking `career_routes`?**
*Current:* WR/RB/TE `career_routes` is a literal career total, non-null, blocking;
post-2023 routes are paid (WR §175). *Options:* (a) keep literal → live active
WR/RB/TE stay NOT_READY; (b) redefine `career_routes` as an **effective route
exposure** estimate accepting PROXY/MODEL_ESTIMATE with reduced confidence;
(c) paid data. *Recommend:* (b) with per-position factors and a calibrated proxy.
*Impact:* unlocks live WR/RB/TE. *Risk:* estimate error on a high-leverage field;
mitigated by confidence tier + validation (D5). *Amend:* WR §5.1.4/§175, RB §5.3.1,
TE §26.5.2.x input definitions; `readiness/metrics.ts` stage note.

**D2 — May inferred functional starts satisfy blocking QB `career_starts`/`recent_starts`?**
*Current:* official starts, non-null, blocking; no free feed; snaps≠starts.
*Options:* (a) keep official → live QBs stay NOT_READY; (b) add a verified direct
official-starts source; (c) accept an inferred functional-start MODEL_ESTIMATE with
reduced confidence. *Recommend:* (b) if a source verifies, else (c). *Impact:*
unlocks live QBs. *Risk:* inferred≠official mislabel; mitigated by naming + limitation
code. *Amend:* QB §26.3 input definition; classifier note.

**D3 — Should readiness support READY_ESTIMATED / READY_LIMITED states?**
*Current:* binary READY/NOT_READY. *Options:* keep binary vs adopt the 4-state split
(Section 21). *Recommend:* adopt. *Impact:* honest public gating without engine
change. *Risk:* minimal (readiness layer only). *Amend:* `readiness/engineReadiness.ts`
status enum + tests (no engine change).

**D4 — Is public confidence separate from engine confidence?** *Current:* engines own
confidence; no public composite. *Recommend:* yes — compose outside the engine
(Section 16), never mutating engine values. *Amend:* none to engines; new AIL
reporting module + a market-foundation note that public confidence is a §17 composite.

**D5 — Acceptable route/proxy and projection error bounds.** *Current:* undefined.
*Recommend:* set route-proxy MAPE ≤ a governed bound (calibrated on 2016–2023
charted set) and projection MAE ≤ naive-baseline out of sample as the promotion gate
(Section 19.4). *Amend:* this spec's registry + a validation appendix.

**D6 — Confidence band cut points (LOW_BAND/HIGH_BAND) and honesty thresholds.**
*Recommend:* start 400/750 on 0..1000; tune via calibration. *Amend:* registry.

**D7 — Do LIMITED-honesty players appear in rankings / publish market movement?**
*Recommend:* include in rankings with a flag; withhold market movement by default.
*Amend:* reporting/publishing-gate policy.

**D8 — Should any "career fact" fields be redefined as forward-looking exposure?**
Tied to D1/D2. *Recommend:* redefine `career_routes` (D1) and QB starts (D2) as
estimable exposure/functional metrics with explicit provenance; leave literal
career counting stats (targets/carries/attempts/games) as DERIVED facts. *Amend:*
per-engine input definitions as in D1/D2.

---

# Section 32 — Practical MVP contract (binding)

**This section governs implementation where any earlier section is ambiguous.**
Two independent developers implementing only this section against the same
normalized snapshots and `asOf` must produce materially equivalent inferred fields,
confidence, provenance, explanations, readiness states, and serialized output.

## 32.1 Module responsibilities

`src/inference/` per Section 24. Pure models; I/O only in the orchestrator and
validation/fixtures edges. Single model registry holds all coefficients, thresholds,
TTLs, bounds, CRITICAL sets, importance weights, semver. No inline magic numbers.

## 32.2 Required inputs

Snapshot bundle (nflverse weekly, snaps, rosters, schedules; Sleeper metadata;
optional pbp, injury, transactions per Section 3) + `asOf` (ISO) + a version bundle.
Only facts with `sourceTimestamp <= asOf` may enter. No wall clock, network, or
randomness inside computation.

## 32.3 Outputs

Per player per position: an array of `InferredField<T>` (Section 5.1) for every
non-metadata engine supplement key; a `MetricsSupplements` bundle
(`Partial<MetricsSupplement>` keyed by canonical_id) built by spread from the
AVAILABLE/LOW_CONFIDENCE fields; and an `InferenceSidecar` recording provenance,
confidence, coverage, and honesty inputs. Nullable engine fields that cannot be
estimated are present with `null`; non-nullable blocking fields that cannot be
estimated are **omitted from the supplement** (→ NOT_READY).

## 32.4 Model registry

Every field maps to exactly one `modelId` with: formula reference (Sections 6–13);
rung ladder + penalties (Section 14); confidence penalties (Section 15.1); bounds;
precision; TTL; CRITICAL flag; importance weight; `modelVersion`.

## 32.5 Execution order

Exactly Section 25.1 steps 1–13. Stable sort + fixed precision per Section 25.2.

## 32.6 Inference status values

`AVAILABLE | LOW_CONFIDENCE | INSUFFICIENT_DATA | UNAVAILABLE | NOT_APPLICABLE`
(Section 5.2 semantics, binding).

## 32.7 Provenance values

AIL emits only `DERIVED | MODEL_ESTIMATE | MODEL_CLASSIFICATION | PROXY | FALLBACK`;
`DIRECT` is source-adapter-only; null value ⇒ null provenance. An estimate is never
labelled DIRECT.

## 32.8 Confidence method

Field: integer 0..1000, start 1000, subtract registered penalties (Section 15.1),
clamp. Player: `min(weighted_geometric_mean(field confidences), weakest_critical)`
then clamp to registered floor/cap (Section 15.2). Bands LOW_BAND/HIGH_BAND
(default 400/750, D6).

## 32.9 Readiness treatment

Emit per-player readiness via the existing `assessReadiness` over the merged
supplement; recommended state split (READY_DIRECT/ESTIMATED/LIMITED/NOT_READY) gated
on D3. Engine called iff every required input is typed-and-bounded (nullable may be
null). Low confidence never relaxes readiness.

## 32.10 Serialization

Deterministic JSON: players by canonical_id; fields by registry order; evidence by
featureKey; assumptions/limitations by code; explanation in composer order; precision
per Section 5.3; round-half-to-even at boundary. Byte-stable across runs and input
shuffles.

## 32.11 Errors

Invalid fact (out of range) → treated as missing at that rung (`INVALID` reason),
descend the ladder; never throw into a value. Missing snapshot → orchestrator error
(fail the run, do not fabricate). No `NaN`/`Infinity` may ever serialize (`safeDiv`).

## 32.12 Fallbacks

Field-specific ladders (Section 14). The AIL never duplicates or pre-empts an
engine-owned fallback (TE route proxy, engine canonical resolution). No single
generic default across fields.

## 32.13 Model versioning

Semver per Section 18; reproducibility key
`{snapshotIds, normalizedInputChecksum, inferenceLayerVersion, asOf, engineVersion}`.
Historical outputs stay attached to their versions; later recomputation is
"reconstructed".

## 32.14 Tests

Section 26 in full: unit, position, edge fixtures, determinism, historical replay,
confidence calibration, engine integrity (982 engine tests unchanged; no golden
engine output changed).

## 32.15 Fixtures

Section 27 synthetic golden set (15 fixtures), each an anchor for value/status/
provenance/confidence/explanation/readiness/serialized bytes.

## 32.16 Prohibited behaviour

No engine edit; no golden engine regeneration; no runtime LLM/network/clock/random;
no labelling estimates as DIRECT; no silent zero for missing; no WR route proxy on
RB/TE/QB; no snap-count into `career_starts`; no player-by-player manual entry in
normal operation; no source assumed to exist without a defined fallback; no future
fact in historical replay; no arbitrary neutral default to resolve ambiguity.

---

# Section 33 — Mandatory analysis questions + specification self-audit

## 33.1 Answers

1. **Can all four positions be evaluated automatically without routine manual entry?**
   For the *free-derivable* inputs, yes (Phases B–C). For full readiness of **live
   active** players, **not under current contracts** — `career_routes` (WR/RB/TE) and
   QB `career_starts`/`recent_starts` are blocking and have no free source. With the
   targeted amendments D1/D2 they become automatable with honest provenance; no
   player-by-player manual entry is required in either case.
2. **Which current engine fields prevent that?** WR/RB/TE `career_routes`; QB
   `career_starts`, `recent_starts`. (Everything else is free-derivable or a
   nullable proxy.)
3. **Which blockers can be solved through deterministic inference?** All
   projection/context/role/environment/availability fields (Sections 6–11), and the
   nullable route windows (WR proxy where pbp exists; TE via engine fallback). These
   need no contract change.
4. **Which blockers require a specification amendment?** `career_routes` (D1) and QB
   starts (D2). Optionally the readiness-state split (D3) and public-confidence
   composition (D4) — additive, not engine-mutating.
5. **Can career routes be estimated responsibly enough for public use?** Yes, as an
   explicitly-labelled **effective route exposure** estimate (PROXY/MODEL_ESTIMATE,
   reduced confidence, calibrated on the 2016–2023 charted set), **only** if D1
   redefines the field. It must never be presented as a charted career total.
6. **Can QB starts be sourced or inferred automatically?** Prefer a verified direct
   official-starts source (D2b). Otherwise an inferred **functional-start** metric
   (majority snaps + attempt threshold), clearly named and reduced-confidence (D2c).
   Never snaps written into official starts.
7. **Which inference fields are most likely to create model error?** career_routes
   proxy; QB inferred starts; competition_pressure; contract/roster security;
   preseason projections and rookie priors; return-from-injury availability. All
   carry the largest confidence penalties and validation gates.
8. **How will users know which inputs are estimated?** Per-input provenance in the
   sidecar (Section 16.2), honesty states (Section 20), a global disclosure that
   values combine verified stats with PlayerTicker estimates, and confidence bands.
9. **How does uncertainty affect confidence without corrupting engine values?**
   Public confidence = engine_confidence × coverage × quality × source factors,
   composed **outside** the frozen engine (Section 16). Engine values/components/EFO
   are never mutated (P10, §17.8).
10. **Can the system replay a historical valuation without future leakage?** Yes —
    as-of cutoff drops post-asOf facts; features/models are pure and version-pinned;
    reproducibility key + snapshot ids reproduce outputs byte-for-byte; a replay
    guard test asserts no post-asOf fact influences output.
11. **Smallest implementation making 100–150 relevant active players evaluable?**
    Phases A→B→C (all free-derivable fields) **plus** the D1/D2 amendments with their
    proxies (Phase D-min): schedule + pbp ingestion, environment + expected-games +
    projections + role/competition/roster-security models, the WR/RB/TE effective-
    route-exposure estimator and QB functional-start metric, confidence + honesty +
    readiness-state split. That set moves a curated top-100–150 to READY_ESTIMATED
    with honest confidence — without manual entry.
12. **What would make the design unsuitable for implementation?** If D1/D2 are
    rejected *and* paid data is off the table (then no live active player is ever
    READY — the design degrades to the honest NOT_READY frontier); if the pbp
    pass/run split or a starts source proves unavailable *and* the proxies fail
    calibration (D5); or if a required source's legality cannot be cleared and has no
    fallback. None of these are engineering failures — they are data/contract limits
    the spec surfaces rather than hides.

## 33.2 Self-audit (independent-implementation test)

*If two competent developers implement Section 32 on the same snapshots + asOf, do
they converge?* Residual divergence sources and their resolution:

- **Coefficients/thresholds/bounds/TTLs/bands** → all in the single model registry
  with versioned values; specified, not free.
- **Confidence math** → exact formula + weakest-critical aggregation + integer scale;
  specified.
- **Rounding/ordering/precision** → Section 5.3 + 25.2; specified.
- **Fallback ladders** → per-field in the registry; engine-owned rungs deferred to
  the engine; specified.
- **Route/start values** → gated on D1/D2; until decided, `UNAVAILABLE` — a *specified*
  outcome, not a divergence.
- **Exact coefficient numeric values, band cut points, error tolerances** → **product
  decisions D5/D6** (and calibration), explicitly deferred; excluded from MVP
  convergence claims until set. Two developers converge on *structure, provenance,
  status, readiness, and serialized shape*; the numeric calibration is a governed
  registry input, not an implementation choice.

Every remaining divergence is therefore (a) specified, (b) a named product decision
(Section 31), or (c) explicitly excluded from the MVP. The contract passes its own
test under that scoping.

---

*End of AUTOMATED_INFERENCE_LAYER_SPEC_V1.*
