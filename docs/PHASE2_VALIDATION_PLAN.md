# Phase 2: dynasty model validation plan and first results

Status: **first historical evaluation complete for the development and validation periods. The test period is sealed and has not been evaluated.** No production weights, production board, schedule or deployment changed.

Experiment: `experiments/phase2-baseline-v2/`. The earlier `phase2-baseline-v1` is **invalid** for PlayerTicker (defect P2-D1, §7) and is kept only as evidence.

| Item | File |
|---|---|
| Configuration | `config.json` |
| Data hashes | `data-manifest.json` |
| Frozen predictions | `predictions/*.json` |
| Results | `results/results.json`, `results/tables.md` |

Harness: `src/validation/`, `scripts/backtest/`.

## Summary

**Verdict.** The frozen model is **not validated as better than simple baselines** for dynasty decisions. It is roughly level with them within a position and **worse at cross-position value**, the number the board is sorted by.

Development is 2019–2021 (12 dates); validation is 2022–2023 (5 dates). All figures are Spearman ρ with 95% player-cluster bootstrap intervals. "Relevant tier" means players any model ranks in its top 2N.

| Question | Finding | Evidence |
|---|---|---|
| Within position, among players who matter, does PlayerTicker order players better than baselines? | **No measurable difference.** Every paired interval includes zero. | Relevant tier, two-season target, PT − best baseline: QB −0.05, RB +0.00, WR −0.03, TE −0.04 (development) |
| Across the whole board? | **Better for RB and WR.** It separates fringe players from contributors better than any baseline. | All board players, development, two-season: RB +0.06 [0.02, 0.10], WR +0.05 [0.02, 0.08] |
| Cross-position value (`dynastyValue`)? | **Worse.** | Players with NFL history, two-season value above replacement: −0.11 [−0.16, −0.07] in development, −0.14 [−0.21, −0.07] in validation. Relevant tier: −0.04 [−0.09, 0.00] in development. |
| Offseason boards? | **Worse than last season's total alone,** at every position. That holds on both targets in development and on the one-season target in validation. By Week 12 the gap closes. | §5.4 (point estimates) |
| Rookies before their first game? | **Not on the board at all.** | 0 of 391 QB/RB/WR/TE drafted in 2019–2023 appear on that year's offseason board. Draft slot alone ranks their two-season production at ρ 0.46–0.81 in 15 of 16 position-years. The exception is the 2022 QBs: −0.01, n = 9. |
| Error in season points (calibrated) | Level with the age-adjusted baseline | Validation mean absolute error, PT vs C: QB 53 vs 54, RB 33 vs 33, WR 30 vs 29, TE 24 vs 24 |

**The first model change to test** (§8): measure RB, WR and TE volume per *team* game, so missed games count as zeros, instead of per game played. This changes how one feature is defined; no weight changes.

**Defects found** (§7):
- The replay infrastructure gave every historical board 2019 ages. Production has the same code path.
- A transient nflverse 404 fails a refresh.
- The valuation checksum that gates production promotion changes when nflverse republishes a file, even when no value moves.



## 1. What the model is asked to predict

A dynasty value is a claim about future fantasy production. Phase 2 scores it against realised production, never against expert rankings or market prices. Scoring is the site's declared format: 12-team Superflex, full PPR, regular season only.

| Target | Definition | Why |
|---|---|---|
| **T1**, one-season production | PPR points in the first full horizon season | Near-term value |
| **T2**, two-season production | PPR points across both horizon seasons | Dynasty value over the window a manager plans for |
| **VOR2**, cross-position value | Sum over the two horizon seasons of `max(0, points − replacement)`. Replacement is the realised points of the k-th best player at the position that season: QB 24, RB 35, WR 47, TE 14. | Tests whether `dynastyValue` orders a QB against a WR correctly |
| Multi-year usefulness | Reported through T2 and the stability table. A three-to-five-season target needs outcome seasons the data does not yet have for most decision dates (see §6). | |

**Horizon.**
- At an OFFSEASON date in season S: seasons S and S+1.
- At an in-season date (W4, W8, W12): seasons S+1 and S+2. The rest of season S is a redraft question, not a dynasty one.

**Availability, missed seasons and retirement.** A player with no games in a horizon season scored 0 that season. The harness treats retirement, release, suspension and season-ending injury as realised losses of dynasty value, not as missing data. No player is dropped for failing to play, so a model is not rewarded for ranking players who later vanished.

**Position.** The target uses the position on PlayerTicker's board at the decision date. Replacement levels use each player's main stats position in that season. Section 5 counts the player-dates where these disagree.

## 2. Backtest design

### Decision dates
`src/validation/calendar.ts` derives every decision date from the nflverse schedule; none is typed by hand.

| Checkpoint | Instant |
|---|---|
| OFFSEASON | 7 days before the season's first regular-season kickoff |
| W4, W8, W12 | 12 hours after the last scheduled kickoff of that week |

These are seasons 2019 to 2024 at all four checkpoints, plus the 2025 OFFSEASON: 25 dates.

### Periods
Periods are chronological, assigned by decision season.

| Period | Decision seasons | Use |
|---|---|---|
| Development | 2019, 2020, 2021 | Building and debugging the harness; exploring hypotheses |
| Validation | 2022, 2023 | Choosing between candidate changes |
| Test | 2024, 2025 | **Sealed.** Used once, for a final claim |

**Sealing is enforced in code.**
- Without `--unseal-test "<reason>"` the evaluator skips test-period decisions.
- It never reads a stats file for a test-period season, so no 2024 or 2025 outcome can leak into a validation number.
- Unsealing writes the reason into `results.json`.

**Cost of sealing.** Validation decisions whose horizon reaches 2024 have no outcome for that target:
- 2022 in-season dates have T1 but no T2.
- The 2023 OFFSEASON has T1 only.
- 2023 in-season dates have no outcome at all.

Section 5 reports sample sizes per target.

### What each model may see
- **Frozen PlayerTicker.** `scripts/backtest/predict-playerticker.ts` runs the unchanged production pipeline (`npm run ingest`, then `export:site-data`) at each decision instant: `--as-of <instant>`, the production three-season window and the nine-season career window.
  - The pipeline's own point-in-time machinery applies: schedule kickoff dating, `availableAt` = kickoff + 5h, and as-of filtering of evidence.
  - Each prediction file records the code SHA, publication ID, valuation checksum and capture checksums.
  - The script never edits or tunes the model.
- **Baselines.** These read only games whose `availableAt` is at or before the decision instant. Constants are fixed in `src/validation/baselines.ts` and archived in `results.json`. Section 3 defines them.

### Point-in-time limits, disclosed

The backtest is **not a true point-in-time test**, for these reasons:

1. **Stat corrections.**
   - nflverse republishes each release in place. No archived copy of a release as it stood on a past date exists.
   - Every replay therefore sees box scores with all later corrections applied: stat changes, reassigned fumbles and receptions.
   - Game dating is point-in-time, from the schedule. Publication timing of the stats is not, so the harness cannot establish when nflverse first published a corrected line.
2. **Current-state player table.**
   - `players.csv` reflects players as they are now.
   - The harness reads only time-invariant fields from it: birth date, rookie season and draft round.
   - Its current position can differ from the position a player held in 2019. Section 5 counts these cases.
3. **Draft table.**
   - `draft_picks.csv` carries career-outcome columns: games, AV, Pro Bowls.
   - The harness reads only season, round, pick, ID and position.
4. **Look-ahead in PlayerTicker itself.**
   - The utility layer's production curves were fitted on 2017–2025 seasons.
   - The replacement ranks and the WR and QB fixes were chosen against 2025 data and the 2026 market.
   - So PlayerTicker's cross-position values at 2019–2024 dates are in-sample-influenced, and its results here are, if anything, **optimistic**.
   - The baselines carry no such look-ahead.
5. **The only clean test is forward.**
   - Freezing the model now and scoring it on the 2026 and 2027 seasons as they complete is the one test free of all four problems.
   - Section 8 recommends archiving the current board for that purpose.

### Reproducibility
- `npm run backtest:fetch -- --config … --verify` checks that local nflverse files match `data-manifest.json` (SHA-256 per file). The files are not committed or redistributed.
- `npm run backtest:predict` skips dates that already have a prediction file. A replay of a date reproduces its valuation checksum (§5).
- `npm run backtest:evaluate` is deterministic:
  - no timestamps;
  - bootstrap seed 20261112;
  - numbers rounded to four decimals before hashing.
  `results.json` carries its own SHA-256, and two runs on the same inputs produce the same hash (§5).

## 3. Baselines

All four baselines are fixed a priori. None is fitted to backtest outcomes.

| ID | Baseline | Definition |
|---|---|---|
| A | Previous-season production | PPR points in the last completed season |
| B | Multi-season weighted production | Points per *scheduled* team game over the last three seasons plus any current partial season. Season weight is 0.5^age, and each season is weighted by its scheduled games, so missed games count as zeros. Scaled to 17 games. |
| C | Age-adjusted production | B × the expected year-over-year change at the player's age and position. The curve is fitted at each decision date only on season pairs completed before it: ratio of means among players with 50+ points, pooled to at least 25 pairs, clamped to [0.5, 1.5]. For T2 the multiplier compounds over two seasons. |
| D | Opportunity and efficiency | Recency-weighted opportunities per scheduled game × the player's points per opportunity, shrunk toward the league rate with a 100-opportunity prior. The league rate is fitted on completed seasons before the date. Opportunities are attempts + carries for QB, carries + targets for RB, and targets for WR and TE. |
| E | Frozen PlayerTicker | Within position: the published position rank; unranked players rank last. Across positions: `dynastyValue`. |

For the cross-position target, a baseline's value is `max(0, T2 prediction − 2 × its own implied replacement level)`. That replacement level is its k-th best T1 prediction at the position on that date.

**Scoring check.**
- The harness scores box scores with the site's `PPR_SCORING`.
- On all 5,866 QB/RB/WR/TE player-games of 2021, it matches nflverse's own `fantasy_points_ppr` exactly once fumbles lost, two-point conversions and special-teams touchdowns are added back.
- The site's rules exclude those three, and the harness follows the site.

## 4. Metrics

Each metric is computed within a position on one decision date, then averaged over the dates in a period.

| Metric | Definition |
|---|---|
| Spearman ρ | Rank correlation between prediction and realised outcome |
| Pairwise accuracy | Share of player pairs ordered correctly, among pairs whose outcomes differ by 25+ points. A predicted tie scores half. |
| P@N | Share of the realised top N also in the predicted top N, with N = replacement rank (QB 24, RB 35, WR 47, TE 14; 120 across positions) |
| Calibrated MAE (T1) | Each model's score is mapped to points by decile on development dates, then the absolute error is measured on validation dates |
| Ranking stability | Spearman of the same model's scores between consecutive checkpoints of a season |
| Confidence intervals | Player-cluster bootstrap: 1,000 resamples of players, keeping each player's rows across dates together. Seed 20261112. Each table gives the paired difference "PlayerTicker − best baseline", computed under the same resample. Pairwise accuracy has a point estimate only, because a bootstrap of it costs O(n²) per resample. |

**Populations**, reported separately because they answer different questions:
- **relevant**: players that *any* model places in its top 2N at the position. The selection uses predictions, never outcomes. This is the tier where dynasty decisions are made. **This is the headline population.**
- **history**: players with at least one scoring game available at the date.
- **all**: every board player at the position, including deep reserves that every model ranks near the bottom.

## 5. Results: frozen PlayerTicker against the baselines

Source: `experiments/phase2-baseline-v2/results/` (`tables.md` holds every table, including all five models per cell). Validation two-season (T2) numbers rest on **one decision date** (2022 OFFSEASON), because sealing removes every outcome in 2024 or later. Read them as indicative only.

Choosing the "best baseline" per cell by its point estimate slightly favours the baselines. The age-adjusted baseline C is best in most cells, so treating C as a fixed comparator gives almost the same differences.

### 5.1 Position tables

**Population: decision-relevant tier**

| Period | Pos | Target | Dates | Player-dates | Players | PlayerTicker ρ | Best baseline ρ | PT − best [95% CI] | PT P@N | Best P@N |
|---|---|---|---|---|---|---|---|---|---|---|
| development | QB | T1 | 12 | 744 | 97 | 0.587 | 0.664 (C) | -0.077 [-0.19, 0.02] | 0.70 | 0.76 |
| development | QB | T2 | 12 | 745 | 97 | 0.628 | 0.681 (C) | -0.053 [-0.17, 0.05] | 0.74 | 0.77 |
| development | RB | T1 | 12 | 1169 | 165 | 0.585 | 0.579 (C) | 0.006 [-0.06, 0.07] | 0.65 | 0.65 |
| development | RB | T2 | 12 | 1172 | 164 | 0.617 | 0.614 (C) | 0.003 [-0.07, 0.07] | 0.68 | 0.69 |
| development | WR | T1 | 12 | 1511 | 211 | 0.654 | 0.669 (C) | -0.014 [-0.06, 0.04] | 0.68 | 0.71 |
| development | WR | T2 | 12 | 1519 | 213 | 0.689 | 0.722 (C) | -0.034 [-0.08, 0.02] | 0.69 | 0.76 |
| development | TE | T1 | 12 | 511 | 76 | 0.532 | 0.576 (C) | -0.044 [-0.15, 0.06] | 0.57 | 0.65 |
| development | TE | T2 | 12 | 512 | 76 | 0.595 | 0.633 (C) | -0.038 [-0.14, 0.06] | 0.61 | 0.67 |
| development | ALL | VOR2 | 12 | 4175 | 565 | 0.573 | 0.615 (C) | -0.042 [-0.09, 0.00] | 0.66 | 0.65 |
| validation | QB | T1 | 5 | 313 | 76 | 0.670 | 0.589 (A) | 0.081 [-0.04, 0.21] | 0.76 | 0.66 |
| validation | QB | T2 | 1 | 63 | 63 | 0.679 | 0.774 (A) | -0.095 [-0.25, 0.04] | 0.83 | 0.75 |
| validation | RB | T1 | 5 | 486 | 122 | 0.605 | 0.595 (C) | 0.009 [-0.08, 0.09] | 0.65 | 0.68 |
| validation | RB | T2 | 1 | 95 | 95 | 0.686 | 0.717 (C) | -0.031 [-0.15, 0.07] | 0.71 | 0.66 |
| validation | WR | T1 | 5 | 620 | 149 | 0.706 | 0.729 (C) | -0.023 [-0.09, 0.04] | 0.76 | 0.78 |
| validation | WR | T2 | 1 | 123 | 123 | 0.684 | 0.777 (C) | -0.093 [-0.19, 0.01] | 0.70 | 0.74 |
| validation | TE | T1 | 5 | 193 | 50 | 0.493 | 0.617 (C) | -0.123 [-0.37, 0.09] | 0.59 | 0.54 |
| validation | TE | T2 | 1 | 37 | 37 | 0.518 | 0.569 (C) | -0.051 [-0.31, 0.18] | 0.57 | 0.50 |
| validation | ALL | VOR2 | 1 | 336 | 336 | 0.605 | 0.617 (C) | -0.011 [-0.09, 0.07] | 0.71 | 0.64 |

**Population: every board player**

| Period | Pos | Target | Dates | Player-dates | Players | PlayerTicker ρ | Best baseline ρ | PT − best [95% CI] | PT P@N | Best P@N |
|---|---|---|---|---|---|---|---|---|---|---|
| development | QB | T1 | 12 | 1255 | 144 | 0.651 | 0.642 (C) | 0.009 [-0.05, 0.07] | 0.68 | 0.75 |
| development | QB | T2 | 12 | 1255 | 144 | 0.661 | 0.635 (C) | 0.026 [-0.04, 0.09] | 0.74 | 0.77 |
| development | RB | T1 | 12 | 2897 | 365 | 0.672 | 0.613 (C) | 0.059 [0.02, 0.10] | 0.63 | 0.62 |
| development | RB | T2 | 12 | 2897 | 365 | 0.691 | 0.629 (C) | 0.062 [0.02, 0.10] | 0.65 | 0.66 |
| development | WR | T1 | 12 | 4004 | 488 | 0.660 | 0.603 (C) | 0.057 [0.03, 0.08] | 0.66 | 0.67 |
| development | WR | T2 | 12 | 4004 | 488 | 0.672 | 0.623 (C) | 0.050 [0.02, 0.08] | 0.65 | 0.71 |
| development | TE | T1 | 12 | 2183 | 263 | 0.615 | 0.574 (C) | 0.042 [-0.01, 0.09] | 0.47 | 0.52 |
| development | TE | T2 | 12 | 2183 | 263 | 0.617 | 0.569 (C) | 0.048 [-0.01, 0.10] | 0.54 | 0.57 |
| development | ALL | VOR2 | 12 | 10339 | 1260 | 0.507 | 0.624 (C) | -0.118 [-0.16, -0.07] | 0.64 | 0.59 |
| validation | QB | T1 | 5 | 545 | 123 | 0.658 | 0.614 (A) | 0.044 [-0.02, 0.12] | 0.70 | 0.64 |
| validation | QB | T2 | 1 | 113 | 113 | 0.662 | 0.758 (A) | -0.096 [-0.19, -0.01] | 0.79 | 0.75 |
| validation | RB | T1 | 5 | 1245 | 284 | 0.624 | 0.570 (C) | 0.054 [0.00, 0.11] | 0.63 | 0.66 |
| validation | RB | T2 | 1 | 248 | 248 | 0.638 | 0.757 (A) | -0.119 [-0.20, -0.04] | 0.71 | 0.60 |
| validation | WR | T1 | 5 | 1703 | 398 | 0.701 | 0.693 (C) | 0.009 [-0.02, 0.04] | 0.76 | 0.78 |
| validation | WR | T2 | 1 | 350 | 350 | 0.662 | 0.763 (A) | -0.100 [-0.15, -0.05] | 0.68 | 0.72 |
| validation | TE | T1 | 5 | 927 | 214 | 0.637 | 0.606 (C) | 0.030 [-0.05, 0.10] | 0.56 | 0.54 |
| validation | TE | T2 | 1 | 190 | 190 | 0.547 | 0.753 (A) | -0.206 [-0.32, -0.10] | 0.57 | 0.43 |
| validation | ALL | VOR2 | 1 | 901 | 901 | 0.504 | 0.650 (C) | -0.146 [-0.22, -0.07] | 0.70 | 0.57 |


### 5.2 Sample sizes
Player-dates with a one-season outcome:

| | QB | RB | WR | TE |
|---|---|---|---|---|
| Development | 1,255 | 2,897 | 4,004 | 2,183 |
| Validation | 545 | 1,245 | 1,703 | 927 |

Validation player-dates with a two-season outcome: QB 113, RB 248, WR 350, TE 190.

`results.json → sampleSizes` breaks these down by season × position and by experience × position.

Experience counts include year 1: QB 95, RB 371, WR 471, TE 197. Only 18 player-dates have a board position that differs from the player's main stats position, so current-state position reclassification is negligible.

### 5.3 Subgroups (one-season target, all board players)

| Subgroup | Finding |
|---|---|
| Year-2 RB and TE | PlayerTicker trails the baselines in both periods. RB: development 0.64 vs 0.74, validation 0.65 vs 0.69. TE: development 0.52 vs 0.58, validation 0.69 vs 0.80. |
| Rookie-season QB (development) | Level with the best baseline: 0.74 vs 0.73 (D) |
| No games last season | PlayerTicker is far better at every position, for example RB 0.57 vs 0.35 in development. It uses information the baselines lack: roster status, career and draft data. |
| Played 75%+ last season (QB) | Contradictory between periods. Development is 0.36 vs 0.55 for C; validation is 0.68 vs 0.42. One player drives the development figure: Tom Brady, ranked QB38–52 at all 12 development dates while his realised two-season production ranked 3rd–7th in the relevant tier. Treat it as one case, not a pattern. |

### 5.4 Offseason against in-season

Relevant tier, development, Spearman ρ:

| Target | Checkpoint | QB (PT / A / C) | RB (PT / A / C) | WR (PT / A / C) | TE (PT / A / C) |
|---|---|---|---|---|---|
| T1 | OFFSEASON | 0.48 / **0.70** / 0.64 | 0.56 / **0.69** / 0.61 | 0.63 / **0.72** / 0.66 | 0.43 / 0.48 / **0.54** |
| T1 | W12 | 0.65 / 0.47 / **0.70** | **0.60** / 0.33 / 0.58 | **0.68** / 0.37 / 0.68 | 0.59 / 0.29 / **0.60** |
| T2 | OFFSEASON | 0.53 / **0.75** / 0.67 | 0.61 / **0.72** / 0.67 | 0.67 / **0.74** / 0.71 | 0.56 / 0.58 / **0.69** |
| T2 | W12 | 0.69 / 0.49 / **0.71** | **0.63** / 0.31 / 0.61 | 0.71 / 0.37 / **0.73** | **0.64** / 0.28 / 0.64 |

- **Offseason.** Last season's total (A) beats PlayerTicker at every position on both targets. Validation agrees on T1 at all four positions.
- **In-season.** By Week 12 PlayerTicker is level with the best baseline.
- **The cause is not the evidence window.** A replay of 2021-OFFSEASON confirms the model reads 2020 as each player's latest season.
- **Missed games matter.** Last season's points per game *played* rank worse than last season's *total* in 7 of 8 position-period cells, by 0.02–0.15, and tie in the eighth. PlayerTicker's volume components are per game played, and RB availability has zero dynasty weight. This is the basis for the first change (§8).

### 5.5 Cross-position value

`dynastyValue` orders players across positions worse than the baselines' simple "points above own replacement" value: −0.11 to −0.15 in every population with NFL history, in both periods.

PlayerTicker's top-120 position mix matches the realised mix well, for example validation 28/33/46/13 vs realised 28/33/45/14 (QB/RB/WR/TE). So the error is in ordering *within* the value scale, not in how many of each position it values. 78% of player-dates have `dynastyValue` < 1, so the scale is compressed below the starter tier.

**This result is likely optimistic for PlayerTicker.** Its production curves were fitted on 2017–2025 seasons, so it has seen outcomes the baselines have not.

### 5.6 Ranking stability

Between consecutive checkpoints of a season, PlayerTicker's scores correlate at 0.90–0.93; the baselines' at 0.98–0.99. PlayerTicker moves more between checkpoints. Its accuracy rises from the offseason to Week 12 (§5.4); whether the movement itself helps is not separately tested.

## 6. Reproducibility evidence

| Check | Result |
|---|---|
| Input files | `npm run backtest:fetch -- --config experiments/phase2-baseline-v2/config.json --verify`: all 18 files match `data-manifest.json`. |
| Evaluation determinism | Two full runs on the same inputs produced byte-identical `results.json`. v1: sha256 `f9ba5f8c…` both times. v2: sha256 `3c841141…` both times. |
| Replay determinism | 2021-W8 replayed independently into a fresh capture store reproduced **every value, rank and tier of all 847 players**. The board's `valuationChecksum` still differed: it includes input-provenance hashes, and nflverse republished the 2026 schedule rows between the two runs. Prediction files now carry `predictionChecksum` over values only (P2-D5). |
| Point-in-time dating | Every v2 prediction records `payloadsWithOtherEffectiveDate = 0`. The predictor refuses a date otherwise. |
| Code | Predictions ran on `e4dc3a0` (PR #12 head). The branch changes only `src/validation`, `scripts/backtest`, `experiments`, docs and `package.json` scripts; `git diff e4dc3a0 -- src ':!src/validation'` is empty. |

## 7. Defects found during validation

| ID | Defect | Where | Effect | Status |
|---|---|---|---|---|
| **P2-D1** | On HTTP 304 the transport reuses the cached envelope verbatim, including its `effectiveDate`. The nflverse adapter derives `age` and `nfl_seasons_completed` from that date. | `src/transport/refresh.ts:228`, `src/ingestion/adapters/nflverse.ts:238-244` | **Backtest:** v1 valued every date with October 2019 ages (Herbert QB37 → QB6 once fixed). **Production:** ages and experience lag by however long the players export has gone unchanged, at most days. It becomes wrong across a season boundary, which drives experience. | Harness fixed (isolated captures, asserted). **Production not changed.** Proposed fix: derive age and experience from the run's as-of instant, not the payload's. |
| **P2-D2** | nflverse replaces a release asset by delete-then-upload. A request in that window gets 404, which the transport treats as non-retryable, failing a *required* source. | `src/transport/client.ts:146` | A scheduled refresh landing in the window publishes nothing. Observed twice today, during a live game. | Harness retries once. Production: proposed bounded retry on 404 for release assets. |
| **P2-D3** | When the rookie season is later than the as-of date, `nfl_seasons_completed` falls back to the provider's **current** `years_exp`. | `nflverse.ts:243-244` | Current-state leak into historical replays. In production it only affects players with missing data. | Open |
| **P2-D4** | No drafted rookie appears on an offseason board before his first NFL game. | Board population | A dynasty board without the incoming class during the draft-to-Week-1 window | Open (experiment B) |
| **P2-D5** | The valuation checksum includes `normalizedInputChecksum` and `outputChecksum`. | `src/ops/valuationChecksum.ts` | The PR #12 promotion guard binds owner approval to this checksum. A daily nflverse republish changes it with **no** valuation change, so approvals go stale in hours. | Open. Proposed: approve a checksum over valuation fields only. |

## 8. Experiments, ranked

Each experiment changes one thing, keeps every other component frozen, and is compared with the frozen model on the same dates, metrics and seeds.

- **Development** may be used freely.
- **Validation is spent for experiment 1.** I looked at validation results while forming that hypothesis, so its confirmatory test is the sealed test period, run once and reported whatever it shows.
- **Experiments 2–5** have not been tuned against validation yet.

| Rank | Experiment | Evidence | Expected gain | Cost |
|---|---|---|---|---|
| **1** | **A. Offseason evidence: volume per team game.** RB/WR/TE role-window volume rates divide by the team's scheduled games in the window, so missed games count as zero (same shrinkage), instead of by games played. | §5.4: PlayerTicker loses to last-season total at every offseason cell. Per-game-played loses to total in 7/8 cells. | Offseason relevant-tier ρ +0.05 to +0.10 if the mechanism is right | Low: one feature definition in `src/accessible/{rb,wr,te}.ts`. No new data, no weights. |
| 2 | **E. Cross-position value.** Refit the utility production curves per decision date on seasons before it only; separately, test the replacement levels. | §5.5: −0.11 to −0.15, significant in both periods | Removes look-ahead; may close part of the gap | Medium: utility layer plus per-date fitting |
| 3 | **B. Rookies and young RB/TE.** Value drafted rookies from draft slot before their first game (separate population, §5 of the rookie table); add a draft-capital prior to RB/TE. | P2-D4; draft slot ρ 0.46–0.81; year-2 RB/TE trail baselines in both periods | Covers a missing population; small gain for year-2 players | Medium: `draft_picks` is already ingested |
| 4 | **D. QB attribution and passing quality.** Play-by-play starter attribution, then measured passing-quality features. | Weak after the v1 contamination was removed. Relevant-tier QB differences include zero in both periods. Phase 1 found attribution gaps in 49 of 544 team-games in 2024, but their effect on outcomes is not measurable here. | Uncertain | High: play-by-play ingestion |
| 5 | **C. Injuries: short-term vs dynasty.** | No defect visible. PlayerTicker beats every baseline for players who missed last season. Historical injury designations are not point-in-time in the free data. | Low | Medium |

**The first single change to test is experiment 1.** Pre-registered success criterion:
- Offseason relevant-tier ρ on T2 improves on the frozen model in development at 3 or more of 4 positions.
- In-season (W4–W12) ρ does not fall by more than 0.02 at any position.
- Then one run on the sealed test period, reported whatever it shows.

## 9. Behaviour status

| Status | Behaviour |
|---|---|
| **Validated**: better than the best baseline, interval excludes zero | Ordering across the whole RB and WR board, one- and two-season targets, development: RB +0.06 [0.02, 0.10], WR +0.05 [0.02, 0.08]. RB one-season in validation: +0.05 [0.00, 0.11]. |
| **Level with baselines**: point estimates only, or intervals spanning zero | Within-position ordering of the decision-relevant tier at every position. Calibrated season-point error. In-season (Week 12) ordering. Valuing players who missed the previous season: point estimates clearly better, but no subgroup intervals. |
| **Not validated**: too little data | TE (wide intervals). QB (contradictory subgroups, one dominant player). Anything beyond two seasons: outcome data does not exist yet for most dates. Validation two-season results (one date). The 2024–2025 test period (sealed). Any claim of point-in-time accuracy (§2). |
| **Worse than baselines** | Cross-position `dynastyValue` ordering: interval excludes zero in both periods for players with NFL history. Offseason ordering at every position (point estimates, consistent across 12 cells: development on both targets, validation on the one-season target). Year-2 RB and TE (point estimates, both periods). |
| **Defective** | P2-D1 to P2-D5 (§7) |

## 10. Governance

- **Frozen baseline.** PlayerTicker at `e4dc3a0` is the reference implementation. Its predictions are archived per date with code SHA, effective-date assertion and checksums. Baseline constants are archived in `results.json`.
- **No hand-tuned weights.** No model weight changed in this phase. Experiments change one feature definition or refit a component on development data by a stated procedure.
- **Test period.** It is sealed in code and has not been opened. Opening it requires `--unseal-test "<reason>"`, which is recorded.
- **Data.** No premium data, invented statistics or manual player values. nflverse files stay local and are not redistributed; only hashes are committed.
- **Not done, by instruction.** No production weight change, board promotion, schedule reactivation, merge or deployment.

