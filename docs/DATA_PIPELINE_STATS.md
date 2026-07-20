# PlayerTicker Statistics Stage (nflverse weekly)

The statistics stage ingests real NFL usage/efficiency data, joins it to canonical
PlayerTicker identities by GSIS id, aggregates weekly rows into the historical
windows the engines reason over, derives permitted rate stats, and emits typed
**partial** statistical supplements that the readiness layer merges with metadata
(and any authored projection/context supplements).

It **measures readiness honestly**: it fills what free nflverse legitimately
supplies and reports everything else as unavailable — it never fabricates routes,
starts, projections, or model metrics to force a player to `READY`.

## Architecture

```
nflverse weekly player_stats (fixture or live)
   ▼  stats snapshot  (src/pipeline/stats/snapshot.ts)
      provider, dataset, seasons, weekRange, columnSignature, recordCount, checksum
   ▼  weekly adapter  (src/pipeline/stats/nflverse/weeklyAdapter.ts)
      neutral WeeklyStatRecord[] + typed rejections (malformed/dup/season)
   ▼  GSIS join       (src/pipeline/stats/join.ts)
      strong-id only; unmatched / no-stats / collisions reported; unsafe → fail
   ▼  aggregation     (src/pipeline/stats/aggregate.ts)
      CAREER / CURRENT_SEASON / PREVIOUS_SEASON / LAST_4 / LAST_8 (deterministic)
   ▼  derived registry (src/pipeline/stats/derive.ts)
      safe division, explicit minimum samples, never NaN/Infinity
   ▼  supplements     (src/pipeline/stats/supplements.ts)
      partial WR/RB/TE/QB supplements + per-field availability report
   ▼  readiness merge (src/pipeline/readiness/engineReadiness.ts)
      metadata + stats + authored → exact engine input OR staged gap report
```

`runStatsStage` (`src/pipeline/stats/runStats.ts`) is pure and deterministic; the
CLI loads/verifies snapshots and hands them in.

## Dataset

| Provider | Dataset | Seasons (fixture) | Key | Fields consumed | Limitations |
|---|---|---|---|---|---|
| nflverse | weekly `player_stats` (offense) | 2024–2025 | GSIS `player_id` | games (row count), completions, attempts, passing yards/TDs, INTs, sacks, carries, rushing yards/TDs, receptions, targets, receiving yards/TDs, `receiving_air_yards`, `receiving_yards_after_catch`, `target_share` | No routes, snaps, starts, red-zone/goal-line, success/explosive, or expected/model metrics. Column drift between releases (tracked via `columnSignature`). |

Postseason rows are excluded by default (`--include-postseason` to include).

## Aggregation windows

- **CAREER** — every regular-season row.
- **CURRENT_SEASON** — the configured `--season`.
- **PREVIOUS_SEASON** — `season − 1`.
- **LAST_4 / LAST_8** — the most recent 4 / 8 game-weeks, newest-first, across
  seasons up to and including the current season.

Games played = number of weekly rows present (missed weeks simply don't
contribute). Traded players aggregate across teams. Rows after the current
season are excluded from trailing windows but still count toward CAREER.
Aggregation folds rows sorted by `(season, week)`, so it is order-independent;
duplicate `(gsis, season, week, seasonType)` rows are resolved deterministically
(sort-before-dedup) rather than by input order.

## Derived-stat registry

All rate stats live in `derive.ts`, each with an explicit minimum denominator.
`safeDiv` returns `null` (never `Infinity`/`NaN`) below the minimum or on a zero
denominator; internal precision is full (rounding only at an engine boundary if a
spec requires it).

| Metric | Formula | Min sample |
|---|---|---|
| catch rate | receptions ÷ targets | 1 target |
| yards per target / reception | yards ÷ (targets / receptions) | 1 |
| YAC per reception | receiving YAC ÷ receptions (needs supplied YAC) | 1 reception |
| aDOT | receiving air yards ÷ targets (needs supplied air yards) | 1 target |
| target share | Σ player targets ÷ Σ reconstructed team targets | 1 team target |
| yards per carry | rushing yards ÷ carries | 1 carry |
| completion % / Y/A | completions or yards ÷ attempts | 1 attempt |
| AY/A | (yards + 20·TD − 45·INT) ÷ attempts | 10 attempts |
| interception rate | INTs ÷ attempts | 10 attempts |

Team targets are reconstructed per week as `targets ÷ target_share` (only weeks
with a positive share), then summed — recovering season target share honestly.

## Engine-field ownership

`metadata` = supplied by the metadata pipeline. `stats ✓` = supplied by this
stage. `stats ✗` = owned by stats but **unavailable from free nflverse**
(reported, never invented). `proj` / `ctx` = later projection / context stages.

### QB
| Field | Source |
|---|---|
| player_id, player_name, team, age, nfl_seasons_completed, draft_round, injury_status, as_of | metadata |
| career_games_played, career_pass_attempts, career_rush_attempts | stats ✓ (CAREER) |
| recent_games, recent_pass_attempts/completions/passing_yards/passing_tds/interceptions/sacks, recent_rush_attempts/rushing_yards/rushing_tds | stats ✓ (CURRENT_SEASON) |
| adjusted_yards_per_attempt, prior_recent_pass_attempts, prior_adjusted_yards_per_attempt, prior_interception_rate | stats ✓ (derived / PREVIOUS_SEASON) |
| **career_starts, recent_starts** | **stats ✗** — not in the weekly feed (needs a starts/snap source) |
| designed_rush_attempts, scrambles, goal_line_rush_attempts, explosive_pass_rate | stats ✗ (needs pbp) |
| completion_percentage_over_expected | stats ✗ (model/CPOE) |
| prior_rush_attempts_per_start | stats ✗ (needs starts) |
| expected_active_game_*, team_dropback_share, expected_games_remaining/limited, probability_active | proj |
| offensive_environment_score, protection_context_score, depth_chart_status, role_status, competition_pressure, organizational_commitment, team_change, major_system_change, recent_role_change | ctx |

### WR / TE
| Field | Source |
|---|---|
| identity/age/draft/injury/as-of | metadata |
| target_share, average_depth_of_target | stats ✓ (CURRENT_SEASON, derived) |
| TE: career_targets, catch_rate, yards_per_target/reception, yac_per_reception, career_* efficiency | stats ✓ |
| **career_routes** | **stats ✗** — per-player routes ended 2023 (paid source or snap proxy) |
| route_participation_last4/8, targets_per_route_run, previous_/career_* route metrics | stats ✗ (routes) |
| expected_fantasy_points_per_target, catch_rate_over_expected, depth_adjusted_yards_per_target, expected_td_rate_per_target | stats ✗ (model) |
| TE: red_zone_/end_zone_target_rate, snap_share_last4, catchable_target_rate | stats ✗ (pbp/snaps/model) |
| projected_team_dropbacks, team_points_per_drive, team_red_zone_trips_per_game, expected_games_remaining | proj |
| qb_environment_score, practice_status, contract_security, competition_pressure, route/role change, TE depth-chart/coaching/flags | ctx |

### RB
| Field | Source |
|---|---|
| identity/age/draft/injury/as-of | metadata |
| career_carries, career_touches | stats ✓ (CAREER, direct) |
| target_share, yards_per_carry, catch_rate, receiving_yards_per_reception, career_yards_per_carry/catch_rate/receiving_yards_per_reception | stats ✓ |
| **career_routes** | **stats ✗** (routes) |
| snap_share_last4/8, carry_share_last4, previous_snap/carry_share | stats ✗ (snap-counts dataset) |
| goal_line_carry_share, red_zone_carry_share, rushing_success_rate, explosive_run_rate | stats ✗ (pbp) |
| route_participation_last4, targets_per_route_run, career_targets_per_route_run, previous_route_participation | stats ✗ (routes) |
| projected_team_non_qb_rush_attempts, projected_team_dropbacks, team_points_per_drive, team_red_zone_trips_per_game, expected_games_remaining | proj |
| qb_rush_pressure, practice_status, workload_ramp_factor, contract_security, competition_pressure, role/coaching/flags | ctx |

**Honest readiness outcome:** because every position's engine requires a non-null
field free nflverse cannot supply (WR/RB/TE: `career_routes`; QB: `career_starts`
/ `recent_starts`), live records stay `NOT_READY` after the stats stage — but with
far fewer missing fields, each reported by owning stage. Nullable stats-owned
fields that are unavailable are set to the engine's defined `null` (unknown) and
reported `UNAVAILABLE`; non-null unavailable fields are omitted and block, exactly
as they should.

## Running

```bash
# Offline stats pipeline (deterministic), text report:
npm run pipeline:stats

# Explicit flags:
npm run pipeline -- --mode fixture --stats --season 2025           # metadata + stats
npm run pipeline -- --mode fixture                                 # metadata only (unchanged)
npm run pipeline -- --mode fixture --stats --include-postseason
npm run pipeline -- --mode fixture --stats --json --out report.json
npm run generate:pipeline-fixtures                                 # rebuild committed snapshots
```

The report's **Statistics stage** section shows rows accepted/rejected, joins,
unmatched/no-stats/collisions, derived metrics supplied, unavailable required
metrics, readiness before → after stats, players newly ready, missing fields
eliminated, and remaining gaps grouped by `stats` / `projections` / `context`.

The run exits non-zero on a corrupted stats snapshot, an invalid required schema,
or an unsafe identity collision; ordinary missing optional data is reported, not
fatal. Live retrieval reuses the metadata `--mode live` path for Sleeper; a live
nflverse CSV pull remains a documented follow-up (fixtures are always offline).

## Current limitations / next milestone

- Single dataset (weekly `player_stats`). Snap-counts (RB snap share; the WR
  spec's `proxy routes = pass snaps × 0.97`) and play-by-play (red-zone/goal-line,
  success/explosive) are deliberately out of scope for this milestone.
- No projections or context stages yet — so no live player reaches `READY`.
- QB starts have no free weekly source; WR/RB/TE routes require a paid source or
  the snap proxy.

**Recommended next milestone:** an **nflverse snap-counts sub-stage** — it unblocks
RB `snap_share`/`carry_share` and implements the WR spec's snap-based route proxy,
which is the single change that removes the most remaining *stats* blockers.
