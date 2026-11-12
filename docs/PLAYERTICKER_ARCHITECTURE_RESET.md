# PlayerTicker Architecture Reset

Status: proposal for owner review. No production code, model weight or deployment changed.
Date: 2026-11-12. Source checks in this document ran against live provider files on that date.

## 0. Verdict

The repository holds about 75,000 lines of TypeScript and 23,000 lines of specification. It has
never projected a fantasy point and has never tested a valuation against an outcome. Those two
gaps are the reset.

Recommended architecture, in one line: **project fantasy points per game from a fitted
baseline, convert projected points to discounted value over replacement, compare the resulting
rank with an authorized market source, and explain every change as an exact split between
opportunity and efficiency.**

Recommended first task: **build the RB weekly fact table and a backtested baseline projection**
(section 7). Every later feature has to beat that baseline out of sample or stay out.

### Two documents in the brief do not exist under the names given

No file is titled "Phase 1 recovery audit" or "Phase 2 validation results". I reviewed the
closest matches and treated them as those documents:

- `docs/READINESS_FRONTIER_AUDIT.md` (its sections are "Phase 1" through "Phase 7")
- `docs/ACCESSIBLE_MODEL_VALIDATION.md` (the only validation write-up in the repository)

If you meant other documents, they are not on `main` or on this branch.

## 1. What the review found

**1. The original position models never ran on real inputs.** The four specifications
(11,091 lines) require charting data with no free source. The repository's own documents record
the result:

- WR: all 309 valued receivers received identical fallback values for route participation,
  targets per route, expected points per target and catch rate over expected. Engine confidence
  came out at 8 for every receiver (`WR_ACCESSIBLE_MODEL_V1.md` §1).
- RB: 24 of 37 inputs unavailable for all 237 players. TE: 27 of 40
  (`ACCESSIBLE_DATA_MODEL_RB_TE_V1.md` §1.1).
- QB runs as "FULL", yet every published player still carries `NEUTRAL_DEFAULT` and
  `UNVALIDATED_MODEL` (`FUTURE_DATA_MAP.md`).

**2. The replacement "accessible" models are hand-authored and tuned by eye.** Component
anchors, component weights, five horizon weightings and a four-way headline blend are all
authored. The validation document shows the tuning loop: the dynasty age weight moved from 0.33
to 0.23 because Christian McCaffrey ranked 20th and looked wrong. That is fitting to consensus
by hand while claiming independence from it. The spec admits no parameter "has been calibrated
against realized fantasy points" (§10.1).

**3. No backtest exists.** A search for backtest, holdout, out-of-sample and error metrics
finds requirements in specifications and no results. "Validation" means a person judged the
ranking plausible.

**4. The utility layer throws the model's output away.** `dynastyValue.ts` consumes rank only.
It maps a composite's rank onto a historical production curve. A player's value therefore
depends on the order of an unfitted composite, and the system contains no statement of the
form "this player will score X points". Age enters once inside the composite and again in the
depth term.

**5. The market side cannot support a buy or sell claim yet.** One source (DynastyProcess),
derived from FantasyPros expert consensus, with public republication uncleared
(`MARKET_DATA_SOURCES.md`). Expert consensus is stated belief. It is a legitimate comparison
target, and it is weaker evidence than trades.

**6. The documents assert data gaps that do not exist.** Verified today against nflverse:

| Repository claim | Verified state |
|---|---|
| "nflverse publishes no injury feed" | `injuries_2026.csv` exists, 3,097 rows, through week 10, rebuilt today |
| Accessible tier has no snap share | `snap_counts_2026.csv` exists, through week 9 |
| Expected-points metrics have "no free provider" | ffverse `ep_weekly_2026.csv` exists, through week 9, history to 2006 |
| No fumble column in weekly stats | `stats_player_week_2026.csv` carries rushing, receiving and sack fumbles |
| No depth charts, no contract data | `depth_charts_2026.csv` and `historical_contracts.csv.gz` both exist |

The project spent months engineering around a data wall that was partly a failure to list the
provider's releases.

**7. The infrastructure outweighs the product.** The deployed site reads a static JSON export
from a GitHub Action. Behind it sit a scheduler, an HTTP API, an application service layer, a
SQLite store rebuilt from scratch every run (527 MB, 6.6 GB peak memory) and a 5,870-line
inference layer whose main job is deciding which fallback to apply.

## 2. What should survive

| Component | Why |
|---|---|
| Transport: release discovery, RFC 4180 CSV decoding, null-is-not-zero, fetch cache and replay (`src/transport`) | Correct, tested, and every new source needs it |
| Identity resolution through GSIS ids and the crosswalk, including the two-Justin-Jeffersons test | Name joins corrupt data silently |
| Point-in-time discipline: every fact carries an as-of, nothing later may inform it | A backtest is worthless without it |
| League schema, replacement demand and the measured production curve (`src/utility`) | Replacement level comes from league rules and nine seasons of box scores. The Superflex premium falls out of one slot definition |
| Points per team game as the production unit | Charges missed games without a minimum-games filter |
| Shrinkage estimator `(n·observed + k·prior) / (n + k)` | Right tool. `k` and the prior must come from data |
| Market ingestion, append-only history, mandatory attribution, `comparable` and `movementAvailable` flags (`src/market`) | This already suppresses claims when evidence is missing |
| Refusal over guessing: unvalued beats scored-as-zero | Core to the product's honesty |
| Static publish through GitHub Actions and the frontend shell | It works and costs nothing |

Statistical methods worth keeping: regression to a prior, value over replacement, empirical
age curves, rank and percentile comparison against a market.

## 3. What should be replaced

**Unfitted composites.** Nine components, 0 to 100 anchor scales, per-horizon weight tables and
a headline blend produce a number nobody can check against a result. Replace with a projection
in fantasy points, fitted on history.

**Score transformations.** Rate, then shrunk rate, then anchor score, then weighted composite,
then horizon blend, then rank, then curve lookup, then depth adjustment, then 0 to 100
normalization. Seven transformations sit between a carry and a value. Target: three.

**Authored judgment inputs.** `contract_security`, `competition_pressure`,
`organizational_commitment` and role-change flags have no feed. The readiness audit's
recommendation was to hand-author them for 100 players each week. Drop the inputs.

**Confidence by penalty table.** Replace with sample size and the projection's measured error.

**Five horizons.** Weekly, rest of season, one year, three year and dynasty were five
re-weightings of the same components. Keep two outputs: next-game-window points and dynasty
value.

**The tier system.** FULL, ACCESSIBLE and INSUFFICIENT exist to route around engines that
cannot run. One model per position removes the need.

## 4. Decision table

| Component | Decision | Note |
|---|---|---|
| `src/transport`, CSV decoding, release map | **KEEP** | Add release tags for snaps, injuries, ffopportunity |
| Identity resolution (`src/pipeline/identity*`, `src/ingestion/identity*`) | **KEEP** | Add `pfr_id` join for snap counts |
| Point-in-time as-of handling | **KEEP** | |
| `src/utility` league schema, replacement, production curve | **KEEP** | |
| `src/utility/dynastyValue.ts` (rank to curve, depth term, age floor) | **REPLACE** | Value projected points directly (section 5.3) |
| `src/market` ingestion, history, attribution, comparison | **KEEP** | Add a second source only after reading its terms |
| GitHub Actions refresh and static deploy | **KEEP** | |
| Frontend shell, board, player page | **KEEP** | Rebind to the new output document |
| `src/accessible` RB, TE, WR composites, anchors, horizon weights | **REPLACE** | Fitted points projection |
| Age components and authored age curves | **REPLACE** | Empirical curve, applied once |
| Confidence penalty tables | **REPLACE** | Sample size plus measured error band |
| Explanation generators | **REPLACE** | Template over the opportunity and efficiency split |
| `src/inference` (5,870 lines) | **SIMPLIFY** | Keep per-fact source and as-of. Drop fallback ladders, field-confidence aggregation, competition, security, environment inference |
| `src/persistence` SQLite store | **SIMPLIFY** | Flat weekly tables per season. The store is rebuilt every run and persists nothing |
| `src/api`, `src/application`, `src/scheduler` | **SIMPLIFY** | The live site is static. Keep a thin export script, archive the rest |
| `MARKET_MODEL_FOUNDATION_V2.md` (1,126 lines) | **SIMPLIFY** | Keep four objects (expected output, utility, intrinsic value, observed price) and the independence rule. One page |
| `DESIGN.md` | **SIMPLIFY** | Keep product vision and UI. Drop the demo-market engine sections |
| `src/qb-model`, `src/rb-model`, `src/te-model`, `src/wr-model` (10,016 lines) and their four specs | **REMOVE** | Move to an `archive/` path. Out of the production build |
| `AUTOMATED_INFERENCE_LAYER_SPEC_V1.md`, `AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.md` (3,391 lines) | **REMOVE** | Govern a fallback system the new design does not need |
| Model tier selection, readiness frontier, authored-supplement plan | **REMOVE** | |
| Route proxy ladder and `pbp_participation` ingestion | **REMOVE** | Provider releases it after the season. Useless for weekly trends |
| Mock market data service, PRNG price engine, thesis template generator | **REMOVE** | No invented prices on any production path |
| Premium data plan (`FUTURE_DATA_MAP.md`) | **REMOVE** | No evidence of necessity yet. Revisit after the backtest names a specific gap |

## 5. The simplest viable architecture

Four stages. Each has one unit and one test.

```
facts (per player-game)  ->  projection (points/game)  ->  value (discounted points over replacement)
                                                                       |
market observations (independent) --------------------------------> comparison + explanation
```

### 5.1 Facts

One row per player per game, from free files: box score, snaps, expected fantasy points,
team totals, injury status, age, draft slot. Each row keeps its source file and release
timestamp. Derived shares (carry share, target share, snap share) are computed against the
team's totals for that game.

### 5.2 Projection

Output: expected PPR points per game over the next window, with an error band. Position
logic lives in the feature list, and the form stays the same for all four positions.

- **Baseline:** trailing points per game, regressed to a position prior by sample size, plus
  age. Coefficients, prior and `k` are fitted on seasons before the as-of.
- **Admission rule:** a feature (snap share, expected points, draft capital, target share)
  enters only when it lowers out-of-sample error against the baseline. This rule replaces
  every authored weight.
- **Error band:** the standard deviation of backtest residuals, by position and sample size.

A quick check I ran today sets expectations (ffverse `ep_weekly` 2014 to 2025, RBs, fit on
targets through 2021, tested on 2022 to 2025):

| Target | Predictor | Out-of-sample R² | MAE (points/game) |
|---|---|---|---|
| Next-season PPG (8+ games both seasons, n=238) | Prior-season PPG | 0.47 | 3.08 |
| | Prior-season expected points/game | 0.45 | 3.17 |
| | Both | 0.47 | 3.09 |
| Second-half PPG (5+ games each half, n=261) | First-half PPG | 0.58 | 2.99 |
| | First-half expected points/game | 0.55 | 3.07 |
| | Both | 0.58 | 2.97 |

Three lessons. A one-variable model explains about half the variance, and the existing
nine-component composite has never been measured against it. Expected points did not improve
prediction in this cut, so I am not recommending it as a projection input on faith. The sample
excludes players who lost their jobs or got hurt, so real error is larger. Treat these figures
as indicative; the first task reproduces them inside the repository under a stricter protocol.

### 5.3 Value

Common unit for all positions: **discounted fantasy points over replacement**.

```
value = Σ over seasons t  discount^t × games_t × E[ max(0, projected_ppg_t − replacement_ppg) ]
```

- `replacement_ppg` comes from the existing league schema and production curve. No change.
- `projected_ppg_t` is the year-zero projection carried forward along an empirical age curve
  for the position, fitted from the same history and including players who left the league.
- The expectation uses the projection's error band. A player projected below replacement keeps
  positive value because some of his outcomes clear the bar. That replaces the authored depth
  term (`WEIGHT 0.25`, `AGE_FLOOR 0.5`) with arithmetic, and it prices age once.
- `discount` and the number of seasons are league-preference settings. Publish them and show
  the sensitivity, as `UTILITY_LAYER.md` already does for replacement convention.

The 0 to 100 display scale stays a monotone rescale applied last.

### 5.4 Comparison

Model value and market value have different units, so compare percentile within the same
player universe, as `comparison.ts` already does. The market never enters stages 5.1 to 5.3.

A buy-low or sell-high label requires all of the following. Otherwise the board shows the
facts and no label.

1. An authorized market source with a capture inside its freshness window.
2. A projection built on enough games to have a measured error band.
3. A gap larger than the band implies by chance.
4. No blind-spot flag: rookie with fewer than a set number of games, active injury report
   entry, team change since the last game.
5. A passed backtest showing that gaps of that size closed in the model's direction.

Condition 5 is unmet today, so the honest label at launch is "model and consensus disagree",
with the evidence shown. DynastyProcess keeps 362 weekly commits of `values-players.csv` back
to 2019-04-06 (verified), which makes that backtest possible at no cost.

### 5.5 Explanation

Expected fantasy points give an exact accounting identity:

```
points/game = expected points/game (opportunity) + points over expected/game (efficiency)
```

A change between two windows splits into an opportunity change and an efficiency change, and
opportunity splits again into rushing and receiving. Each sentence in an explanation cites a
number from the fact table: "carry share rose from 41% to 63% over the last four games;
expected points rose 4.1 per game; efficiency fell 0.8". No free text, no authored judgment.
Expected points earn their place here even though they did not improve the forecast.

### 5.6 Where this design breaks

- **The market knows things box scores do not.** Draft capital, camp reports, an injury to the
  starter ahead of a backup. A production model will flag those players as mispriced and be
  wrong. The blind-spot flags in 5.4 are the mitigation, and they will suppress many of the
  most interesting names. Expect the model to lose to consensus on rookies.
- **The edge over consensus may be small or zero.** If the backtest in 5.4 shows gaps do not
  close in the model's direction, the product's defensible value is trend detection and
  explanation, and "the market is wrong" comes off the board. Plan for that outcome.
- **Expected points come from a third-party model** (ffverse, xgboost trained on 2006 to
  2020). A silent retrain would shift history. Pin the release timestamp on every run.
- **The strongest argument for the old design:** richer inputs (routes, red-zone role,
  competition) do carry signal that trailing points miss. Agreed. The admission rule in 5.2
  lets each one back in when it proves itself on held-out seasons.

## 6. Data map

"Verified" means I fetched the file on 2026-11-12. Licence statements describe the hosting
repository. Upstream rights are noted where they differ, and none of this is legal advice.

### Free and available

| Need | Source and file | Update | History | Public-use position |
|---|---|---|---|---|
| Box-score usage and production; target share, air yards, fumbles | nflverse `stats_player_week_<season>.csv` | Nightly in season (rebuilt today, week 9 present) | 2025 and 2026 verified; nflverse documents 1999 onward | nflverse-data repository licence is CC BY 4.0 (verified). Attribute |
| Snap share | nflverse `snap_counts_<season>.csv` | Weekly (rebuilt Nov 10) | 2012 onward verified | Same repository licence. Sourced from Pro Football Reference, keyed on `pfr_player_id` |
| Opportunity (expected fantasy points by rush and reception) | ffverse `ep_weekly_<season>.csv` | Weekly (week 9 present) | 2006 onward verified | GPL-3 repository. Third-party model output. Attribute and pin version |
| Availability | nflverse `injuries_<season>.csv` | Daily in season (week 10 present) | 2009 onward verified | Same repository licence |
| Age, position, draft slot, team by week | nflverse `players.csv`, `draft_picks.csv` (1980 to 2026), `roster_weekly_<season>.csv` | Daily | Verified | Same repository licence |
| Schedule, team games | nflverse `games.csv` | Daily | Already ingested | Same |
| Red-zone and goal-line splits | nflverse play-by-play | Nightly | Verified 2025 | Same. Skip until a backtest shows expected points miss something |
| Depth chart rank | nflverse `depth_charts_<season>.csv` | Daily snapshots (74 MB for 2026) | 2001 onward verified | Same. Skip in the prototype |
| Market comparison | DynastyProcess `values-players.csv` (1QB and 2QB values) | Weekly (latest scrape 2026-11-06) | 362 commits since 2019-04-06 | GPL-3 repository. Values derive from FantasyPros expert consensus. **Republication of raw values is uncleared** |

### Available with restrictions: do not build on these yet

| Source | Offers | Issue |
|---|---|---|
| nflverse `nextgen_stats` | Rush yards over expected, 2016 to 2026 (verified) | NFL-owned tracking statistics. Public reuse rights unverified |
| nflverse `pfr_advstats` | Yards before and after contact, broken tackles | Sports Reference terms restrict reuse. Unverified for this use |
| nflverse `ftn_charting` | Play action, screens, catchable ball, drops, 2022 onward (verified) | Carries no route counts. Check FTN attribution terms before display |
| nflverse `contracts` | OverTheCap contract value, APY, guarantees (31,893 rows) | OverTheCap terms unverified. No projection need shown |
| FantasyCalc API | Dynasty values derived from real trades | Blocked by this sandbox's egress policy (HTTP 403 from the proxy). Terms unread. Best candidate for a trade-based second source |

### Unavailable free

| Measurement | Status | Proxy | Premium needed? |
|---|---|---|---|
| Routes run per player, in season | No free feed. `pbp_participation` has no 2026 file (404) and was last rebuilt 2026-02-10 | Snap share with target share | No evidence yet. The 0.47 baseline uses neither |
| Per-player blocking and pressure grades | Licensed charting only | None | No |
| Trade-based market prices with clear republication rights | None verified | Expert consensus | Possibly a licence or written permission. Zero cost to ask |
| KeepTradeCut values | No API. Scraping is out | None | Not pursued |
| Sleeper adds, drops, ADP | Public | Activity signal only. It is not a price | n/a |

**Owner action, no code:** ask the DynastyProcess maintainer and FantasyPros in writing
whether displaying per-player consensus values with attribution is permitted, and read
FantasyCalc's terms from an unrestricted network. Until one answer arrives, the public site
should show rank differences and withhold raw third-party values.

## 7. Smallest end-to-end prototype

A vertical slice for eight running backs, one script, one output document. No UI work.

**Player selection by rule, from 2026 data at the as-of,** so nobody hand-picks flattering
cases: the top two RBs by expected points per game; the two largest risers and two largest
fallers in expected points per game (last four games against the prior span); one rookie; one
RB with an active injury report entry.

**Inputs:** `stats_player_week`, `snap_counts`, `ep_weekly` for 2018 to 2026, `injuries_2026`,
`players`, `draft_picks`, `games`, and the DynastyProcess values file. Each fetch records the
release timestamp and a checksum, and the transport replay cache makes reruns byte-identical.

**What the output shows for each player:**

| Requirement | Demonstrated by |
|---|---|
| Verified supporting statistics | Per-game rows with source file and release timestamp. A check recomputes PPR points from yards, receptions and touchdowns and fails on mismatch with the provider's `fantasy_points_ppr` |
| Opportunity and efficiency over time | Carry share, target share, snap share, expected points per game, points over expected per game: season to date, last four, prior season |
| Reproducible projection | Section 5.2 baseline. Coefficients printed with the training window and the backtest error |
| Cross-position-compatible fair value | Section 5.3 formula against the existing Superflex replacement level. Unit: discounted points over replacement. A QB or WR would run through the same function |
| Independent market comparison | DynastyProcess 2QB percentile against model percentile among RBs, labelled as expert consensus with attribution |
| Why the outlook changed | Section 5.5 split between two as-of dates four weeks apart, one sentence per term, each citing a fact-table value |
| Suppression | Run the slice twice: with the market file and without it. The second run must emit facts and projection and no buy or sell label. Rookie and injured cases must show their blind-spot flag and no label |

**Out of scope for the slice:** other positions, the frontend, persistence, scheduling, depth
charts, play-by-play, any second market source.

## 8. First implementation task

**Build the RB weekly fact table and a backtested baseline projection.**

Scope:

1. Add three release mappings to the existing transport layer: `snap_counts`, `injuries`, and
   ffverse `ep_weekly`.
2. Produce one flat table: RB player-games for 2018 to 2026 with box score, shares, snaps,
   expected points, age at kickoff and draft slot. Join on GSIS id, with `pfr_id` for snaps.
   Report every unjoined row.
3. Fit the section 5.2 baseline with a walk-forward protocol: for each test season, fit on
   earlier seasons only. Include players who did not play the following window, scored as
   zero points per team game, so the survivor bias in my quick check goes away.
4. Emit one report: coefficients, out-of-sample R² and MAE by season, the residual spread by
   sample size, and the same metrics for the current `rb-accessible-1.0` ranking where it can
   run at the same as-of dates.

Acceptance:

- The table reconciles with provider PPR totals for every player-game.
- Rerunning from the replay cache yields an identical report.
- The report states one number, baseline out-of-sample MAE, that every later feature must beat.
- No authored weight appears anywhere in the code path.

Decision the report forces: if `rb-accessible-1.0` beats the baseline, I am wrong about the
composites and section 3 needs revisiting. If it loses or ties, archive it and build section 7
on the baseline.

Stop point: owner review of this document. Nothing here is implemented.
