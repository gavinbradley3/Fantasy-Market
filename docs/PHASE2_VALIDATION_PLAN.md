# Phase 2: dynasty model validation plan and first results

Status: **DRAFT. Results pending: frozen predictions are still being generated.** Production weights, the production board, schedules and deployment are untouched.

Experiment: `experiments/phase2-baseline-v1/`.

| Item | File |
|---|---|
| Configuration | `config.json` |
| Data hashes | `data-manifest.json` |
| Frozen predictions | `predictions/*.json` |
| Results | `results/results.json`, `results/tables.md` |

Harness: `src/validation/`, `scripts/backtest/`.

<!-- RESULTS-SUMMARY -->

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

<!-- RESULTS-BODY -->
