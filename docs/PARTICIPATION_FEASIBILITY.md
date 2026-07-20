# Participation-Data Feasibility Audit

**Question:** can nflverse participation data (`offense_players` / NGS play
participation) legitimately supply PlayerTicker's unresolved route and start
fields for WR, RB, TE, and QB?

**Verdict: PASS — LIMITED IMPLEMENTATION.** Participation data can satisfy WR
`career_routes` (a blocking field) via the authorized `× 0.97` route proxy — **but
only for players whose entire career falls within the source's 2016–2023 coverage,
evaluated as of ≤ 2023**. For the live 2025 market it removes **zero** blockers,
because the source ended after 2023 (binding WR spec §175). The limited stage is
built coverage-aware so partial coverage can never masquerade as a full career,
and it directly serves the spec's own §1153 proxy-validation requirement.

---

## 1. Repository audit

- Branch `claude/playerticker-participation-feasibility` (from
  `claude/playerticker-nflverse-snap-pipeline` @ `f4fd6f3`); tree clean.
- **No participation-ingestion code exists** (only engine files reference
  `career_routes` / `route_participation`).
- Unresolved route/start fields and their horizons (from the binding contracts):

| Position | Field | Nullable? | Blocking? | Exact horizon (spec) |
|---|---|---|---|---|
| WR | `career_routes` | no | **yes** | literal career-to-date total (WR §: veterans "≥1,500 career routes", rookies "<50") |
| WR | `route_participation_last4/last8` | yes | no | routes ÷ team dropbacks, last 4/8 **current** games (WR §5.1.4) |
| WR | `targets_per_route_run` | yes | no | targets ÷ routes, current window (WR §5.1.6) |
| RB | `career_routes` | no | **yes** | career-to-date (RB §5.3.1) |
| RB | `route_participation_last4` | yes | no | routes ÷ team dropbacks (RB §5.3.1; RB-specific proxy) |
| TE | `career_routes`, `career_targets` | no | **yes** | career-to-date (TE §) |
| TE | `route_participation_last4/last8` | yes | no | **engine-owned** snap proxy (TE §26.5.2.2) |
| QB | `career_starts`, `recent_starts` | no | **yes** | official games started |

Blocking (non-null) fields are the only ones whose satisfaction changes readiness;
the nullable route windows are already handled (engine fallbacks / null = unknown).

## 2. Source audit

Network egress to nflverse is blocked in this environment (proxy 403), so live
release inspection is not possible here. The **binding repository spec is
authoritative** and is unusually specific:

- **WR §175 (verbatim):** "Free per-player route feeds (NFL participation data via
  nflverse) **ended during 2023**. Post-2023 route counts require a paid source."
- **WR §1153:** "Proxy validation: proxy routes vs. charted routes, **2016–2023**."

| Season | Participation file | Schema | Completeness | Release timing | IDs | License |
|---|---|---|---|---|---|---|
| 2016–2023 | available (NGS-sourced, nflverse mirror) | `offense_players` (GSIS, `;`-list), `possession_team`, `play_id`, play-type fields | regular season; occasional incomplete personnel on some plays | post-season release | **GSIS** (usable) | **uncertain** (see §5) |
| 2024–2025 | **does not exist** (feed ended 2023) | — | — | — | — | — |

- Identifiers: `offense_players` are GSIS ids — the strong key the pipeline joins
  on. Usable for covered seasons.
- Coverage caveats: not every play carries complete personnel; some games are
  missing; schema drifted slightly across seasons — all handled defensively.

## 3. Data-semantic audit — participation ≠ routes

`offense_players` lists who was **on the field**, not who **ran a route**. The two
diverge on exactly the plays the qualification registry must handle:

| Event | On field (participation) | Ran a route? |
|---|---|---|
| pass completion / incompletion / INT | yes | yes (WRs, mostly) |
| sack | yes | ambiguous (protection collapsed) — counts as a dropback |
| scramble | yes | routes were run before the scramble — dropback |
| designed run | yes | **no** (not a dropback) |
| spike / kneel-down | yes | **no** — excluded |
| penalty no-play / nullified | yes | **no** — excluded |
| two-point attempt | yes | spec-dependent — excluded from the base window |

The WR proxy is therefore defined on **qualifying pass-play (dropback)
participation**, not raw `n_offense`. The proxy `× 0.97` accounts for the small
share of dropbacks where a WR pass-blocks instead of running a route (WR §175).

| Metric | Source provides |
|---|---|
| pass-play participation (WR) | **authorized proxy input** (dropback participation) |
| team dropbacks | direct (count qualifying plays per possession team) |
| routes run (exact) | **insufficient** (charted-only; paid) |
| targets | not from participation (weekly stats) |
| QB official starts | **insufficient** — presence ≠ official start |

## 4. Exact-horizon audit (the decisive test)

`career_routes` means **literal career-to-date total**. Compare required horizon
to 2016–2023 coverage, at the pipeline's current season (2025):

| Player category | career_routes coverage | Proxy satisfies career_routes? |
|---|---|---|
| Active 2025 veteran (career began pre-2016) | pre-2016 **and** 2024–2025 missing | **No — PARTIAL** |
| Active 2025 player who entered 2016–2023 | 2024–2025 missing | **No — PARTIAL** |
| 2025 rookie / recent entrant | no participation rows at all | **No — UNAVAILABLE** |
| Player whose entire career ⊆ 2016–2023, evaluated **as of ≤ 2023** | fully covered | **Yes — COMPLETE** |

At `currentSeason = 2025`, **every active player is PARTIAL or UNAVAILABLE** →
zero satisfiable. Only the historical-backtest category (as-of ≤ 2023, career ⊆
coverage) yields a COMPLETE, satisfying value — which is exactly the §1153
proxy-validation use.

## 5. Position-by-position feasibility matrix

| Position | Field | Required horizon | Source coverage | Direct/proxy | Authorization | Satisfies readiness? |
|---|---|---|---|---|---|---|
| WR | career_routes | career-to-date | 2016–2023 | PROXY (`pass-play part. × 0.97`) | **WR-authorized** (§175) | **Only if career ⊆ coverage (COMPLETE)**; PARTIAL otherwise |
| WR | route_participation_last4/8 | current 4/8 games | ends 2023 | proxy | WR-authorized | No for 2024–25 (nullable anyway) |
| WR | targets_per_route_run | current | ends 2023 | proxy denom | WR-authorized | No (nullable) |
| RB | career_routes / route participation | career / current | 2016–2023 | RB proxy is **RB-specific**, not the WR `×0.97` | **WR proxy NOT authorized for RB** | No |
| TE | career_routes / career_targets | career-to-date | 2016–2023 | — | route proxy is **engine-owned** (§26.5.2.2); participation adds nothing the engine needs | No |
| QB | career_starts / recent_starts | official starts | n/a | presence ≠ start | none | **No — never populate from participation** |

Confirmed: `proxy_routes = qualifying_pass_play_participations × 0.97` is
authorized **for WR only**, applied at the **final per-window aggregate** (sum
qualifying participations across covered games, then × 0.97), with `rp_source =
proxy` provenance. It is **not** applied to RB, TE, or QB.

## 6. Licensing decision

- **Provider:** nflverse (mirror). **Original owner:** NFL / Next Gen Stats.
- **License:** nflverse code/data is broadly CC-BY-4.0, **but the underlying NFL
  NGS participation data has uncertain redistribution terms** — the feed's
  discontinuation and its NGS provenance make its redistribution status
  **materially unclear**. *This is not a legal conclusion; the uncertainty is
  flagged, not resolved.*
- **Decision (per task):** because licensing is materially unclear, **do not
  commit real provider participation files.** The stage uses **compact synthetic
  fixtures** with the real schema shape. Snapshots record provider, owner,
  `license = "UNCERTAIN-NGS"`, and required attribution so a future
  license-cleared swap is a data change, not a code change.
- Normalized synthetic records and generated aggregates are committed (synthetic,
  no redistribution concern). Attribution appears in this doc and
  `DATA_PIPELINE_PARTICIPATION.md`. A future public deployment with **real** data
  would require confirming NGS redistribution terms first.

## 7. Implementation gate

| # | Condition | Met? |
|---|---|---|
| 1 | actual source files available | Partial — 2016–2023 per binding spec; **not** 2024–2025 (live blocked). |
| 2 | strong player IDs usable | Yes — `offense_players` are GSIS. |
| 3 | can satisfy ≥1 binding field for ≥1 real category | **Yes** — WR `career_routes` for career-⊆-coverage players (spec §1153 category). |
| 4 | derivation explicitly authorized | Yes — WR `×0.97` (WR-only). |
| 5 | licensing permits proposed approach | Yes for **synthetic** fixtures (real data withheld, §5). |
| 6 | more than informational nullable fields | Yes — `career_routes` is a blocking field. |

**Gate: PASS (narrow).** Proceed to a **limited** implementation that is
coverage-aware and honest: it satisfies WR `career_routes` only when the full
career is covered, and reports **zero** live-2025 readiness impact.

## 8. Honest expectation

The live 2025 pipeline will show **0 newly ready** players from participation
(coverage ends 2023). The value delivered is (a) the spec §1153 proxy-validation
capability over 2016–2023, and (b) a coverage-aware guard proving partial career
data cannot satisfy a full-career field. See the recommendation in the completion
report for whether a projection/context stage, a paid route provider, or an
engine-spec revision is the better *next* milestone.
