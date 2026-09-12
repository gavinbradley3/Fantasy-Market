# Future data map — where premium data could help, and where it isn't needed

A map, not a plan. It records which canonical model inputs are currently live, derived, or
falling back, and which of those a better source could plausibly improve. **Nothing here is
being solved in this pass, and nothing here is a dependency.**

## The rule this map serves

PlayerTicker's valuation engines consume **canonical, provider-neutral field names**. The
provider is a *separate axis*, carried on `PresentField.provider: ProviderId`. So onboarding a
licensed source later means adding one member to `ProviderId` plus a normalizer that maps its
columns onto the names below — **not** touching a single engine interface.

This is asserted, not merely intended: `src/inference/providerNeutrality.test.ts` fails if a
vendor name ever appears in an engine's contract or in the inference layer.

```
Bad, and tested against:     pff_grade, pff_yprr, pff_pressure_grade
Good, and what exists today: passing_quality, protection_context_score,
                             competition_pressure, route_efficiency
```

## Current state, by canonical field

Grounded in the live board on this branch: every published player carries `NEUTRAL_DEFAULT`,
`NOT_TRUE_CONTRACT_DATA` and `UNVALIDATED_MODEL`; 357 of 616 carry `ROUTE_PROXY`.

| Canonical field | Current source | State | nflverse could plausibly derive it? | Premium would improve it? |
|---|---|---|---|---|
| `adjusted_yards_per_attempt` | nflverse weekly player stats | **live / derived** | Already is | Marginally — it is a formula over box-score inputs |
| `offensive_environment_score` | `env.team_offense` over nflverse team aggregates | **derived** | Already is | Yes — drive-level and situational context would sharpen it |
| `protection_context_score` | `env.protection`, derived from team sack rate | **derived, coarse** | Partly. Sack rate is a *team outcome*, not a line-quality measure | **Yes, materially.** Pressure rate allowed, time-to-throw and blown-block rate are the real signal and no free feed publishes them per player |
| `competition_pressure` | `role.competition` — QB from role status, others from teammate set | **model estimate** | Partly — depth charts would help | Yes — snap-share projections and beat-reported roles |
| `completion_percentage_over_expected` | none | **unsupported** (`MODEL_REASON`: "an expected/model metric with no free provider — out of scope") | **Plausibly yes.** nflverse's play-by-play export carries a `cpoe` column; this repo's ingestion does not read it today, and that has not been verified against the current release in this pass | Yes, but nflverse may make premium unnecessary |
| `explosive_pass_rate` | none | **unsupported** (`PBP_REASON` — needs play-by-play) | Yes — it is a straightforward pbp aggregation | No, if pbp is ingested |
| `designed_rush_attempts`, `scrambles`, `goal_line_rush_attempts` | none | **unsupported** (`PBP_REASON`) | Yes — all three are pbp aggregations | No |
| `contract_security` | `stability.roster_security`, a model estimate | **model estimate**, flagged `NOT_TRUE_CONTRACT_DATA` on every player | No — nflverse publishes no contract data | Yes, but from a *contract* source (OverTheCap/Spotrac), not a grading vendor |
| `career_routes` (WR) | estimated from `pbp_participation` | **derived / proxy** (`ROUTE_PROXY`) | Already is, for WR | Yes — true route counts remove the proxy |
| `career_routes` (RB/TE) | none | **unsupported** | Yes — the participation data exists for 2024/25 at the same ~43% coverage WR uses; what is missing is an **approved RB/TE method** for converting per-play participation into a career route total. A modelling gap, not a data gap | Yes |
| `expected_fantasy_points_per_target`, `catch_rate_over_expected` | none | **unsupported** (`MODEL_REASON`) | Uncertain | Yes |

## What this says about PFF

PFF would plausibly improve **three** things: `protection_context_score` (the clearest case —
no free feed publishes per-player pressure allowed or blown-block rate), true route counts, and
`competition_pressure`.

It would **not** unlock `completion_percentage_over_expected`, `explosive_pass_rate`, or the
designed-rush splits — those are ordinary play-by-play aggregations that nflverse can most
likely supply, and reaching for a paid vendor for them would be buying something already free.

It has nothing to say about `contract_security`, which needs contract data, not grades.

### Terms, stated rather than assumed

PFF's consumer/public terms may not permit commercial or public use, or model integration,
without a separate commercial licence. Nothing in this repository assumes PFF access exists, no
PFF-shaped field is defined, no PFF data is fabricated, and no PFF endpoint is scraped.

**PlayerTicker functions fully without PFF and must continue to.** The seam described at the
top is what keeps that true: it costs nothing to leave open and commits to nothing.

## Ordering, if this is ever picked up

Judged on evidence gained per unit of work, not on what sounds most advanced:

1. **Ingest nflverse play-by-play.** One new capability plausibly closes `explosive_pass_rate`,
   the three designed-rush splits, and possibly CPOE — free, and already an approved provider.
2. **Settle the RB/TE route methodology.** The data is in hand; the blocker is a method, and it
   is what keeps 357 players on `ROUTE_PROXY`.
3. **Only then** ask whether a premium provider is worth a licence, with the answer narrowed to
   protection context and true routes rather than "better data" in general.
