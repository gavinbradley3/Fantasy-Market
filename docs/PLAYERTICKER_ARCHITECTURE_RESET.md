# PlayerTicker Architecture Reset

Status: revision 2, for owner review. No production code, model weight, merge or deployment.
Date: 2026-11-12.

Evidence base: `main` @ `084cbab`; `docs/PHASE1_RECOVERY_AUDIT.md`
(branch `claude/playerticker-audit-phase-1-xbuowi`); PR #14 (`claude/phase2-validation`):
`docs/PHASE2_VALIDATION_PLAN.md`, `docs/MODEL_SANITY_INVESTIGATION.md`, `src/validation/`,
`scripts/backtest/`, `experiments/phase2-baseline-v1` and `-v2`.

## 0. Recommendation

**Keep the frozen PlayerTicker pipeline as the incumbent benchmark. Build one challenger inside
the existing Phase 2 harness: a projection of points per scheduled team game, split into
playing time and scoring rate, valued as points above replacement. Promote it only if it beats
the incumbent on the sealed test period, in one run.**

The Phase 2 evidence already points there. The age-adjusted baseline (C) ties the incumbent
within position where decisions get made, and its plain points-above-replacement value beats
`dynastyValue` across positions by 0.11 to 0.15 Spearman in both periods, with intervals that
exclude zero. The value layer is the weakest link. The position models are the strongest.

**First task:** add challenger F to `src/validation` and score it on the 17 development and
validation dates (section 7).

## 1. Corrections to revision 1

| Revision 1 said | Correct position |
|---|---|
| "No backtest exists" | Wrong. I reviewed `main` only. PR #14 holds a harness with 25 decision dates, four baselines, a sealed test period, bootstrap intervals and deterministic output |
| Phase 1 and Phase 2 documents do not exist | Wrong. Both exist on unmerged branches. I did not fetch them |
| Replace the accessible composites | Unsupported. They are level with the best baseline in the decision tier and better across the whole RB and WR board (+0.06 [0.02, 0.10], +0.05 [0.02, 0.08]) |
| Remove the four position engines and their specs | Reversed. Freeze them as benchmarks |
| Simplify persistence, API, scheduler, inference | Withdrawn. `backtest:predict` replays the unchanged production pipeline. Cutting it destroys the benchmark |
| First task: build an RB fact table and a new backtest | Withdrawn. Baselines B and C already are that model, scored without survivor bias |
| My RB table (prior PPG, R² 0.47) | Void. It kept only players active in both windows, and it read 2024 and 2025 outcomes, which Phase 2 seals. No choice in this revision rests on it. Treat any expected-points question as open and decide it on development dates only |
| `historical_contracts.csv.gz` is current | Wrong. Phase 1 found it frozen at May 2022. The Parquet file is current |

Revision 1 got three things right, and Phase 1 or Phase 2 confirms each: the utility layer
discards model output (rank only), the "missing data" is mostly missing ingestion, and market
republication rights are unresolved.

## 2. What the existing research establishes

| Finding | Source |
|---|---|
| Decision tier, within position: incumbent minus best baseline is QB −0.05, RB +0.00, WR −0.03, TE −0.04 on the two-season target. Every interval includes zero | Phase 2 §5.1 |
| Whole board: incumbent better for RB and WR. Its edge sits in players with little or no prior-season play (RB, no games last season: 0.57 against 0.35) | Phase 2 §5.1, §5.3 |
| Cross-position `dynastyValue`: worse than baseline C by 0.11 to 0.15 for players with NFL history, both periods. 78% of player-dates carry a value below 1 | Phase 2 §5.5 |
| Offseason boards: last season's total beats the incumbent at every position. Points per game played loses to season total in 7 of 8 cells. Missed games carry information | Phase 2 §5.4 |
| Rookies: 0 of 391 drafted players appear before their first game. Draft slot alone ranks their two-season output at ρ 0.46 to 0.81 in 15 of 16 position-years | Phase 2 summary |
| Incumbent ranks move more between checkpoints (0.90 to 0.93 against 0.98 to 0.99) with no tested benefit | Phase 2 §5.6 |
| A player's rank can move with an unchanged composite, through pool changes and the steep curve near replacement (RB30 = 8.0, RB36 = 1.9) | Sanity investigation |
| QB runs on 16 substituted inputs per player. Role and age decide QB order | Phase 1 B6, sanity investigation |
| Free snap share tracks true dropback participation at r 0.94 to 0.97 | Phase 1 F2 |

Limits that bound every claim above: validation two-season results rest on one decision date,
TE intervals are wide, and nothing beyond two seasons has outcome data yet.

## 3. Decisions

| Component | Decision | Basis |
|---|---|---|
| `src/validation`, `scripts/backtest`, experiment archives | **KEEP** | The evaluation system. No second one |
| Frozen incumbent at `e4dc3a0`: QB engine, accessible RB/WR/TE, inference, persistence, transport | **FREEZE** | Benchmark E. Reproducible by `backtest:predict`. No weight or feature changes |
| Four original position specs and engines | **FREEZE** | Reference only. RB and TE engines value 0 players, so E is the working benchmark |
| Baselines A to D and their archived constants | **KEEP** | C is the standing challenger |
| `src/utility` league schema, replacement ranks | **KEEP** | Top-120 position mix matches reality (28/33/46/13 against 28/33/45/14) |
| `dynastyValue.ts` rank-to-curve conversion and depth term | **REPLACE** | Loses by 0.11 to 0.15. Replace only through the harness |
| Production curves fitted on 2017 to 2025 | **SIMPLIFY** | Refit per decision date on prior seasons. Today they leak (section 5) |
| Transport, identity, point-in-time resolution, capture and replay | **KEEP** | Phase 1 E. Fix P2-D1, P2-D2, P2-D3 |
| `src/market` ingestion, history, attribution | **KEEP** | Private until rights clear |
| Rookie coverage | **ADD, second** | Draft-slot value, separate population. Phase 2 experiment B |
| Confidence labels | **REPLACE** | Hold until calibrated against backtest error. Phase 1 K3 |
| `pbp_participation` as a required source | **SIMPLIFY** | Optional, offseason only (PR #12) |
| Simulated market pages, invented notes, buy and sell lists on real names | **REMOVE** | Phase 1 B3. PR #11 |
| Hand-curated supplement plan (`READINESS_FRONTIER_AUDIT.md`) | **REMOVE** | Phase 1 E rejects it |
| Phase 2 experiment 1 as a patch to the accessible models | **SUPERSEDE** | Its hypothesis (missed games count as zeros) lives in challenger F. The incumbent stays untouched |
| Premium data | **DEFER** | No evidence of necessity |

## 4. Architecture

```
facts -> projection (playing time x scoring rate) -> value (points above replacement)
                                                           |
market observations (independent) -----------------> comparison -> explanation
```

### 4.1 Projection: playing time and scoring rate

Target: fantasy points per **scheduled team game**. A missed game scores zero. Retirement,
release and injury count as outcomes, exactly as `outcomes.ts` scores them.

```
projected season points = 17 x expected games share x expected points per game played
```

- **Games share:** games played over team games scheduled, recency weighted. The fit includes
  players who never played again, at share zero.
- **Scoring rate:** points per game played, recency weighted. The fit can only use players who
  played, because a rate needs a game. The games-share term carries the risk of not playing.
  Evaluation stays unconditional.
- **Regression and age:** each part regresses toward its position mean and takes an age
  adjustment. Both are fitted at each decision date on season pairs completed before it, by
  the procedure `fitAgeCurve` already uses. No authored weight.
- **Constants:** reuse `BASELINE_CONSTANTS` as archived (three seasons, one-season half-life,
  17 games, 25-pair pooling).

Baseline B already equals games share times rate by identity. Challenger F tests one idea:
the two parts persist at different strengths, so forecasting them separately should help.
If it does not help, C stands as the projection.

Position logic enters as admitted features, one per experiment, each scored against the
standing challenger: draft slot for players with thin history, snap share, roster status.
The incumbent's edge on low-availability players says roster and career information matters.

### 4.2 Value

```
value = sum over horizon seasons of max(0, projected points - replacement points)
```

Replacement is the k-th best projection at the position (QB 24, RB 35, WR 47, TE 14). This is
the rule that already beats `dynastyValue` in the harness. One unit for every position.

Two known weaknesses to measure, not assume away:

- Baseline values under-count QBs in the top 120 (21 to 23 against 25 to 28 realised).
- A hard floor at zero cannot separate players below replacement. An option-value term may
  enter only if it improves the cross-position target on the history population.

Horizon: two seasons, because no longer outcome exists. Label it that way on the site.

### 4.3 Market comparison: three separate claims

| Claim | Meaning | Required evidence |
|---|---|---|
| **Rank disagreement** | Model and market order a player differently | An authorized, fresh market capture |
| **Value gap** | The disagreement is worth something in a trade | The gap, in market units, exceeds model and market noise |
| **Buy-low or sell-high** | The market will move toward the model | A backtest showing gaps of that size closed in the model's direction |

Rank and percentile differences mislead because value is steep at the top and flat at the
bottom. Six RB ranks near replacement move value from 8.0 to 1.9. Twenty ranks deeper move
almost nothing.

**Value gap, defined without inventing a scale:** read the market's own value at the model's
rank for that player, within the same universe, and subtract the player's market value. The
result says what the market would charge for a player the model ranks there. Report it with a
band: the projection error from the harness, carried through to rank, against the market's own
week-to-week movement.

**Suppression:** no market capture means facts and projection only. A gap inside its band
shows as a rank disagreement only. Rookies before their first game, players on injured reserve
and team changes since the last game carry a blind-spot flag and no label. Buy-low and
sell-high stay off until the third row's backtest exists.

**Real market movement** comes from consecutive captures of the same source. Fewer than two
captures means no movement shown (`movementAvailable` already enforces this).

### 4.4 Explanation: two ledgers, never merged

**Ledger 1, observed changes.** Facts from the box score between two dates: carries, targets,
snap share, games missed, team. Each cites its source file and release timestamp. Each carries
a tag: *model input* or *context only*. A context-only fact never appears as a reason.

**Ledger 2, projection drivers.** The exact arithmetic of the value change, by sequential
substitution in a fixed order, so the terms sum to the total:

1. New games entering the window (scoring rate)
2. Games missed (games share)
3. Recency reweighting and season rollover
4. Age adjustment
5. Replacement level moved (other players' projections changed)
6. Player pool changed
7. Fitted parameters refit
8. Provider corrected a past stat line

Drivers 3 to 8 involve no football event for the player. The sanity investigation found
exactly this: Hurts moved 12 to 22 on an unchanged composite. An explanation that reports only
ledger 1 would have invented a reason.

Reuse `scripts/explain-players.ts` (contributions from persisted artifacts) and
`src/ops/rankingChange.ts` (movement between boards).

## 5. What could undermine this

**Leakage**

| Risk | Status |
|---|---|
| nflverse republishes files in place. Replays see later stat corrections | Disclosed in Phase 2 §2. Unfixable backward. Archive boards forward from now |
| HTTP 304 reuses a cached envelope's date, so ages freeze (P2-D1) | Harness fixed. Production open |
| `years_exp` fallback and current-state position in `players.csv` (P2-D3) | Open. 18 position mismatches measured |
| Production curves and replacement choices fitted on 2017 to 2025 | Flatters the incumbent's cross-position result. Refit per date |
| ffverse expected points come from a model trained on 2006 to 2020 | In-sample for 2019 and 2020 decision dates. Context only until tested on later dates |
| Injury designations are not point-in-time in free data | Roster status only in backtests |
| Validation period already read while forming hypotheses, including challenger F | The confirmatory test is the sealed test period, once |
| Revision 1's ad hoc check read 2024 and 2025 RB outcomes | Voided in section 1 |

**Licensing**

- nflverse-data repository: CC BY 4.0. Attribute visibly. Snap counts originate with Pro
  Football Reference, contracts with OverTheCap, charting with FTN. Confirm terms before any
  paid product.
- ffverse expected points: GPL-3 repository, third-party model output.
- DynastyProcess: GPL-3 repository over FantasyPros consensus. `market-latest.json` sits in
  the public deploy today (Phase 1 B12). Remove it and ask both parties in writing.
- FantasyCalc: trade-based, terms unread, unreachable from this environment.
- Backtest inputs stay local. Commit hashes only, as PR #14 does.

**Assumptions**

- Two seasons stand in for dynasty value.
- Expert consensus stands in for market price. It is stated belief, with no trades behind it.
- Rank correlation measures order and ignores magnitude. A value-gap claim needs the
  calibrated error too (validation MAE: QB 53, RB 33, WR 30, TE 24 points per season).
- The market may be efficient against a box-score model. If gaps do not close in the model's
  direction, the product is fair value, real movement and verified explanation, without
  buy-low or sell-high.

## 6. Data required

| Purpose | Source | In the harness today |
|---|---|---|
| Production, games played, opportunities | nflverse `stats_player_week` 2012 to 2026 | Yes |
| Team games scheduled, decision dates | nflverse `games.csv` | Yes |
| Age, rookie season, draft slot | nflverse `players.csv`, `draft_picks.csv` (allowed columns only) | Yes |
| Roster status | nflverse `roster_weekly` | Through the frozen pipeline |
| Snap share | nflverse `snap_counts`, 2012 onward | No. Admit by experiment |
| Opportunity context | ffverse `ep_weekly`, 2006 onward | No. Context only |
| Current injuries | nflverse `injuries` | No. Live board only |
| Market comparison | DynastyProcess, weekly, 362 commits since 2019-04-06 | No. Private until cleared |
| True routes, grades | Licensed only | Deferred |

Challenger F needs no new source.

## 7. First implementation task

**Add challenger F to the existing harness and score it against C and E.**

Branch from `claude/phase2-validation`. Touch `src/validation`, `scripts/backtest` and a new
`experiments/phase2-challenger-f/` only. `git diff` against production `src` stays empty.

Scope:

1. Add model `F_two_part` beside the baselines: section 4.1 as written, with section 4.2
   value. Every fitted quantity uses season pairs completed before the decision date.
2. Extend the evaluator to print paired differences F minus C and F minus E, same bootstrap,
   same seed.
3. Run the 17 development and validation dates. The test period stays sealed.
4. Add a leakage test: F at a decision date reads no game with `availableAt` after it.

Success criteria, fixed now:

- Decision tier, two-season target, development: F at or above C at 3 of 4 positions.
- Cross-position value, history population: F minus C interval not below zero, and F minus E
  interval above zero.
- Report top-120 position mix and whole-board RB and WR against E, whatever they show.

Outcome:

- F passes: F is the challenger. Next experiment adds the draft-slot rookie value.
- F fails: C is the challenger, the two-part split is dropped, same next experiment.
- E stays the published model until a challenger beats it on the sealed test period.

## 8. Prototype slice, after the first task

Eight running backs chosen by rule from the live board: two highest values, two largest value
rises and two largest falls over four weeks, one rookie, one on injured reserve. One script,
one output document per player:

| Must show | How |
|---|---|
| Verified statistics | Game rows with source file and release timestamp, reconciled to provider PPR totals |
| Opportunity and efficiency over time | Games share, carries, targets, snap share, points per game played, by window |
| Reproducible projection | Challenger output with fitted parameters and harness error |
| Cross-position fair value | Section 4.2, same function for every position |
| Market comparison | Rank disagreement and value gap with band, when a cleared capture exists |
| Why the outlook changed | Both ledgers from section 4.4 |
| Suppression | Second run without market data emits no gap and no label. Rookie and injured cases show their flag |

## 9. Owner decisions

1. Approve the first task on the PR #14 branch.
2. Confirm the incumbent stays frozen and published models change only after a sealed-test win.
3. Remove `market-latest.json` from the public deploy and request written permission.
4. Decide PR #11 and PR #12. The harness is stacked on #12, so this work inherits that base.
5. Start archiving each published board with its date. The 2026 and 2027 seasons are the only
   leak-free test available.
