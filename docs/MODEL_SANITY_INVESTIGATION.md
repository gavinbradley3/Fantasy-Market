# Model sanity investigation: staged-board outliers

2026-11-12. Requested in the PR #12 review. **No weights, curves or model logic were changed to produce or "fix" any result here.**

## Method

Each player was valued in four runs that change one factor at a time. All runs use the same captured nflverse payloads (replay), no Sleeper, and career seasons 2017–2025. Every number below comes from the runs' own persisted inputs and outputs, extracted with `npm run explain:players`. A component's **contribution** is its weight × score ÷ the sum of weights of the non-null components, which is the models' own rule (weights imported from the models).

| Run | Code | Valuation seasons | As-of | Isolates |
|---|---|---|---|---|
| L0 | `main` (production code) | 2025 | 2026-09-12 | Reproduces the production board: identical rank for every player below |
| L1 | PR #12 | 2025 | 2026-09-12 | Phase 1 input corrections |
| L2 | PR #12 | 2024–2026 | 2026-09-12 | The rolling three-season window |
| L3 | PR #12 | 2024–2026 | 2026-11-12 | 2026 Weeks 1–9 (the staged board's inputs) |

The QB model is the frozen engine with 16 substituted inputs for every quarterback. The RB, WR and TE values come from the box-score ("accessible") models.

## Findings by player

Ranks are overall dynasty ranks (position rank in brackets). "Dyn" is the position-internal dynasty composite (0–100).

| Player | L0 | L1 | L2 | L3 | Main cause of the move | Classification |
|---|---|---|---|---|---|---|
| Deshaun Watson | not selected | not selected | 29 (QB10) | 10 (QB3) | No 2025 games (PUP), so absent from 2025-only boards. On the 2024–26 window he is an ESTABLISHED_STARTER (8 of 8 recent starts, 80 career). Composite 72.6 is built from role security 19.8 and age development 20.0 of 72.6. His passing quality (55.7) equals Allen's (55.1). QB3 sits 2.5 composite points from QB10. | Methodology (QB compression, role/age dominance); inputs correct |
| Saquon Barkley | 91 (RB27) | 91 | 92 | 334 (RB81) | Role window becomes his last 8 games, 7 of them in 2026: 11 carries/game, 1.4 targets/game, target share 5.4% (was 12.3%). Dyn 63.5 → 48.6: rush volume −4.2, receiving −4.9, role share −3.8, trajectory −1.9. Age 29 unchanged. | Methodology (mid-season recency); inputs match nflverse |
| Christian McCaffrey | 32 (RB9) | 30 | 80 (RB23) | 197 (RB40) | L1→L2: the window adds 2024 (injury year); durability 84 → 43 and his role window mixes 1 game of 2026 with 7 of 2025. L2→L3: 2026 usage 12.8 carries + 5.6 targets/game. RB40 converts to value 0.9 (RB30 = 8.0). | Methodology (durability window, recency, utility cliff) |
| Jalen Hurts | 12 (QB4) | 12 | 22 (QB6) | 82 (QB19) | L1→L2: composite unchanged (71.1); 2024-window QBs entered the pool. L2→L3: on IR at the as-of, so availability 98 → 9 and passing opportunity 55 → 50. Dyn −3.3 moves him QB6 → QB19 and value 48.6 → 15.9. | Methodology (QB compression + IR in a dynasty horizon); input correct |
| Brock Purdy | 135 (QB34) | 50 (QB14) | 62 | 29 (QB10) | L0→L1: seasons completed 5 → 4, so YOUNG_COMMITTED_STARTER replaces BACKUP; role security 39.5 → 87.0 and age development 86 → 93. L3: 53 career starts, ESTABLISHED_STARTER. | **Input defect, fixed** (seasons completed) |
| Jayden Daniels | 132 (QB33) | 140 | 131 | 24 (QB7) | L0–L2: BACKUP. 18 counted career starts and a 0.65 start rate, because the schedule names another starter in 6 of his 2024 games. L3: 2026 starts lift the rate past 0.8, so YOUNG_COMMITTED_STARTER and role security 45 → 93. | **Input defect, NOT fixed** (schedule starter field); masked at L3 |
| Brock Bowers | 57 (TE4) | 57 | 71 (TE6) | 31 (TE2) | L1: IR mapped (availability 40 → 5) but the TE dynasty weight on availability is 0, so no change. L2: the 2025/2024 trajectory is 35. L3: 2026 usage 9.9 targets/game, route-proxy 94.6, trajectory 76. | Data-driven; methodology (recency) amplifies |
| Malik Nabers | 51 (WR22) | 52 | 36 (WR14) | 32 (WR12) | L0 used 4 games of 2025 (injury). The window restores his 2024 season (170 targets), and durability rises 12 → 47. | Window correction working as intended |
| Carnell Tate (2026 R1) | — | — | — | 51 (WR21) | 7 games, 7.3 targets/game, share 26%, draft-capital score 84.8 (decayed by games). | Plausible; small sample |
| Denzel Boston (2026 R2) | — | — | — | 56 (WR24) | 9 games, share 22%, age 22. | Plausible; small sample |
| Jeremiyah Love (2026 R1, RB) | — | — | — | 124 (RB36) | 6 games, 12.7 carries/game, 3.5 yards/carry, 14 targets. **The RB model has no draft-capital term**, so a first-round pick is valued on 6 games alone. RB36 converts to value 1.9. | Methodology (missing prior for RB/TE) |
| Jalon Daniels (UDFA QB) | — | — | — | 151 (QB37) | 5 games, 3 starts, ROOKIE_EXPECTED_STARTER (role security 81.7); passing quality 30. | Plausible |
| Josh Allen (control) | 7 (QB2) | 6 | 6 | 6 | Stable at every rung. | — |
| Bijan Robinson (control) | 1 | 1 | 1 | 4 (RB2) | 2026: 4.4 targets/game against 6.1 in 2025, so the receiving score falls 91 → 68. | Data-driven |

No result above traced to a calculation error in the arithmetic: every composite reconciles to its weighted components. The defects found are in **inputs**: seasons completed (fixed in PR #12) and starter attribution (open).

## Structural issues (affect many players)

1. **QB composites are compressed, so small input changes move ranks a lot.**
   - QB4 to QB24 span 72.4 → 67.0 dynasty-composite points, while their dynasty value runs from about 64 to 2.5.
   - Among the 33 starting QBs, role security has a standard deviation of 1.7 and scoring environment 1.6. Those components carry 25% of the dynasty weight but rank no one.
   - Passing quality (20% weight) has a standard deviation of 9, because its efficiency inputs (CPOE, explosive rate, environment) are fallbacks for every QB.
   - Result: role and age decide QB order more than passing quality, and a 3-point change (Hurts) moves 13 position ranks.
   - Type: input gaps plus existing methodology. The free play-by-play could supply most of the missing efficiency inputs (audit section D).
2. **The utility conversion is steep near replacement level.**
   - Value by position rank: RB30 = 8.0, RB36 = 1.9, RB40 = 0.9; QB20 = 15.6, QB24 = 2.5; TE10 = 9.5, TE15 = 1.4.
   - This is the measured production curve doing what it was designed to do, but it turns position-rank noise near the cutoff into large overall-rank moves.
   - It is not a defect. Its real-world calibration is untested.
3. **Mid-season recency dominates the dynasty horizon.**
   - The role window is the latest season once it has 8 games, and otherwise the last 8 games. In Week 9 that is mostly the current season.
   - Usage components plus trajectory carry about 55–60% of the box-score models' dynasty weight.
   - The September back-tests had no current-season games, so **in-season behaviour has never been validated**.
   - Barkley, McCaffrey, Pitts, Robinson (down) and Bowers (up) are all this effect.
4. **Position models are inconsistent with each other.**
   - WR has a draft-capital prior that fades with games played; RB and TE have none, so rookie RBs and TEs are valued on a handful of games.
   - Injured reserve changes QB dynasty value (through availability and expected opportunity) but not RB, WR or TE dynasty value (availability weight 0).
5. **Starter attribution from the schedule is unreliable (input defect, open).**
   - The schedule's named starter is not the team's leading passer (10 or more attempts) in 49 of 544 team-games in 2024, 21 of 544 in 2025 and 13 of 271 in 2026.
   - Some of these are in-game injuries (Flacco for Richardson, 2024 Week 4); some are data errors (Daniels, 2024 Weeks 9–13).
   - The count is an upper bound on errors.
   - Fix candidate: count a start from the QB who took the team's first offensive dropback (free play-by-play), with the schedule field as a fallback.
6. **The player pool changes ranks by itself.** Hurts moved 12 → 22 with an identical composite because 2024-window QBs entered the pool. This is expected, but it should be reported beside any ranking-change review.

## What this means for approval

- The staged board's large moves are explained, and the data was read correctly. They are not explained by calculation errors.
- Two input defects drove past rankings. One is fixed (seasons completed). One is open (starter attribution) and still mis-ranks QBs whose recent starts were misattributed.
- The dominant drivers of the remaining moves are existing methodology choices that have never been validated in-season: QB compression, mid-season recency, the utility cliff, and position inconsistencies.
- The validation framework should test them before any weight changes. Candidate experiments:
  - Fixed-window versus recency role windows, scored on next-season and two-season outcomes.
  - A draft-capital prior for RB and TE.
  - Excluding current injuries from dynasty horizons.
  - Measured efficiency inputs for the QB engine.

## Reproduce

```bash
npm run explain:players -- \
  --run L0=<old-code Sep run dir> --run L1=<dir> --run L2=<dir> --run L3=<dir> \
  --player "brock purdy" --player "saquon barkley" ... --out explain.json
```

Each run directory holds `pt.db` and `export/board.json` from `npm run ingest -- --mode replay ...` and `npm run export:site-data`.
