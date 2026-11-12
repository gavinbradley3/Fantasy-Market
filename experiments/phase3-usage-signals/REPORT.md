# Do usage changes flag outlook changes before our projections do?

Phase 3 research report, 2026-11-12. Correlational evidence only. No production ranking, valuation
or schedule changed. E, C, F and their frozen results are untouched (both hashes re-verified).

**Answer: partly, and weakly.** Snap share carries information that recent fantasy production
does not, at every position and every horizon tested. The gain is real but small: about 2% lower
error on the next three games. Most of it comes from players whose snap share *fell*. Changes in
carry share and target share add little or nothing beyond recent production.

**Recommendation: snap share (last-4-game level plus recent change) is the one feature to test in
challenger F.** It is the only feature that met the pre-registered rule. That rule was met on a
2–4 game horizon. F projects whole seasons, so the feature earns a place in F only if it also
improves F's season-level backtest. That test has not been run.

## Design

Fixed and pushed before any outcome was computed: `config.json`, commit `cf6cfbe`, 21:33 UTC.

| Item | Choice |
|---|---|
| Decisions | Every week 4 to (last week − 4), 2019–2023: **53 decision instants**, from `src/validation/calendar.ts` |
| Fit / holdout | Fitted on 2019–2021 only. Scored on 2022–2023. 2024–2025 never loaded |
| Population | RB, WR, TE (main stats position) with 3+ games that season by the instant |
| Targets | PPR points and opportunities (carries + targets) per team game over the team's next 2, 3 or 4 games. **A missed game counts as zero**: 25% of future RB games, 25% WR, 30% TE |
| Baseline M0 | Recent production only: points over the last 4 team games, season-to-date points per team game, and F's own input rate |
| Usage features, one at a time | Snap share, carry share (RB), target share: level over the last 4 games played, change (last 2 against the up-to-4 before them), and both. Raw volume (carries + targets) for comparison |
| Method | Least squares per position, target and horizon. Holdout mean absolute error (MAE). Paired MAE difference against M0 with a 95% player-cluster bootstrap interval |
| Decision rule | A feature qualifies if, at 3 games on points, adding it lowers holdout MAE with the interval wholly below zero at every position it applies to |

Holdout sample: RB 2,294 player-decisions (155 players), WR 3,695 (240), TE 1,922 (130), over 22
decision instants. 18 of 19,164 rows were excluded for a missing snap share.

## Results

Holdout, next 3 team games, PPR points per team game. A negative change in MAE is better.

| Feature added to M0 | RB | WR | TE |
|---|---|---|---|
| M0 alone: MAE, R² | 3.39, 0.49 | 3.21, 0.51 | 2.43, 0.46 |
| **Snap share, level + change** | **−1.7% [−0.086, −0.029]** | **−1.7% [−0.082, −0.028]** | **−2.5% [−0.090, −0.036]** |
| Snap share, change only | −1.2% [−0.057, −0.022] | −1.1% [−0.055, −0.017] | −1.1% [−0.049, −0.009] |
| Carry share, level + change | −1.0% [−0.061, −0.009] | n/a | n/a |
| Carry share, change only | −0.2% [−0.009, −0.003] | n/a | n/a |
| Target share, level + change | 0.0% [−0.008, +0.009] | −0.4% [−0.031, +0.004] | −0.6% [−0.029, −0.001] |
| Raw volume (carries + targets) | −1.4% [−0.082, −0.011] | −1.0% [−0.059, −0.009] | −1.2% [−0.058, −0.002] |
| All shares + volume | −2.0% | −2.2% | −3.1% |

Brackets show the MAE difference in points per team game, with its 95% interval.

- **Snap share is the only feature that qualifies.** It holds at 2 and 4 games (−1.4% to −2.3%
  at every position) and on the opportunities target (−2.3% to −3.6%).
- **Carry share's value is its level, not its change.** The fitted coefficient on carry-share
  change is 0.08, against 2.66 on its level.
- **Target-share change does not persist.** Its rank correlation with the next three games'
  change in opportunities is −0.09 for WR and −0.07 for TE: it mostly reverts.
- **The size is small.** A 0.06 point-per-game MAE reduction is about one point over a season.

### Where recent production misses

M0's average miss (actual minus predicted, points per team game) in the top and bottom 10% of
snap-share change. Cut points come from the fit seasons.

| | RB fell | RB rose | WR fell | WR rose | TE fell | TE rose |
|---|---|---|---|---|---|---|
| M0 | −1.08 [−1.81, −0.29] | +1.38 [+0.20, +2.72] | −0.48 [−1.08, +0.15] | +1.04 [+0.42, +1.69] | −0.66 [−1.47, +0.21] | +0.61 [−0.25, +1.48] |
| M0 + snap share | −0.58 | +0.76 | +0.09 | +0.33 | −0.14 | +0.08 |

Recent production under-projects players whose snaps just rose and over-projects those whose
snaps just fell. Adding snap share roughly halves that bias, and every residual interval then
includes zero.

### Two cautions on reading this

1. **Falling snap share partly means "about to miss games".** Receivers in the bottom decile of
   snap change missed at least one of the next three games 61% of the time, against 33% for flat
   snap share. For tight ends it was 68% against 47%. Some of that is in-game injury, not a
   change of role, and the data cannot separate the two. The gain survives among players who
   played all three following games (RB −0.07, WR −0.05, TE −0.04 MAE), so availability is not
   the whole story.
2. **Big upward jumps are unreliable.** Among the 5% of cases where snap share raised the
   projection most, the snap model was closer to the outcome only 47% of the time. Among the
   5% where it lowered the projection most, it was closer 67% of the time. Fringe players who
   step into a starter's snaps often do not produce.

## Three verified examples

Chosen by rule, without looking at outcomes: the largest upward adjustment from snap share, the
largest downward, and the second-largest upward (the next distinct player). All are from the
2023 holdout. Statistics come from nflverse files (listed under Sources).

**1. Zack Moss, RB, IND, after Week 14 of 2023: the largest upward adjustment, which failed.**

| Week | 9 | 10 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|---|---|---|---|---|---|---|---|
| Snap share | 21% | 16% | 41% | 94% | 84% | 28% | did not play | did not play |
| Carries / team carries | 7/30 | 1/26 | 8/27 | 19/23 | 13/18 | 4/34 | | |
| PPR points | 2.6 | 0.2 | 9.0 | 7.7 | 9.6 | 12.3 | 0 | 0 |
| Injury report | | | | | | | Questionable (forearm) | Out (forearm) |

Projection for the next three games: M0 7.9 points per game, snap model 9.7, actual 4.1. Moss
had taken over the backfield, then got hurt and missed two games, and his Week 15 snaps were
back to 28%. The usage signal was real. It did not survive an injury nobody could see.

**2. Tyreek Hill, WR, MIA, after Week 14 of 2023: the largest downward adjustment, which moved
the right way.**

| Week | 9 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|---|---|---|---|---|---|---|---|
| Snap share | 90% | 59% | 63% | 51% | 47% | did not play | 85% | 72% |
| Targets / team targets | 10/33 | 11/36 | 12/28 | 7/25 | 5/33 | | 14/36 | 12/36 |
| PPR points | 12.5 | 30.6 | 25.4 | 32.3 | 10.1 | 0 | 18.9 | 13.6 |
| Injury report | | | | | | Questionable (ankle) | Questionable (ankle) | |

M0 20.9, snap model 19.1, actual 10.8. His snaps fell for four weeks while he kept scoring 25+
points, and then he missed Week 15 with an ankle injury. The snap signal pointed the right way,
but both models stayed far too high. This is the availability case, not a change of role.

**3. Cedric Tillman, WR, CLE (gsis `00-0038979`), after Week 10 of 2023: the second-largest
upward adjustment, which moved the right way.**

| Week | 4 | 6–8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|
| Snap share | 20% | did not play (Week 6: Out, hip) | 74% | 85% | 88% | 89% | 93% |
| Targets / team targets | 3/34 | | 1/28 | 3/32 | 2/41 | 5/39 | 6/41 |
| PPR points | 1.5 | 0 | 1.3 | 0.0 | 2.0 | 9.5 | 4.0 |

M0 0.7, snap model 2.5, actual 5.2. Two near-pointless games at 74–85% snaps told production
models nothing. The snap share said he had a starting role, and the points followed in a
low-scoring offence. `players.csv` lists two players named Cedric Tillman; this is why every
join uses the gsis id.

Across the ten largest distinct upward adjustments the snap model was closer in 3 of 10. Across
the ten largest downward adjustments it was closer in 6 of 10. Examples 1 and 3 are not cherry
picks in either direction.

## Limitations

- **Correlation, not cause.** Snap share may stand in for things it correlates with: coaching
  intent, injury, game script. The models say nothing about why.
- **One holdout period.** 22 decision instants in two seasons. Intervals resample players, not
  seasons, so a shift between seasons is not covered.
- **"Games played" means "games with a stats row".** 11–15% of RB/WR/TE games with offensive
  snaps (2019: 597 of 5,180; 2023: 836 of 5,777) have no row in the stats file. The harness,
  and F's games share, count those as missed. The missing games are low-snap appearances that
  scored nothing, so outcome points are unaffected, but F's games-share input understates
  participation.
- **Snap share is averaged over games with a stats row,** for the same reason.
- **Point-in-time limits from Phase 2 still apply.** Files carry later stat corrections, and
  main stats position is taken over all loaded seasons.
- **Short horizon only.** Nothing here shows that snap share improves a season or dynasty
  projection.
- **Least squares on points** ignores the zero floor and the skew; the residual tables show
  the bias is concentrated at the extremes.

## Recommendation

Add **snap share (last-4-game level and last-2 change)** as the single candidate feature for a
new challenger, "F + snap". Score it in the frozen Phase 2 harness on the one- and two-season
targets with the same dates and seeds. Keep it only if it beats F there. Do not use usage
changes on their own to label players: their average effect is about 2%, and their largest
upward signals were wrong more often than right.

## Sources

Downloaded 2026-11-12 from `https://github.com/nflverse/nflverse-data/releases/download/<release>/<file>`
(nflverse-data repository, CC BY 4.0). Release stamps at download:

| Release | Last updated (provider's stamp) | Files used |
|---|---|---|
| `stats_player` | 2026-11-12 12:36:57 EST | `stats_player_week_2012…2023.csv` (2023: sha256 `f19cb71a5de0dce7…`) |
| `stats_team` | 2026-11-12 12:37:14 EST | `stats_team_week_2019…2023.csv` (2023: `dc5a387daabe8663…`) |
| `snap_counts` | 2026-11-10 07:27:35 EST | `snap_counts_2019…2023.csv` (2023: `303b61aa5c33ffda…`); Pro Football Reference via nflverse |
| `injuries` | 2026-11-12 10:56:20 EST | `injuries_2023.csv` (`16b04e21da5aa394…`), examples only |
| `schedules`, `players` | 2026-11-12 16:16:25 / 11:32:03 EST | `games.csv`, `players.csv` |

Team totals in `stats_team_week` matched the sum of player rows in all 2,654 team-games from
2019 to 2023. Every input hash is in `results/results.json` (sha256 `40bab080…`).

Reproduce with `npm run backtest:usage -- --config experiments/phase3-usage-signals/config.json`
(about 15 seconds; byte-identical output).
