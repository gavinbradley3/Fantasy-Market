# PlayerTicker Participation Stage (nflverse, coverage-aware WR route proxy)

The participation stage ingests NFL play participation (`offense_players`),
counts each player's presence on qualifying **dropbacks**, and — for **WR only**
— derives the spec-authorized route proxy `routes = qualifying pass-play
participations × 0.97`. It is **coverage-aware**: a proxy value can satisfy the
blocking `career_routes` field **only when the player's entire career falls
inside the source's coverage**. Partial coverage is reported, never numerically
hidden.

**Read the feasibility audit first:** [`PARTICIPATION_FEASIBILITY.md`](./PARTICIPATION_FEASIBILITY.md).
The verdict is **PASS — LIMITED IMPLEMENTATION**: the source (per binding WR spec
§175) ended after **2023**, so for the live 2025 market this stage removes **zero**
blockers; it satisfies `career_routes` only for the historical career-⊆-coverage
category (the §1153 proxy-validation use).

## Architecture

```
nflverse pbp participation (synthetic fixture — real data withheld, licensing uncertain)
   ▼ stats-snapshot layer (reused)  dataset=pbp_participation, seasons, checksum
   ▼ adapter        parse plays, ";"-split GSIS, dedup-in-play, incomplete-personnel flag
   ▼ qualification  centralized dropback registry (pass|sack|scramble; excl. kneel/spike/2pt/no_play/run)
   ▼ counting       per-player pass-play participations + team dropback denominators (same rule)
   ▼ coverage       COMPLETE / PARTIAL / UNAVAILABLE / NOT_APPLICABLE
   ▼ supplement     WR career_routes = participations × 0.97 — ONLY if COMPLETE
   ▼ readiness merge (metadata + stats + snaps + participation)
```

## Play qualification (single source of truth)

A **qualifying dropback** = pass attempt (complete/incomplete/INT) **or** sack
**or** QB scramble. Explicitly excluded — not routes: designed runs, spikes,
kneel-downs, two-point attempts, and nullified `no_play`s. Team dropbacks and
player participation use the **same** rule so numerator and denominator never
diverge. A loose `play_type === "pass"` is never used alone.

## Coverage semantics (the guard)

`career_routes` means literal career-to-date. Coverage state per player:

| State | Condition |
|---|---|
| `COMPLETE` | career start ≥ first covered season **and** as-of ≤ last covered season **and** ≥1 covered game |
| `PARTIAL` | some covered games, but career began before coverage or as-of is beyond coverage (or career start unknown) |
| `UNAVAILABLE` | no covered participation for the player |
| `NOT_APPLICABLE` | position is not WR (proxy unauthorized) |

Only a `COMPLETE` + authorized proxy value is written to the supplement and can
satisfy readiness. `PARTIAL`/`UNAVAILABLE` write nothing.

## Authorization (no cross-position leakage)

- **WR:** `proxy_routes = qualifying_pass_play_participations × 0.97` — authorized
  (WR spec §175), applied to the **final aggregate**, full internal precision (the
  spec does not mandate rounding), provenance `PROXY`. Reuses the WR-only
  `computeWrProxyRoutes` from the snap stage's registry.
- **RB / TE:** the WR ×0.97 rule is **not** applied. TE's route proxy is
  engine-owned (§26.5.2.2); RB's is RB-specific. → `NOT_APPLICABLE`.
- **QB:** participation presence is **not** an official start. `career_starts` /
  `recent_starts` are **never** populated. → `NOT_APPLICABLE`.

## Licensing

The underlying participation data originates from NFL Next Gen Stats; its
redistribution terms are **materially unclear** (feed discontinued after 2023;
NGS provenance). *This is not a legal conclusion — the uncertainty is flagged.*
Per the audit, **real provider files are not committed**; the stage ships
**synthetic fixtures** with the real schema shape. Snapshots record provider,
owner, and a `pbp_participation` dataset id so a future license-cleared swap is a
data change, not a code change.

## Running

```bash
npm run pipeline:participation                                   # metadata+stats+snaps+participation
npm run pipeline -- --mode fixture --stats --snaps --participation --season 2025
npm run pipeline -- --mode fixture --stats --snaps --participation --season 2023  # as-of a covered season
```

The report's **Participation stage** section shows plays accepted/rejected,
incomplete-personnel, joins, **complete vs partial route values**, blocking fields
satisfied, readiness before → after, newly ready, and remaining gaps by stage.

## Measured fixture outcome (honest)

- **Live 2025** (`pipeline:participation`): every active player is `PARTIAL`
  (coverage ends 2023) → **0 complete route values, 0 blockers satisfied, 0 newly
  ready**. This is the honest result, matching WR §175.
- **As-of 2023** (test): a WR whose career ⊆ 2016–2023 gets a `COMPLETE` proxy
  `career_routes` that removes the blocker — demonstrating the machinery and the
  §1153 proxy-validation capability.

## Limitations / recommended next milestone

Because the free participation feed ended in 2023, this stage cannot move any
**active** player toward readiness. The remaining blockers are unchanged (stats
59, projections 24, context 48). Do **not** default to another historical
sub-stage. Weigh, from the measured counts: a **projections stage** and a
**context/depth-chart stage** (which own the 24 + 48 remaining live gaps and can
actually change live readiness), an **engine-spec revision** (e.g., accept a
snap-proxy route input for current seasons), a **paid route-data provider** (the
only path to real post-2023 routes), or a **limited MVP** using authored
supplements for a curated player set. The measured evidence points to a
**projections or context stage** as the next milestone, since participation and
snap history cannot unblock live players.
