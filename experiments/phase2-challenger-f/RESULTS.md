# phase2-challenger-f: results

2026-11-12. Research only. No production weight, board, schedule or deployment changed.
The 2024 to 2025 test period stayed sealed: outcome seasons read through 2023.

**Everything here is exploratory.** Development and validation outcomes had been read before
challenger F was designed. Validation two-season and cross-position figures rest on one decision
date (2022 offseason).

Full tables: `results/tables.md`. Machine-readable: `results/results.json`
(sha256 `b69e998a…`). Same 17 decision dates, targets, populations, bootstrap (1,000
player-cluster resamples, seed 20261112) as `phase2-baseline-v2`, scored on its frozen
predictions.

## Decision

**Continue investigating F as the research challenger. Do not carry the incumbent's
cross-position conversion forward. Keep the incumbent's position ordering as the bar F has to
clear.**

Three findings drive it:

1. **The incumbent's cross-position weakness is its conversion, not its player ordering.**
   Keeping the incumbent's position ranks and swapping only the conversion lifts cross-position
   Spearman by +0.10 [0.07, 0.14] in development and +0.16 [0.10, 0.22] in validation. With the
   conversion held equal, baseline C's ordering is not measurably better than the incumbent's.
2. **F meets the criteria fixed in the architecture document.** It is at or above C in the
   decision tier at 4 of 4 positions (development, two-season target), level with C on
   cross-position value, and above the incumbent on cross-position value by +0.13 [0.10, 0.17].
3. **F has not beaten the incumbent's ordering once that ordering gets a sound conversion.**
   F minus revised-conversion incumbent: +0.027 [−0.00, 0.06] in development, −0.015
   [−0.08, 0.06] in validation. No published change is justified.

## What was compared

| ID | Ordering | Cross-position conversion |
|---|---|---|
| `E_playerticker` | Frozen incumbent | Incumbent `dynastyValue` |
| `E_curve_value` | Frozen incumbent, unchanged | Rank r is worth the mean realised points of the r-th best player at the position over the three seasons before the date; value = 2 × points above the replacement rank |
| `E_matched_value` | Frozen incumbent, unchanged | Rank r takes C's r-th best prediction, then C's conversion. Differs from C in ordering only |
| `C_age_adjusted` | Baseline C | Archived harness rule: two-season prediction minus 2 × replacement |
| `C_season_value` | Baseline C, unchanged | Per-season rule: each season's prediction against that season's replacement |
| `F_two_part` | Challenger F | Per-season rule |
| `F_harness_value` | Challenger F, unchanged | Archived harness rule |

Challenger F: season points = 17 × expected games share × expected points per game played.
Each part is a least-squares line plus an age adjustment, fitted at each decision date on
seasons completed before it. A player who did not play the later season enters the games-share
fit at zero. Fitted lines are archived in `results.json → challengers.twoPartFits`.
Evaluation counts every non-playing season as zero, as before.

## 1. Ordering or conversion?

Cross-position target (two-season value above realised replacement), Spearman ρ.

| Comparison | Isolates | Development, history (12 dates, 9,769 player-dates) | Validation, history (1 date, 839) |
|---|---|---|---|
| `E_curve_value` − E | Conversion | **+0.104 [0.07, 0.14]** | **+0.160 [0.10, 0.22]** |
| `E_matched_value` − E | Conversion | **+0.086 [0.04, 0.13]** | **+0.140 [0.07, 0.21]** |
| C − `E_matched_value` | Ordering | +0.025 [−0.01, 0.06] | −0.004 [−0.07, 0.06] |

In the decision tier the conversion effect shrinks and its interval reaches zero: +0.027
[−0.00, 0.05] in development, +0.033 [−0.02, 0.09] in validation. The incumbent's conversion
loses most among players below the starter tier, where it hands graded values to deep reserves
across positions and the realised value is zero for nearly all of them.

**Answer: conversion. Ordering is not the cause.**

## 2. Cross-position performance

| Model | Dev, history ρ | Dev, decision tier ρ | Val, history ρ | Val, decision tier ρ | P@120 dev / val (history) |
|---|---|---|---|---|---|
| E (incumbent) | 0.513 | 0.566 | 0.512 | 0.608 | 0.64 / 0.70 |
| E, curve conversion | 0.617 | 0.593 | 0.672 | 0.641 | 0.64 / 0.68 |
| E, matched conversion | 0.599 | 0.579 | 0.653 | 0.630 | 0.57 / 0.58 |
| C, harness rule | 0.625 | 0.614 | 0.649 | 0.621 | 0.59 / 0.58 |
| C, per-season rule | 0.651 | 0.635 | 0.637 | 0.604 | 0.68 / 0.67 |
| F, per-season rule | 0.644 | 0.619 | 0.658 | 0.593 | 0.68 / 0.69 |
| F, harness rule | 0.614 | 0.588 | 0.592 | 0.526 | 0.60 / 0.56 |

| Paired difference | Development, history | Validation, history |
|---|---|---|
| F − E | **+0.131 [0.10, 0.17]** | **+0.145 [0.08, 0.21]** |
| F − C, both per-season | −0.007 [−0.03, 0.01] | +0.021 [−0.03, 0.07] |
| F − C, both harness rule | −0.011 [−0.04, 0.02] | −0.057 [−0.11, 0.00] |
| F − E with curve conversion | +0.027 [−0.00, 0.06] | −0.015 [−0.08, 0.06] |
| C per-season − E with curve conversion | **+0.034 [0.01, 0.06]** | −0.036 [−0.09, 0.02] |

In the decision tier, F − E is +0.052 [0.01, 0.10] in development and −0.015 [−0.09, 0.06] in
validation.

## 3. Within-position performance

Two-season target, Spearman ρ. Value variants share their parent's ordering.

| Period | Population | Pos | E | C | F | F − E | F − C |
|---|---|---|---|---|---|---|---|
| Dev | Decision tier | QB | 0.629 | 0.682 | 0.702 | +0.073 [−0.01, 0.18] | +0.020 [−0.01, 0.05] |
| Dev | Decision tier | RB | 0.608 | 0.603 | 0.618 | +0.010 [−0.05, 0.08] | +0.015 [−0.03, 0.06] |
| Dev | Decision tier | WR | 0.678 | 0.700 | 0.710 | +0.032 [−0.02, 0.09] | +0.010 [−0.03, 0.05] |
| Dev | Decision tier | TE | 0.567 | 0.600 | 0.642 | +0.074 [−0.03, 0.19] | +0.041 [−0.04, 0.13] |
| Dev | Whole board | QB | 0.661 | 0.635 | 0.651 | −0.010 [−0.07, 0.05] | +0.016 [−0.00, 0.04] |
| Dev | Whole board | RB | 0.691 | 0.629 | 0.692 | +0.001 [−0.03, 0.03] | **+0.063 [0.04, 0.09]** |
| Dev | Whole board | WR | 0.672 | 0.623 | 0.676 | +0.003 [−0.02, 0.03] | **+0.053 [0.03, 0.07]** |
| Dev | Whole board | TE | 0.617 | 0.569 | 0.628 | +0.011 [−0.04, 0.06] | **+0.059 [0.04, 0.08]** |

One-season target, validation (5 dates), decision tier: F − E is QB −0.043 [−0.15, 0.05],
RB +0.028 [−0.05, 0.11], WR +0.003 [−0.06, 0.07], TE +0.072 [−0.15, 0.29]. F − C is
QB +0.077 [0.02, 0.14], RB +0.039 [−0.02, 0.09], WR −0.013 [−0.07, 0.04], TE −0.045 [−0.23, 0.13].

Read: no model separates from another in the decision tier. Across the whole board F matches
the incumbent and beats C at RB, WR and TE in both periods.

Calibrated error, validation, season points (E / C / F): QB 53.2 / 54.2 / 51.7, RB 32.9 / 32.8 /
31.8, WR 29.7 / 29.1 / 29.8, TE 24.0 / 24.0 / 23.0.

## 4. Top-120 composition

Mean players per position in the top 120 by predicted value.

| Source | Dev QB/RB/WR/TE | Val QB/RB/WR/TE |
|---|---|---|
| Realised | 25.3 / 33.0 / 45.7 / 16.0 | 28 / 33 / 45 / 14 |
| E (incumbent) | 27.3 / 33.0 / 46.7 / 13.0 | 28 / 33 / 46 / 13 |
| E, curve conversion | 23.0 / 35.0 / 48.2 / 13.8 | 23 / 35 / 49 / 13 |
| C, per-season rule | 22.5 / 35.7 / 48.5 / 13.3 | 24 / 35 / 49 / 12 |
| F, per-season rule | 23.8 / 35.3 / 47.2 / 13.8 | 24 / 35 / 49 / 12 |
| F, harness rule | 22.8 / 30.8 / 49.8 / 16.6 | 19 / 28 / 55 / 18 |

Every conversion with a hard floor at replacement puts about 23 QBs, 35 RBs, 48 WRs and 13 TEs
in the top 120, because only players above the replacement rank get a positive value. That mix
is set by the replacement ranks, not learned. The incumbent's graded values match the realised
mix better, by two to five quarterbacks.

## 5. Does any gain cost the incumbent its strengths?

| Incumbent strength | E | C | F | Kept by F? |
|---|---|---|---|---|
| Whole-board RB ordering (dev, two-season) | 0.691 | 0.629 | 0.692 | Yes |
| Whole-board WR ordering (dev, two-season) | 0.672 | 0.623 | 0.676 | Yes |
| RB, no games last season (dev / val, one-season) | 0.568 / 0.449 | 0.349 / 0.287 | 0.496 / 0.416 | Partly |
| WR, no games last season (dev / val) | 0.477 / 0.525 | 0.291 / 0.416 | 0.416 / 0.506 | Partly |
| QB, no games last season (dev / val) | 0.392 / 0.324 | 0.320 / 0.035 | 0.349 / 0.074 | **No** |
| Year 5+ RB (dev / val) | 0.646 / 0.614 | 0.550 / 0.556 | 0.596 / 0.570 | **No** |
| Year 5+ WR (dev / val) | 0.704 / 0.694 | 0.649 / 0.682 | 0.667 / 0.708 | Mixed |
| In-season QB, decision tier (val, Week 8) | 0.770 | 0.537 | 0.612 | **No** (one date) |
| Top-120 QB count against realised | Closest | Low | Low | **No** |
| P@120 (dev / val, history) | 0.64 / 0.70 | 0.59 / 0.58 | 0.68 / 0.69 | Yes |

Where F is ahead of the incumbent: offseason boards in development (QB 0.647 against 0.483,
RB 0.615 against 0.547, TE 0.534 against 0.416), year-2 players, and stability between
checkpoints (0.98 against 0.90 to 0.93).

What F lacks is information, not arithmetic: the incumbent reads roster status, career totals
and draft data. F reads three seasons of games.

## 6. Disclosures

- **The value rule for F changed after a first look.** The architecture document specified the
  per-season rule. The first implementation used the archived harness rule, and a 20-resample
  run showed F below C before the rule was corrected. Both rules are reported for both models.
  Under the harness rule F is below C in validation (−0.057 [−0.11, 0.00]; decision tier −0.095
  [−0.17, −0.03]).
- **Decision-tier populations differ slightly from the archived v2 tables.** The tier is the
  union of every model's top 2N, and F adds players. Whole-board and history populations are
  identical, and E and C reproduce their archived figures there.
- **Inputs.** Three nflverse files changed since the v2 manifest (`stats_player_week_2026.csv`,
  `games.csv`, `players.csv`). `phase2-baseline-v2` still reproduces byte-identically on the
  current files, before and after this change (sha256 `3c841141…`). This experiment's own
  `data-manifest.json` records the hashes used.
- **Position labels.** F's fits and C's age curve take each player's main stats position over
  all loaded seasons, which runs past early decision dates. This is the harness's existing
  behaviour.
- **In-season dates** apply lines fitted on end-of-season windows.
- **`E_curve_value` has no age term.** Age reaches it only through the incumbent's ranks.
- Evaluation is deterministic: two runs at the same resample count gave identical hashes.

## 7. Reproduce

```bash
npm run backtest:fetch -- --config experiments/phase2-challenger-f/config.json --verify
npm run backtest:evaluate -- --config experiments/phase2-challenger-f/config.json
npm run backtest:evaluate -- --config experiments/phase2-baseline-v2/config.json   # unchanged: 3c841141…
```

Code: `src/validation/challengers.ts`, opt-in through `"challengers": true` in the experiment
config. `git diff e4dc3a0 -- src ':!src/validation'` is empty.
