# PlayerTicker Phase 1: Recovery Audit and Plan

Audit date: 2026-11-12. Audited refs: `main` @ `084cbab` (deployed), PR #10 head `f427be8`, `site-data` @ `a0d3d8d`.
No code, data, workflow, or deployment changed during this audit. This file is the only addition.

How to read this: sections A, B, H and I are written for the owner. C through G carry the engineering detail.
Every number below came from something I ran or fetched on the audit date. Section J lists what I could not verify.

---

## A. Executive verdict

PlayerTicker is a well-engineered pipeline around an unproven model, published through a site where most pages show invented numbers.

**What works**

- The design system, navigation, responsive layout and Board page render correctly on desktop and mobile (local build of `main` with the published data, Chromium, 1440px and iPhone 13). Zero horizontal overflow on seven routes.
- Ingestion transport, checksummed capture, deterministic replay, identity resolution, per-field provenance, point-in-time team resolution, atomic publication. I reproduced the published board from live nflverse data: 617 entries, 578 valued, against 615 and 575 published. The small drift comes from upstream corrections since September.
- Test suites pass: `main` 2,219 tests in 219 files, PR #10 2,571 tests in 240 files. Both reproduced locally.

**What does not work**

1. **The board is 61 days old and says "Updated less than an hour ago."** It was published once, by hand, on 2026-09-12. All 34 scheduled refreshes failed. Both refresh workflows have been disabled since 2026-09-21.
2. **That one board is built on 2025 data only.** The manual run passed `--seasons 2025`. Every valued RB, WR and TE in my reproduction (497 of 497) is scored on exactly one season. Teams and roster status date from January 2026. No 2026 game, trade, injury or rookie is in it.
3. **Only `/board` shows real output.** The landing page, Market, player cards, Watchlist and Portfolio show simulated prices on real player names, including invented injury notes and buy-low and sell-high lists, behind a one-line banner.
4. **The valuations have no demonstrated edge.** In leak-free backtests the published model matched "rank players by last season's fantasy points" and lost to it at tight end. Details in B5.
5. **The canonical position engines do not drive the board.** The frozen RB and TE engines ran for 0 of 296 players. The frozen WR engine runs and its output is discarded. The QB engine runs with 16 substituted inputs for every one of 81 quarterbacks and still earns a "Full model" badge.

**What is preventing launch**

In order: no working in-season refresh, no validated model, misleading simulated surfaces, no rookies, and status labels that overstate freshness and confidence.

**The answer to your main question**

The missing data is mostly missing engineering. The pipeline ingests 5 of the 15 or so free nflverse datasets that carry what the models need, and reads 15 of the roughly 55 offensive stat columns in the weekly stats file. Snap counts, play-by-play, injuries, depth charts, draft picks, expected fantasy points and contracts all exist, free, updated this week. One measurement is unavailable in-season without a licence: true routes run. Free snap share tracks it at r = 0.94 to 0.97 (F2).

PR #10 is honest and safe, and it publishes zero values. It is a containment, not a product.

---

## B. Critical failures

Ranked by consequence. "Confirmed" means I reproduced it. "Suspected" means the evidence points there and I have not isolated it.

### B1. The refresh cannot run during the NFL season. Confirmed. Severity: blocker.

- Evidence: 36 runs of `refresh-board.yml`. One success (manual, `--seasons 2025`). 35 failures, 34 of them scheduled. Every failure log ends `published false, entries 0` with no reason printed.
- Root cause: `src/runtime/sources.ts` requires `pbp_participation_<season>.csv` for each valuation season. nflverse publishes that file after the season ends. Today `pbp_participation_2026.csv` returns 404 and the release was last rebuilt 2026-02-10. The run derives season 2026, hits the 404 on a required provider, and refuses to publish.
- The file it dies on feeds no published number. All 223 WR, 149 RB and 125 TE valuations carry `NO_PARTICIPATION_DATA`. The QB engine never reads it.
- Not fixed anywhere. PR #8 builds a separate non-serving evaluator that skips the file. PR #10 keeps `participation` in the production plan.
- Second design defect behind it: with no `--seasons` flag the run values RB, WR and TE on the current season alone (`valuationSeasons` scoping in `src/ingestion/evidence.ts`). In Week 3 that would mean two games of evidence and nothing from the prior year.

### B2. A stale board is labelled current. Confirmed. Severity: critical.

- `status.json` is a static file written at publish time with `ageHours: 0`. The Board reads it and prints "Updated less than an hour ago" forever. Screenshot evidence at 61 days old.
- Fixed by PT-04 (PR #6). Unmerged.

### B3. Simulated values on real names. Confirmed. Severity: critical for trust.

- `/`, `/market`, `/player/:ticker`, `/watchlist`, `/portfolio` read `MockMarketDataService`. Example from today's render: "Joe Mixon: Foot injury lands him on IR with a cloudy timeline", "CeeDee Lamb 83.8, down 3.1", "Buy-Low Windows", "Sell-High Warnings", stamped "Thu, Nov 12" and "Fresh".
- The same player carries two unrelated numbers on the same site: the demo price and the Board value.
- The banner exists. A visitor arriving from a shared link to a player card can still read a fabricated injury note as news.

### B4. The published board misstates its own contents. Confirmed. Severity: high.

- The Value column prints the weekly composite. The rank orders by cross-position dynasty value. Rank 1 shows 86.1, rank 2 shows 91.1, rank 3 shows 61.9.
- The header ribbon says "DYN · SF · 0.5" (half-PPR). The valuation layer scores full PPR. The ribbon is a control that changes nothing on the Board.
- The market columns are dead in production. The app requests `<base>/data/market`. The deploy writes `market-latest.json`. Every row shows a dash.
- Fixed by commit `2caafa5` and PT-01, PT-03 (PRs #4, #5). Unmerged.

### B5. The model matches a naive baseline. Confirmed on a small sample. Severity: high.

Method: I ran the `main` pipeline at two historical as-of dates using only seasons that had finished, then ranked players by the model's dynasty composite and compared against actual PPR points afterwards. Baseline: last season's total points and points per game. Spearman rank correlation, universe is the union of each method's top players (n = 29 to 67 per cell).

| As-of, outcome | Position | Model (dynasty) | Naive total | Naive PPG |
|---|---|---|---|---|
| Sep 2024, 2024 season | QB | 0.55 | 0.56 | 0.31 |
| | RB | 0.46 | 0.51 | 0.56 |
| | WR | 0.50 | 0.57 | 0.45 |
| | TE | 0.39 | 0.46 | 0.46 |
| Sep 2024, 2024 + 2025 | QB | 0.53 | 0.67 | 0.38 |
| | RB | 0.61 | 0.56 | 0.60 |
| | WR | 0.54 | 0.56 | 0.43 |
| | TE | 0.42 | 0.46 | 0.51 |
| Sep 2025, 2025 season | QB | 0.32 | 0.28 | 0.00 |
| | RB | 0.58 | 0.47 | 0.48 |
| | WR | 0.58 | 0.41 | 0.47 |
| | TE | 0.16 | 0.32 | 0.22 |

- The model beat the better baseline in 4 of 12 cells. Top-N hit rates sat within 0.08 of the baseline in every cell.
- TE lost in all three cuts.
- The dynasty composite did not beat the model's own one-year composite over the two-year outcome (RB 0.61 vs 0.67, WR 0.54 vs 0.56).
- Limits: two as-of dates, standard error near 0.13 to 0.19 per cell, one-to-two-year outcomes. This shows absence of evidence for an edge. It does not prove the model is useless.
- These runs used the documented three-season window. The live board used one season, which nobody has tested.
- The QB rows needed a one-line scratch patch outside the repo (B8). On `main` the QB engine rejects every quarterback at a historical date.

### B6. The QB "Full model" runs on substitutes. Confirmed. Severity: high.

- 20 of the 44 QB input fields are `UNAVAILABLE` for 81 of 81 quarterbacks. Three flags (`team_change`, `major_system_change`, `recent_role_change`) are `false` for all 81.
- Every QB logs exactly 16 fallbacks. The engine labels all 81 `FALLBACK_HEAVY`.
- `scoring_environment` has a standard deviation of 1.1 across the league. It is a constant.
- QB1 to QB25 span 74.1 to 64.6 on the dynasty composite. The utility layer reads rank only, so sub-point noise decides who is QB7 and who is QB13. Tyler Shough (9 career starts) ranks above Herbert, Burrow and Mahomes.
- The Board shows "HIGH 79" confidence for Josh Allen beside "Full model". The JSON's `publicConfidenceLabel` says `LOW` for all 81.

### B7. Three QB data defects move real players 20 or more spots. Confirmed.

| Defect | Evidence | Effect |
|---|---|---|
| nflverse's schedule names the wrong starter and the pipeline trusts it | Jayden Daniels threw 22 to 38 passes in Weeks 9 to 13 of 2024 and Week 14 of 2025. `home_qb_id`/`away_qb_id` name someone else in all six. | Start rate 11 of 17. Role `BACKUP`. QB33 live. QB26 in the Sep 2025 backtest. |
| Seasons completed counts the season in progress | `seasonsCompletedAsOf` returns `season - rookie + 1`. On 2026-09-12 Brock Purdy (2022 rookie) shows 5, C.J. Stroud 4, Shough 2. | Purdy fails the "4 seasons or fewer" rung and the "48 starts" rung (he has 45). Role `BACKUP`. QB34. `ROOKIE_EXPECTED_STARTER` cannot fire in-season. |
| The role ladder has no rung for a current starter | 28 of 81 QBs read depth chart `STARTER` and role `BACKUP` together. | Role security is 21% of the dynasty composite. Commit `47b467f` fixes the ladder. Unmerged. |

Also confirmed: role evidence goes stale. In the Sep 2025 backtest Derek Carr and Jimmy Garoppolo read `ESTABLISHED_STARTER` because the window is the player's own last 17 appearances, however old.

### B8. Three latent pipeline faults. Confirmed.

- **No sanity gate on publication.** A run of mine published a board with 0 of 532 QB, RB and TE valued and exited 0. PT-02 would not stop it because it counts `INSUFFICIENT` as success.
- **Fact timestamps come from the capture, not the game.** Reusing a capture directory at an earlier as-of marks every counting stat as a future fact. That is how I produced the board above.
- **Remaining games are not scoped to a season.** `gamesLeft` counts every scheduled game after the as-of. At a historical date that spans two seasons, exceeds the engine's limit of 21, and the QB engine rejects all 112 quarterbacks. Nobody has ever backtested QB on `main`.

### B9. Injured reserve reads as "not rostered." Confirmed.

- nflverse codes IR as `RES`. The adapter maps `RES` to `RESERVE`, then to `inactive`, then to `NOT_ROSTERED`. Mahomes, Bowers and Nabers publish `playerStatus: inactive` with activity probability 0.40.
- The injury and practice feed is not ingested. A code comment says nflverse publishes none. `injuries_2026.csv` exists through Week 10.

### B10. No rookies. Confirmed.

- Selection requires an NFL game inside the valuation window. A drafted rookie has no value until he plays, and under the live configuration not even then.
- In September 2025 the model had no value for 9 of that season's top-40 RBs, 6 of the top-60 WRs and 4 of the top-24 TEs. In September 2024: Daniels, Maye, Nix, Caleb Williams, Bowers, Nabers, Brian Thomas.
- Rookies are the most traded dynasty assets.

### B11. Confidence carries no information. Confirmed.

- Accessible tier: ceiling 74, minus 21 points every player loses by construction, minus 6 for no trajectory. Result: 47 for nearly everyone. Maximum reachable is 53. On the live board all 494 read LOW.
- Commits `2caafa5` and `83eaa3f` redesign it. They also let a 16-fallback QB valuation read HIGH. See E.

### B12. Market values are served publicly with rights unresolved. Confirmed. Owner decision.

- The deploy copies `market-latest.json` (513 DynastyProcess quotes) into the public site. The UI cannot read it (B4) and anyone can download it.
- The DynastyProcess repository is GPL-3.0. Its values derive from FantasyPros expert consensus. GPL on the repository does not grant rights FantasyPros holds. PR #10 removes the file from the public surface.

### Suspected, not confirmed

- The same age curve serves weekly and dynasty horizons. The TE curve scores a 22-year-old (80) below a 30-year-old (88) on the dynasty horizon.
- Durability is games divided by rostered weeks. With one season in the window it equals "was hurt last year" and reads as a trait.
- Hand-authored anchor tables and horizon weights were never fitted. B5 is the only test they have had.

---

## C. Position-by-position assessment

Live configuration (one season, as-of 2026-09-12), reproduced locally.

| | QB | RB | WR | TE |
|---|---|---|---|---|
| Model that sets the published value | Frozen engine `qb-mvp-1.2` | `rb-accessible-1.0` | `wr-accessible-1.0` | `te-accessible-1.0` |
| Canonical engine's role | Runs, 16 fallbacks each | Never runs (0 of 159) | Runs for 215, output discarded | Never runs (0 of 137) |
| Valued / entries | 81 / 81 | 149 / 159 | 223 / 240 | 125 / 137 |
| Inputs observed | Box score, career totals, starts | Box score, team shares, age | Box score, provider target share, air yards, age, draft round | Box score, team shares, age |
| Inputs substituted or absent | 20 of 44 fields absent for all | Routes, snaps, red zone, context, contracts, injuries | Same, plus xFP and catch rate over expected | Same as RB |
| Seasons of evidence | Career 2017 to 2025 | 1 for all | 1 for all | 1 for all |
| Confidence shown | HIGH for 33 | LOW for all | LOW for all | LOW for all |
| Backtest vs naive | Level | Level | Level | Worse |
| Known wrong placements | Daniels QB33, Purdy QB34, Mahomes QB13, Shough QB7 | Chase Brown RB5, Barkley age score 50 | Wan'Dale Robinson above Jefferson, Nabers WR22 | Bowers TE4 behind Pitts and Warren |
| Verdict | Not defensible as "Full". Fixable with free data. | Defensible as a labelled production ranking. Not a dynasty valuation yet. | Same as RB. Strongest of the four. | Weakest. Needs a rebuild. |

Cause of the WR and TE placements: the model sees one season. Jefferson's 2020 to 2024 record is invisible, so a 1,048-yard year ties him with Robinson's 1,014. Target share saturates near 0.30 (94 of 100 for both). Bowers and Nabers lose to an injury-shortened 2025 through the durability score and the IR mapping in B9.

Superflex: the premium comes from the lineup schema (replacement QB moves from rank 12 to rank 24). No multiplier exists anywhere. That design is sound and worth keeping. Its weakness is upstream: it consumes QB rank, and QB rank is the least stable output in the system (B6).

"Low value" versus "insufficient information": the accessible tier separates them (40 players publish a dash). The QB path does not. Shane Buechele, 14 career attempts, publishes a dynasty composite of 40.7 with confidence 0.

---

## D. Data reliability matrix

Coverage measured on the reproduced live-configuration run. "Free source" means I fetched the file on 2026-11-12 and it returned 200 with a current timestamp.

| # | Field group | Used by | Pipeline today | Class today | Measured | Free source (verified) | Action |
|---|---|---|---|---|---|---|---|
| 1 | Age | All | `players.csv` birth date | Observed | 100% | In use | Keep |
| 2 | Seasons completed | QB role, all | Derived from rookie season | Derived, wrong in-season | +1 for every player Sep to Feb | In use | Fix formula |
| 3 | Draft capital | WR, QB priors, security | Round only. Pick discarded. Undrafted equals unknown. | Observed, lossy | 64 of 223 WR "unknown" | `draft_picks.csv`, 2026 class present | Ingest pick, mark undrafted |
| 4 | Team, roster status | All | Latest weekly roster row at as-of | Observed, stale under live config | 11 of top 100 on the wrong team today | `roster_weekly_2026.csv` | Ingest current season, map IR correctly |
| 5 | Injury and practice status | All | Not ingested. Inferred from roster code. | Fallback | 0% observed | `injuries_2026.csv` through Week 10 | Ingest |
| 6 | Box-score volume and production | All | `stats_player_week` | Observed | 100% | In use | Keep, widen window |
| 7 | Target share | WR, TE, RB | Provider column plus reconstructed team totals | Observed | 100% of targeted players | In use | Keep. Add `air_yards_share`, `wopr` (discarded today) |
| 8 | Air yards, depth of target | WR | Provider column | Observed, derived | 100% | In use | Keep |
| 9 | Route participation, career routes, targets per route | Frozen WR, RB, TE (readiness blocker) | Participation file folded per game. Feeds only the unpublished WR engine. | Proxy, unused | 0 published values use it | Participation: completed seasons only. In-season: none. | Completed seasons: join to play-by-play dropbacks. In-season: snap-share proxy (F2). Label as proxy. |
| 10 | Snap share | RB, TE, QB depth | Code reads `snaps` from the stats file. That column does not exist. | Unavailable | null for 100% | `snap_counts_2026.csv`, 99.8% id match | Ingest |
| 11 | Red-zone, goal-line, end-zone usage | RB, TE, QB | None | Unavailable | 0% | `play_by_play_2026.csv.gz` | Derive |
| 12 | Efficiency over expectation (xFP per target, catch rate over expected, success rate, explosive rate, CPOE, EPA) | All frozen engines | Constants | Fallback | Same value for every player | Play-by-play, `ep_weekly_2026.csv` (ffopportunity), `passing_cpoe` and `*_epa` columns already downloaded and dropped | Ingest and derive |
| 13 | QB designed rush vs scramble, goal-line rushes | QB rushing (15% of dynasty) | Split by fixed share | Fallback | 81 of 81 | Play-by-play `qb_scramble`, `yardline_100` | Derive |
| 14 | QB starts | QB role, opportunity | Schedule `home_qb_id`/`away_qb_id` | Derived from an unreliable field | Daniels: 6 of 17 wrong | Stats file attempts, play-by-play first dropback | Cross-check, prefer attempts |
| 15 | QB role, depth chart | QB role security (21% of dynasty) | Start-rate classifier | Classification | 28 of 81 self-contradictory | `depth_charts_2026.csv`, rebuilt daily | Ingest. Land `47b467f`. |
| 16 | Team and offence context (dropbacks, points per drive, pace, QB environment, protection) | All | Neutral constant | Fallback | QB scoring environment sd 1.1 | Play-by-play, `stats_team_week_2026.csv` | Derive |
| 17 | Competition pressure | All | Teammate list with draft round. Usage share null for all. | Estimate | No usage signal | Depth charts, snap counts | Derive |
| 18 | Contract security, organisational commitment | All frozen engines | From role and draft round. Board carries `NOT_TRUE_CONTRACT_DATA`. | Fallback | 0% observed | `historical_contracts.parquet` current. The `.csv.gz` is frozen at May 2022. | Ingest. Needs a Parquet reader and an id join. Confirm OverTheCap terms. |
| 19 | Team change, system and coaching change | Flags | Constant `false` | Fallback | 100% false | Roster rows give team change. `games.csv` names head coaches. Coordinators: no structured free source. | Derive the first two. Leave coordinators unavailable. |
| 20 | Prior-window trend inputs | QB `prior_*`, others `previous_*` | None | Unavailable | 100% absent for QB | Data already ingested | Window it |
| 21 | Durability | Accessible tier | Games over rostered weeks | Derived, one season | Equals last year's injury | Injuries file, multi-season window | Rebuild |
| 22 | Rookie and prospect profile | All | Not modelled. No NFL game means no entry. | Unavailable | 0 rookies valued pre-debut | `draft_picks.csv`, `combine.csv`. College production is outside nflverse. | Draft-capital model first. College data is a later, separate source. |
| 23 | Expected games remaining | QB validation | Schedule count, unscoped | Derived, breaks historically | 112 of 112 QBs rejected at a past as-of | In use | Scope to season |
| 24 | External market value | Comparison only | DynastyProcess `values.csv` | External | 396 of 575 matched | Reachable. Rights unresolved. | Remove from public deploy until cleared |
| 25 | True routes run, charted grades, separation | Named by the full specs | None | Unavailable | 0% | None. Licensed only. | Defer. Not needed for launch. |

The weekly stats file has 150 columns, roughly 55 of them offensive. The adapter reads 15. Dropped and relevant: `passing_air_yards`, `passing_epa`, `passing_cpoe`, `passing_first_downs`, `rushing_epa`, `rushing_first_downs`, `receiving_yards_after_catch`, `receiving_epa`, `receiving_first_downs`, `racr`, `air_yards_share`, `wopr`, all fumble columns, `fantasy_points_ppr`, `opponent_team`.

---

## E. Existing work worth saving

**Keep as the foundation (on `main`)**

- `src/transport`, `src/persistence`, `src/ingestion` identity and merge logic, point-in-time resolution, per-field provenance, capture and replay.
- `src/utility`: replacement-level surplus from a league schema, measured production curves, no hand-set positional multipliers.
- The accessible models as the starting baseline, with their null-not-zero discipline and the `INSUFFICIENT` state.
- The design system, tokens, Board table, chrome, and every Demo Market component (the components, not their data source).
- Golden-fixture and boundary tests.

**Land from unmerged work**

| Source | What | Verdict |
|---|---|---|
| `2caafa5` items 1, 2, 4 and the market URL fix | Value column equals ranked quantity. One ranking. Accessible players no longer `UNAVAILABLE`. Correct static market path. | Keep |
| `47b467f` | Current-starter rung, 8-game depth window | Keep. Removes 28 contradictions. Still needs B7 fixes underneath. |
| PR #2 (PT-02) | Reject incomplete inference boards | Keep. Add a per-position floor (B8). |
| PR #3 (PT-09) | Deploy fails closed without a valid board | Keep |
| PR #4 (PT-01) | Canonical dynasty values and ranks in the UI | Keep |
| PR #5 (PT-03) | Truthful format label | Keep |
| PR #6 (PT-04) | Truthful freshness | Keep. Highest value per line in the stack. |
| PR #7 (PT-05) | Print which source failed | Keep. It would have exposed B1 on day one. |
| PR #10 pieces | Deployment data gate, public data boundary, zero-target denominator fix (M08), partial-observation guard (M09) | Cherry-pick |

**Do not land as written**

| Source | Why |
|---|---|
| `83eaa3f` and `2caafa5` item 3 | They drop the fallback penalty and the ceiling. A 16-fallback QB valuation then reads HIGH, and a 17-game box-score valuation reads HIGH 85. The number measures sample size. Rename it "Evidence" or hold it until a backtest calibrates it. Owner decision. |
| PR #8, #9 as a product path | The in-season evaluator is the right idea placed outside production. Fold its source plan into the real pipeline. The role gate blocks all 417 players (PR #10's own figure), so it yields an empty board. |
| PR #10 as a unit | 136 files, 28 commits, mixes safeguards with unapproved methodology, and ships no values. Merging to `main` deploys automatically. |
| `docs/READINESS_FRONTIER_AUDIT.md` recommendation | It proposes a hand-curated data supplement and advises against more adapters. Section D shows adapters are where the value is, and hand curation breaks your no-manual-maintenance rule. |

**Stale documentation to correct later**: `README.md` says WR runs at the FULL tier, cites a three-season board of 868 players, and reports 1,789 tests. None of that matches `main`.

---

## F. Recommended data strategy

### F1. Verdict

Accessible data is enough for a credible dynasty product built on production, opportunity, usage quality, age, draft capital, health and contract status. It is enough to launch.

Licensed data buys true routes run, charted grades and separation. Those refine a working model. They cannot rescue an unvalidated one, and today's model does not use the free data it already downloads. Buy nothing until a backtest shows the free-data model has plateaued.

### F2. The one real gap, measured

Route participation is the input the full specs lean on hardest. nflverse delivers participation after the season. For 2025 I compared free weekly snap share against true on-field dropback share:

| Position | Player-games | Game-level r | Season-level r (6+ games) | Mean absolute error |
|---|---|---|---|---|
| WR | 2,526 | 0.971 | 0.986 | 0.065 |
| TE | 1,586 | 0.943 | 0.961 | 0.084 |
| RB | 1,452 | 0.940 | 0.953 | 0.065 |

Snap share is a usable in-season proxy with a known error. Recalibrate each February when participation lands. Caveat: on the field for a dropback is an upper bound on routes run for TEs and RBs who stay in to block.

The pipeline's current dropback rule (`time_to_throw` present) covers 87.9% of true dropbacks and correlates above 0.99 with the full count. It is fine. The problem is that nothing published reads it.

### F3. Strategy options

| Option | Coverage | Refresh | Money | Engineering | Rights | Verdict |
|---|---|---|---|---|---|---|
| A. Expand nflverse ingestion (snap counts, play-by-play aggregates, injuries, depth charts, draft picks, ffopportunity, contracts, dropped stat columns) | Rows 3 to 21 of the matrix | Daily to weekly, in-season | $0 | Medium: about 8 adapters on an existing framework. Play-by-play needs streaming to hold memory. | nflverse-data repository is CC BY 4.0. Add visible attribution. Confirm terms for the FTN, OverTheCap and Pro Football Reference derived files before charging money. | **Do this** |
| B. Narrow accessible models, validated | All four positions | Same | $0 | Medium | Same | **Do this, on top of A** |
| C. External market as an attributed comparison | 396 of 575 players today | Weekly | $0 or licence | Small, already built | **Unresolved.** Ask DynastyProcess and FantasyPros in writing, or use a source with explicit terms. | Hold until cleared |
| D. Licensed premium feed | True routes, grades | Weekly | Unknown. I did not research prices. | Adapter is cheap, interfaces are vendor-neutral already | Contract | Defer |
| E. Hand-curated supplement | Small | Manual | Your time | Low | None | Reject |

Sleeper stays optional enrichment. Nothing depends on it.

Keep PlayerTicker values and any external consensus in separate tables, separate columns and separate labels, as the code already does. Compare on rank only.

---

## G. Engineering recovery roadmap

Each phase ships alone and has a test that fails today.

**Phase 0. Stop misleading visitors.** Mostly merges. No model change.
- Land PT-04, PT-03, PT-01, PT-09, PT-02, PT-05 and the kept parts of `2caafa5` as one reviewed PR.
- Remove `market-latest.json` from the public deploy.
- Gate the simulated routes out of the public build, or replace real names with fictional ones. Owner picks.
- Accept when: a local build with today's `site-data` prints the true publish date and a stale warning, Value is monotone in rank for all rows, no simulated price renders beside a real name, `dist/data` holds only `board.json` and `status.json`.
- Risk: PR #2 to #9 are stacked on three commits `main` lacks. Rebuild the stack on `main`, do not merge PR #10.

**Phase 1. Make the board refresh itself.** Depends on 0.
- Source plan: participation becomes optional. Valuation window becomes a rolling three seasons that includes the current one. Current-season rosters ingested.
- Fix `seasonsCompletedAsOf`, season-scope `gamesLeft`, stamp facts with game dates, map `RES` using `status_description_abbr`.
- Publication gate: per-position minimum valued share and a maximum change against the last board.
- Accept when: a replay at today's date publishes a board whose newest game is under 8 days old, team matches the 2026 roster for at least 99% of entries, replay is byte-identical, and the gate rejects a board with an empty position. Publish to a staging data branch first.
- Risk: memory. A measured run peaks at 6.6 to 7.8 GB.

**Phase 2. Validation harness.** Depends on 1. Runs before any model change.
- Commit small fixed captures. Add `npm run backtest` that replays as-of dates 2019 to 2025 and scores against later seasons, with baselines (last-season points, age-only, draft-capital-only).
- Accept when: the scorecard reproduces section B5 within rounding and runs in CI without network.
- This is the only thing that can tell you whether Phase 3 and 4 help.

**Phase 3. Data expansion.** Depends on 1. Parallel with 2.
- One adapter per PR: snap counts, injuries, depth charts, draft picks, dropped stat columns, play-by-play aggregates, ffopportunity, contracts.
- Accept per adapter: a coverage report (share of board players with the field, by position and week) committed with the PR, and the matrix row moves to Observed or Derived.

**Phase 4. Model v2.** Depends on 2 and 3.
- Fit weights and curves to history. Separate age curves per horizon. Multi-season memory. Rookie model from draft capital. QB engine fed real inputs or replaced by an accessible QB model.
- Version it. Leave the frozen specs untouched as reference. Every change ships with its backtest delta.
- Accept when: v2 beats the best naive baseline at every position across at least five as-of dates, with intervals reported. If TE cannot, publish TE as "production ranking" and say so.
- Calibrate confidence against backtest error, then bring the label back.

**Phase 5. Real market surfaces.** Depends on 4.
- Movement, risers and fallers computed from PlayerTicker's own board history. Player cards on published values. Buy-low and sell-high only against a cleared external market.
- Reuse the existing Demo Market components.

**Phase 6. Launch hardening.** Alerting on failed refresh, attribution page, README rewrite, methodology page generated from the live model version.

---

## H. Minimum trustworthy launch

**Must work**

- `/board` for 12-team Superflex, full PPR, all four positions, refreshed automatically at least weekly in-season.
- Honest header: publish time, data-through week, stale warning past a threshold.
- One value per player, the one the rank is computed from.
- Rookies present from draft day with a labelled draft-capital value.
- Every row labelled with what it is: "Production-based ranking, beta" until Phase 4 passes. A dash for insufficient evidence.
- A public scorecard: the backtest table, baselines included.
- Methodology and data-credits pages that describe the model that is running.

**Keep off or clearly fenced until earned**

| Feature | Condition to turn on |
|---|---|
| Simulated Market, player cards, watchlist, portfolio | Phase 5, on real values |
| Buy-low and sell-high signals | Cleared external market, or own-history signals with a backtest |
| Market comparison columns | Written permission or a source with explicit terms |
| Confidence labels | Calibrated in Phase 4 |
| "Full model" badge | An engine running on observed inputs |
| 1QB, half-PPR, redraft toggles | A league schema and curve exist for each |
| Weekly and rest-of-season horizons | Injury and depth-chart feeds ingested |

---

## I. First implementation task

**Repair the in-season refresh and prove it on a staging branch.** (Phase 1.)

Every later phase needs a board that can update. This task also removes the largest single lie on the site, a September board described as fresh.

Scope, one PR on a branch from `main`:
1. Make `participation` optional in `buildSourcePlan` and exclude it from `REQUIRED_PROVIDERS` failure logic.
2. Default the valuation window to the current season plus the two before it. Ingest rosters for all three.
3. Fix `seasonsCompletedAsOf`. Scope `gamesLeft` to the as-of season. Stamp facts with the newest game date.
4. Add the per-position publication floor.
5. Carry PT-05 so a failed source prints its name.

Expected result: a run dated today publishes roughly 850 to 900 entries drawn from 2024, 2025 and nine weeks of 2026, including rookies who have played.

Verify:
- `npm run ingest -- --as-of <now> --verify-replay` exits 0 with identical board checksums.
- Newest game in the snapshot is under 8 days old.
- Published team equals the latest 2026 roster team for at least 99% of entries (today: 11 of the top 100 are wrong).
- Purdy and Stroud show 4 and 3 seasons completed.
- A fixture with one position unvalued fails publication with a named reason.
- One manual dispatch writes to `site-data-staging`. Production `site-data` and the paused schedules stay untouched until you approve.

Phase 0 is a merge decision on finished work. I recommend approving both together. Phase 0 can land the same day.

---

## J. Limits of this audit

- The live URL (`gavinbradley3.github.io`) is blocked from this environment (proxy 403). I built `main` exactly as `deploy.yml` does, copied in the published `site-data` files, and tested that. Hosting-level behaviour (Pages 404 routing, caching) is unverified.
- Sleeper is unreachable here. Its overlay on the demo pages is untested.
- PR #10's "417 selected, 365 diagnostic values, 0 eligible" figures come from the PR body and its docs. I verified its test suite and code paths, not its private preview artefact.
- I did not read FantasyPros' terms, and I did not research vendor pricing.
- Backtests cover two as-of dates and four positions with n near 30 to 67 per cell. Treat them as a first reading.
- Player facts after June 2026 (teams, injuries, rookies) come from the nflverse files, not from independent knowledge.

## K. Decisions needed from the owner

1. Simulated pages: remove from the public build until Phase 5, or keep them with fictional names. I recommend removing.
2. Market data: stop serving `market-latest.json` now and seek written permission. I recommend yes.
3. Confidence: hold the label until calibrated, or ship the sample-size version renamed "Evidence". I recommend holding.
4. Model path: treat the accessible models as the launch line and the frozen specs as reference, with fitted v2 versions approved one backtest at a time. I recommend yes.
5. Approve Phase 0 and the first implementation task.

## L. Reproduction

```bash
# Live-board reproduction
npm run ingest -- --seasons 2025 --career-seasons 2017,2018,2019,2020,2021,2022,2023,2024,2025 \
  --as-of 2026-09-12T21:04:45.363Z --no-sleeper --db <tmp>/pt.db --captures <tmp>/captures

# Backtests (fresh capture directory per as-of, see B8)
npm run ingest -- --seasons 2022,2023,2024 --career-seasons 2017,...,2024 --as-of 2025-09-01T00:00:00.000Z --no-sleeper ...
npm run ingest -- --seasons 2021,2022,2023 --career-seasons 2017,...,2023 --as-of 2024-09-01T00:00:00.000Z --no-sleeper ...
```

Field matrix: join `run_inference`, `normalized_input_artifact` and `inference_output_artifact` in the run's SQLite file and tabulate `output.fields[].provenance` and `status` by position.
Outcomes: `fantasy_points_ppr` from `stats_player_week_<season>.csv`, regular season.
Snap proxy: `snap_counts_2025.csv` joined to `pbp_participation_2025.csv` and `play_by_play_2025.csv.gz` on `qb_dropback == 1`.
