# Accessible-Data Valuation Model — RB & TE, v1.0

**Status:** production. **Models:** `rb-accessible-1.0`, `te-accessible-1.0`.
**Implementation:** `src/accessible/`. **Tier selection:** `src/inference/production/modelTier.ts`.

---

## 1. Why this model exists

The frozen RB and TE engines require `career_routes`, a non-nullable input. nflverse stopped
publishing free per-player route counts after the 2023 season, and the frozen route model
(`src/inference/d1/routeExposure.ts`, REGISTRY §8.1 rungs 4/5) correctly reports it
`UNAVAILABLE` for RB and TE rather than manufacturing one.

The consequence, measured on the live board at as-of `2026-02-15` over seasons 2023–2025:

| Position | Selected | Valued | Blocking field |
|---|---|---|---|
| QB | 111 | 111 | — |
| WR | 340 | 310 | `career_routes` (30 below the 3-game minimum) |
| RB | 237 | **0** | `career_routes` |
| TE | 180 | **0** | `career_routes` |

Two entire positions published no value because one licensed input was unavailable. That is a
correct refusal by the full model and an unacceptable product outcome.

### 1.1 What the audit found beyond the reported blocker

`career_routes` was the *sole* universal blocker — but it was not the only problem. Of the
frozen engines' inputs, measured over the live population:

- **RB:** 24 of 37 inputs `UNAVAILABLE` for all 237 players. Only `career_touches`,
  `career_carries`, `expected_games_remaining`, `practice_status` and inferred context fields
  were usable.
- **TE:** 27 of 40 inputs `UNAVAILABLE` for all 180 players.

So simply making `career_routes` optional would have run the frozen engines on roughly a
quarter of their declared inputs, exercising two dozen documented fallback paths and
publishing the result as a full valuation. That is the outcome this tier exists to avoid.

Crucially, the audit also found that **the pipeline was discarding data it already had**. The
weekly stats export is ingested with `carries`, `rushing_yards`, `rushing_tds`, `targets`,
`receptions`, `receiving_yards` and `receiving_tds` at **100% column population across all
56,979 ingested game records** — but `observedFacts.ts` aggregated only the two or three
counting fields the frozen engines declare, and the inference layer derived no RB/TE rate at
all. Every efficiency and share field was reported `UNAVAILABLE` despite being computable.
`docs/DATA_PIPELINE_STATS.md` claimed these were supplied; they were not.

**This model is therefore built on real production data, not on defaults.**

---

## 2. Tier system

| Tier | Meaning |
|---|---|
| `FULL` | The frozen engine ran on its complete declared input set. Unchanged by this work. |
| `ACCESSIBLE` | This model ran on the acquirable input set. Fewer inputs, lower confidence ceiling, **a different model**. |
| `INSUFFICIENT` | Neither model had enough evidence. No value published. |

The tier is published per player (`model_tier` in the AIL envelope, `modelTier` on the API and
in the frontend model) and rendered as a badge on every board row. A reduced-input valuation
cannot be mistaken for a full one.

### 2.1 Selection rule

The full model is always tried first and is **never weakened**. The accessible model is
attempted only when the full model was blocked and **every** blocking field is premium-only:

```
PREMIUM_ONLY_FIELDS = ['career_routes']
```

If any blocker is *not* premium-only, the player stays `INSUFFICIENT`. This is deliberate and
load-bearing in both directions:

- a reduced valuation can never pass as a full one (the tier is published), **and**
- a genuine ingestion regression can never hide behind the fallback. If the pipeline stops
  supplying `career_carries`, RB does not quietly degrade to a reduced model — it goes
  unvalued, which is visible.

---

## 3. Treatment of `career_routes`

**It is a full-model-only input. This model does not consume it, does not proxy it, and does
not name anything after it.**

Where the frozen engines used a career route count, they used it as a **sample-size
denominator** — the `n` in their targets-per-route-run and catch-rate shrinkage, the prior
weight in TE volatility (`140 / (career_routes + 140)`), the TE confidence bands, and one TE
role threshold. It was never a volume or production driver.

The accessible models supply that `n` from an **observed exposure count** instead:

| Rate being regressed | Exposure denominator | Why it is correct |
|---|---|---|
| Yards per carry (RB) | career carries | The exposure count for a per-carry rate. |
| Yards per touch (RB) | career touches (carries + receptions) | The exposure count for a per-touch rate. |
| Catch rate (TE) | career targets | The exposure count for a per-target rate. |
| Yards per reception (TE) | career receptions | The exposure count for a per-reception rate. |
| Touchdowns per game | career games | The exposure count for a per-game rate. |

These are not proxies for routes. They are the semantically correct denominators for the rates
actually being computed, and the provider publishes them. No number in this model is an
estimate of how many routes anyone ran.

**Not done:** no snap-derived route count, no `targets ÷ constant`, no field named
`career_routes_estimated`. `provenance.unavailableFields` lists `career_routes` explicitly, and
a test asserts that no field this model reports as used matches `/route/i`.

---

## 4. Inputs

Every input is an observed provider aggregate or a point-in-time-resolved biographical fact.
`null` always means **unobserved**, never zero — a back who played and was never handed the
ball has `carries: 0`; a game whose carry column the provider omitted has `carries: null`. The
models branch differently on the two.

### 4.1 Observed (direct sums over ingested game rows)

`games_played`, `carries`, `rushing_yards`, `rushing_touchdowns`, `targets`, `receptions`,
`receiving_yards`, `receiving_touchdowns`.

### 4.2 Derived

Per-game rates; yards per carry, yards per touch, catch rate, yards per reception and
touchdowns per game (all shrunk — §3); season-over-season trajectory; reconstructed team carry
and target shares.

### 4.3 Point-in-time biographical

Age at the as-of (from birth date), draft round, seasons completed, team, roster/availability
status, expected games remaining.

### 4.4 Never used by this tier

Route participation, snap share, red-zone/goal-line usage, air yards / aDOT, catchable-target
rate, expected-value model metrics (xFP/CROE/CPOE), team offensive context (dropbacks, pace,
points per drive). All are published in `materialMissingInputs` in product language.

### 4.5 Windows

| Window | Definition | Used for |
|---|---|---|
| `career` | Every regular-season game at or before the as-of | Efficiency, scoring, durability |
| `recent` | The most recent 8 of those | Current-form checks, staleness |
| `roleWindow` | The latest season when it holds ≥8 games, else `recent` | **Volume, role classification, shares** |
| `latestSeason` / `priorSeason` | The two newest seasons present | Trajectory |

**On `roleWindow`:** the first live run defined role from a rolling 8-game window and it
misfired in exactly the way you would predict. A backup who filled in for an injured starter
read as a starter (Kenny Gainwell ranked 6th of 226 RBs); a starter whose season ended early
read as a backup; nearly every top-25 TE was labelled "primary receiving option". A season is
the unit in which football roles actually exist, so the role window prefers one.

### 4.6 Reconstructed team shares

Team carry/target totals are summed from every player row the snapshot holds for that
`(team, game)`. By construction this is a **floor** (it sums only players with a stat line), so
a derived share is an upper bound. Measured against the live snapshot it is very close to
complete:

| Quantity | Reconstructed median | NFL reality |
|---|---|---|
| Carries per team-game | 26 | ~25 |
| Targets per team-game | 31 | ~33 |

with exactly 1,632 team-games (3 seasons × 32 teams × 17 games). The floor property is still
declared on the provenance and the shares are never presented as provider-published team
totals.

Caching these totals per snapshot is point-in-time safe because the lookup key names **one
game**: every row summed into a total shares that game's kickoff, so a total is only ever read
for a game already established to be at or before the as-of.

---

## 5. Components

Scored 0–100 by piecewise-linear interpolation through fixed, football-anchored scales
(`src/accessible/scale.ts`). A component whose inputs are unobserved is **dropped**, and the
remaining horizon weights renormalize — absence is never scored as zero.

### 5.1 RB

| Code | Component | Basis |
|---|---|---|
| `RV` | Rush volume | Carries per game over the role window |
| `RCV` | Receiving volume | Targets per game (0.6) + receiving yards per game (0.4) |
| `EFF` | Efficiency | Shrunk yards per carry (0.55) + shrunk yards per touch (0.45) |
| `SC` | Scoring | Shrunk total touchdowns per game |
| `RS` | Role share | Carry share (0.6) + target share (0.4) |
| `TR` | Trajectory | Latest-season vs prior-season per-game touches |
| `AG` | Age | RB age curve |
| `AV` | Availability | Point-in-time roster state |
| `DUR` | Durability | Games appeared in ÷ 17 per season observed |

### 5.2 TE

| Code | Component | Basis |
|---|---|---|
| `TV` | Target volume | Targets per game over the role window |
| `RP` | Receiving output | Receiving yards per game |
| `EFF` | Efficiency | Shrunk catch rate (0.45) + shrunk yards per reception (0.55) |
| `SC` | Scoring | Shrunk receiving touchdowns per game |
| `RS` | Role share | Target share |
| `TR` | Trajectory | Latest-season vs prior-season per-game targets |
| `AG`, `AV`, `DUR` | As RB, with the TE age curve |

### 5.3 Why fixed anchors rather than fitted distributions

Two alternatives were rejected on specific grounds:

- **Population percentiles** would make one player's value depend on the cohort ingested in the
  same run. The pipeline values players one at a time (one artifact and checksum per canonical
  id), so a cohort-relative score would break per-player replay and would move a quiet backup's
  number because an unrelated player joined the board.
- **A distribution fitted to the ingested seasons** would embed the whole ingestion window into
  every valuation, including runs whose as-of predates part of that window. That is a
  point-in-time leak and it is not detectable from the output.

Fixed anchors avoid both and are ordinary checkable football statements — "16 carries a game is
a lead back", "4.3 yards a carry is league-average" — so a reader can disagree with a specific
number instead of trusting an opaque fit. Each table cites its reasoning where declared.

**Cost, stated plainly:** the anchors are authored judgments, not fitted parameters. They are
defensible and transparent, but they are not calibrated against realized fantasy outcomes. See
§10.

### 5.4 Age curves

| Position | Peak | Shape |
|---|---|---|
| RB | 23–25 | Steep: 100 at 23, 77 at 27, 50 at 29, 24 at 31. Collision-heavy workload, largely athletic skill, cheap draft replacement. |
| TE | 25–29 | Gentle: 80 at 22, 100 at 26, 96 at 29, 66 at 32. Latest-developing skill position; blocking and option-route feel arrive in years 3–4. |

### 5.5 Horizon weights and the headline value

Five horizons (`weekly`, `ros`, `oneYear`, `threeYear`, `dynasty`) weight the components
differently: weekly leans on volume, role and availability; dynasty on age, receiving profile
and trajectory.

The headline `positionValue` is a documented blend — `ros` 0.15, `oneYear` 0.30, `threeYear`
0.30, `dynasty` 0.25 — and deliberately **not** the dynasty composite alone. In the first live
run, dynasty-as-headline made age the primary sort key for the whole board: a 4-year age gap
outranked the difference between a lead back and a backup, and the best weekly back in the
population (Christian McCaffrey) headlined below a rotational one. The dynasty age weight was
also reduced (RB 0.33 → 0.23) so that production and role collectively outweigh age while age
remains the largest single component.

---

## 6. Confidence

Ceiling **74** — strictly inside MEDIUM. **An accessible-tier valuation can never be HIGH
confidence**, however clean the box score, because the inputs that would confirm a role are
absent for every player in the tier.

Penalties (subtracted from the ceiling):

| Code | Cost | When |
|---|---|---|
| `NO_PARTICIPATION_DATA` | 10 | Always (tier-wide) |
| `NO_HIGH_VALUE_USAGE_DATA` | 6 | Always (tier-wide) |
| `NO_TEAM_CONTEXT` | 5 | Always (tier-wide) |
| `SPARSE_CAREER_SAMPLE` | 14 | Fewer than 8 career games |
| `MINIMAL_CAREER_SAMPLE` | 12 | Fewer than 4 career games (cumulative with the above) |
| `AGE_UNKNOWN` | 12 | No birth date, so no age curve |
| `STALE_PRODUCTION` | 8 | No game in the recent window |
| `NO_TRAJECTORY` | 6 | Only one season observed |
| `STATUS_UNATTESTED` | 6 | No roster status attested at the as-of |
| `NO_TEAM_SHARES` | 4 | Shares not reconstructible |

The published confidence for an accessible-tier player is this model's own score, capped so it
can only move downward — the AIL's public confidence describes the *full* model's input
completeness, which is by definition incomplete here.

---

## 7. Refusals

The model declines rather than guessing:

| Code | Meaning |
|---|---|
| `NO_QUALIFYING_GAMES` | No regular-season game record at the as-of |
| `NO_OFFENSIVE_OPPORTUNITY` | RB played but recorded no carries and no targets |
| `NO_RECEIVING_OPPORTUNITY` | TE played but was never targeted |

`NO_RECEIVING_OPPORTUNITY` is the honest answer for a pure blocking tight end. Scoring him zero
would rank a legitimate blocking specialist against measured receivers as though the model had
assessed his actual job; blocking contribution is not measurable from the available data.

---

## 8. Live coverage

As-of `2026-02-15`, seasons 2023–2025:

| Position | Selected | Valued | % | FULL | ACCESSIBLE | Unvalued | Reason |
|---|---|---|---|---|---|---|---|
| QB | 111 | 111 | 100.0 | 111 | 0 | 0 | — |
| RB | 237 | **226** | **95.4** | 0 | 226 | 11 | `NO_OFFENSIVE_OPPORTUNITY` |
| WR | 340 | 310 | 91.2 | 310 | 0 | 30 | below the 3-game route minimum |
| TE | 180 | **167** | **92.8** | 0 | 167 | 13 | `NO_RECEIVING_OPPORTUNITY` |
| **Total** | **868** | **814** | **93.8** | 421 | 393 | 54 | |

Confidence distribution: RB 106 MEDIUM / 120 LOW; TE 92 MEDIUM / 75 LOW. No HIGH, by design.

`career_routes` is no longer a universal blocker for any position. Every remaining unvalued RB
and TE has a player-specific reason.

---

## 9. Validation

Sparse-sample behaviour over the live population:

| Career games | RB mean value | RB max | TE mean value | TE max |
|---|---|---|---|---|
| 1–2 | 32.7 | 52.0 | 35.0 | 49.4 |
| 3–7 | 30.6 | 56.6 | 29.3 | 42.3 |
| 8–16 | 37.1 | 72.0 | 42.0 | 76.2 |
| 17+ | 47.4 | 87.6 | 51.6 | 89.2 |

No player with fewer than 8 observed games appears in the top 40 at either position, and mean
value rises monotonically with sample size.

Named probes are recorded in `docs/ACCESSIBLE_MODEL_VALIDATION.md`.

---

## 10. Known limitations

These are real and should be visible to users:

1. **The anchors are authored, not fitted.** No parameter here has been calibrated against
   realized fantasy points. They are transparent and defensible, not empirically optimal.
2. **No role confirmation.** Without snap share or route participation, a committee back and a
   lead back who split carries evenly are indistinguishable to this model.
3. **No situational usage.** Red-zone and goal-line work is invisible, so touchdown expectation
   is inferred from realized scoring — the noisiest thing a skill player does — heavily shrunk.
4. **No team context.** A back on a run-heavy offence and one on a pass-heavy offence are scored
   on the same scale.
5. **Blocking is unmeasured.** Blocking tight ends and fullbacks are either unvalued or scored
   only on their marginal receiving work.
6. **Availability is weekly-resolution.** nflverse publishes no injury feed; availability comes
   from roster status at the as-of, not a game-day designation.
7. **Career windows span only the ingested seasons.** A veteran's "career" totals cover the
   seasons passed to `--seasons` and nothing earlier, so durability and career rates for
   long-tenured players are truncated.
8. **Reconstructed shares are upper bounds** (§4.6).

The natural upgrade path is a licensed charting source, which restores the `FULL` tier for RB
and TE with no model change — the tier system already routes to it the moment `career_routes`
is present.

---

## 11. Compatibility

- QB and WR behaviour is unchanged: no valuation, readiness decision or confidence moved. The
  accessible-tier evidence is built for RB/TE only, so QB/WR normalized-input bytes are
  identical (asserted in `src/inference/production/modelTier.test.ts`).
- The AIL envelope gained a model-tier block, so `AIL_SCHEMA_VERSION` moved to
  `air-report-1.1`. Envelope bytes therefore differ from 1.0 for every position; **no
  valuation changed** for QB or WR.
- Point-in-time protections are unchanged and extended to the new windows.
- No new dependency, no paid source, no scraping.
