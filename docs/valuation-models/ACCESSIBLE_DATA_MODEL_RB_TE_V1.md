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
| `ACCESSIBLE` | This model ran on the acquirable input set. Fewer inputs, **a different model** — but not, on that account, a less reliable valuation: see §6. |
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
| `RV` | Rush volume | Shrunk carries per game over the role window |
| `RCV` | Receiving volume | Shrunk targets per game (0.6) + shrunk receiving yards per game (0.4) |
| `EFF` | Efficiency | Shrunk yards per carry (0.55) + shrunk yards per touch (0.45) |
| `SC` | Scoring | Shrunk total touchdowns per game |
| `RS` | Role share | Carry share (0.6) + target share (0.4) |
| `TR` | Trajectory | Latest-season vs prior-season per-game touches |
| `AG` | Age | RB age curve |
| `AV` | Availability | Point-in-time roster state |
| `DUR` | Durability | Games appeared in ÷ team weeks rostered |

### 5.2 TE

| Code | Component | Basis |
|---|---|---|
| `TV` | Target volume | Shrunk targets per game over the role window |
| `RP` | Receiving output | Shrunk receiving yards per game |
| `EFF` | Efficiency | Shrunk catch rate (0.45) + shrunk yards per reception (0.55) |
| `SC` | Scoring | Shrunk receiving touchdowns per game |
| `RS` | Role share | Target share |
| `TR` | Trajectory | Latest-season vs prior-season per-game targets |
| `AG`, `AV`, `DUR` | As RB, with the TE age curve |

### 5.2a Volume shrinkage

The efficiency components were shrunk from the start (§3); the volume components were not.
They read a raw per-game rate straight off the role window, which made a one-game sample
arithmetically identical to a proven season: a back with a single 25-carry appearance scored a
saturated `RV` of 100, exactly like a back who had carried 25 times a game for a full year, and
could out-rank an established bell cow on the headline value. Confidence reported the thin
sample honestly, so the live board never actually produced that inversion — but the protection
was incidental, not structural. Every per-game volume rate is now regressed by the same
estimator the efficiency components use:

```
shrunk = (n · observed + k · prior) / (n + k)          n = games observed, k = 3
```

Written as a convex combination the weight on observation is `n / (n + k)` — a smooth rational
function of sample size with no threshold, no branch and no discontinuity:

| games observed | weight on observation |
|---|---|
| 1 | 25% |
| 3 | 50% (the declared equal-weight point) |
| 8 | 73% |
| 17 | 85% |

**Denominator.** Games, because the quantity being regressed is a per-game rate: games are the
exposure count for "how often does this player do X in a game", exactly as carries are the
exposure count for yards per carry. It is observed, never assumed.

**Why three games.** It is the shortest run over which a coaching staff is itself described as
having handed a back the job — one game is an injury fill-in or a blowout, two is a pattern
nobody commits to, three consecutive games at a workload is a role. It is also the same order
of magnitude as the existing efficiency pseudo-counts expressed in games (130 pseudo-carries is
about eight games at a lead-back load), so the two families of shrinkage are calibrated on a
comparable scale.

**Priors.** Authored football statements describing the MODAL rostered player — not the average
starter, because a roster carries three or four backs and only one is a feature back. They are
not fitted to the ingested seasons; fitting them would embed the ingestion window in every
valuation and leak across as-of dates, for the same reason the anchors are fixed (§5.3).

| Prior | Value | Placement |
|---|---|---|
| RB carries/game | 6.0 | between the "situational" (4) and "committee" (8) anchors |
| RB targets/game | 1.5 | between the 1.0 and 2.0 anchors |
| RB receiving yards/game | 9.0 | 1.5 targets × ~76% catch × ~7.5 yards ≈ 8.6 |
| TE targets/game | 2.2 | between the 1.5 and 2.5 anchors |
| TE receiving yards/game | 16.0 | 2.2 targets × the model's own 0.68 catch and 10.8 YPR priors |

**Scope and honesty.** The RAW rate is still what the role label and the explanations quote, so
every number a reader sees remains a fact about what happened; only the component SCORE is
regularized. An unobserved column is still dropped and its horizon weight renormalized —
shrinkage never turns "we did not see this" into the prior. An observed zero *is* regressed,
deliberately: a back who did not carry in his only appearance has shown far less than one who
did not carry in seventeen, and `n / (n + k)` is exactly the function that separates them. The
`INSUFFICIENT` gates read career totals and are untouched, so a player with no usage at all is
still refused rather than scored at the prior. Confidence is unchanged — this is a correction to
the mathematics, not a disclosure downgrade.

**What the guarantee is.** Shrinkage bounds the weight on the observation, not its magnitude, so
the protection is domain-bounded rather than absolute. Solving for the tie point, a single game
would need **49.5 carries** to match a 17-game elite season's `RV`; the NFL single-game
rushing-attempt record is 45. Across the whole physically realisable range, a one-game sample
cannot dominate a proven season.

**Live effect** (as-of 2026-02-15, seasons 2023–2025): coverage, tier counts, blocker counts,
role labels and confidence all unchanged; 393 accessible valuations moved by a mean of 2.15
points, maximum 10.10. The top of both boards is stable (RB and TE top-25 mean −1.9 / −2.4, all
named elite ranks held), and the sparse cohort compressed toward the prior — RB 1–2 game maximum
fell 53.2 → 49.7, and the best-ranked sub-8-game RB fell from 41st to 49th.

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

### 5.3a Availability, durability and staleness

**Availability** is a coarse, weekly-resolution roster signal — nflverse publishes no injury
feed. It distinguishes two states the provider's data conflates under "inactive":

| State | Score | Meaning |
|---|---|---|
| `HEALTHY` | 100 | Active at the as-of |
| `QUESTIONABLE` | 70 | Injury designation, likely to play |
| `UNKNOWN` | 55 | No source attests a status at the as-of |
| `NOT_ROSTERED` | 40 | Not on an active roster, **no injury signal** |
| `DOUBTFUL` | 35 | Injury designation, unlikely to play |
| `OUT` / `IR` / `PUP` | 5 | Injury designation keeping him out |
| `SUSPENDED` | 0 | — |

`NOT_ROSTERED` exists because at an offseason as-of it describes **188 of 417 (45%)** of the
live RB/TE population — free agents and players between contracts. Scoring that as `OUT` claimed
nearly half the league was injured. Only an explicit injury designation now earns the severe
score.

**Durability** divides games appeared in by **team weeks the player was on a roster** (from the
weekly-roster export), not by `seasons × 17`. The latter charged a mid-season signing for games
played before he joined the team: a back signed in week 10 who then played all eight remaining
games scored 29/100. When no roster week is attested the component is dropped rather than
guessed.

**Staleness** compares the newest observed game against the as-of, flagging a gap over 365 days.
This cannot use the `recent` window: that window is the last 8 games of a player's *career*, so
it is never empty for anyone with a game and could never detect a player whose last appearance
was two seasons ago. Before the fix the `STALE_PRODUCTION` penalty was unreachable dead code; it
now fires for 72 of 226 valued RBs.

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

**Confidence and coverage are separate questions, and they are published separately.**

| | Question | Property of | Published as |
|---|---|---|---|
| Coverage | How much of the intended input set exists for this valuation? | the model **tier** — identical for every player it values | `modelTier` → Full / Standard / Limited, plus `materialMissingInputs` |
| Confidence | How stable is **this player's** valuation, given the evidence actually available? | the **player** | `confidence.score` / `confidence.label` |

### Why they were split

Confidence used to start from a ceiling of 74 and then subtract three penalties every
accessible player carried by construction — no participation data, no red-zone usage, no team
context — worth 21 points between them. The arithmetic was `74 − 21 = 53`, so 53 was the best
score any running back, receiver or tight end could reach, HIGH was unreachable for 82% of the
board, and the LOW/MEDIUM line at 50 turned on roughly three points of genuine per-player
difference. Bijan Robinson, the board's most valuable asset, scored 53; Ashton Jeanty at ninth
scored 47 and was labelled LOW. Neither number described how much to trust the valuation — both
described which columns the tier lacks, which is the same for all of them.

A constant subtracted from every member of a set carries no information about any member of it.
So the constants moved to coverage, where they are a true statement, and confidence now measures
only what varies between players.

There is deliberately **no ceiling**. Limited coverage does not imply an unreliable valuation: a
receiver with five seasons of measured usage is well evidenced for what this model asks of him,
whatever a premium feed would add. `Coverage: Standard` with `Confidence: High` is a legitimate
and common combination.

### The sample term

Confidence **starts** from sample size rather than deducting for it, because every other number
the model produces rests on it. The base is the shrinkage weight the model already declares in
`VOLUME_PSEUDO_GAMES`:

```
confidence base = 100 × n / (n + 3)        n = career games observed
```

| n | 1 | 4 | 8 | 17 | 48 | 90 |
|---|---|---|---|---|---|---|
| base | 25 | 57 | 73 | 85 | 94 | 97 |

This replaced two threshold penalties (14 for "under 8 career games", a further 12 for "under
4"). Both were cliffs — a player at 8 games scored 14 points above one at 7 — and both were
sized against a ceiling that no longer exists. Read against the full 0–100 range they were far
too small: a running back with **four** career games came out at 80 and was labelled HIGH, which
is a worse falsehood than the ceiling that was removed. The shrinkage weight has no cliff, is
already justified in football terms, and is the model's own existing statement about sample size
rather than a second one invented for the confidence scale. It cannot reach 100, which is
correct and is not a coverage cap: no finite number of games makes a projection certain.

### Penalties (subtracted from the sample term)

Every one names something about **this player** that could not be established.

| Code | Cost | When |
|---|---|---|
| `AGE_UNKNOWN` | 12 | No birth date, so no age curve |
| `STALE_PRODUCTION` | 8 | No game within 365 days of the as-of |
| `NO_TRAJECTORY` | 6 | Only one season observed |
| `STATUS_UNATTESTED` | 6 | No roster status attested at the as-of |
| `NO_TARGET_DEPTH` | 5 | Air yards never published for the role window (WR) |
| `NO_TEAM_SHARES` | 4 | Shares not reconstructible |
| `DRAFT_ROUND_UNKNOWN` | 4 | No draft round attested (WR) |

The three tier-wide codes (`NO_PARTICIPATION_DATA`, `NO_HIGH_VALUE_USAGE_DATA`,
`NO_TEAM_CONTEXT`) no longer exist. What they described is reported through
`materialMissingInputs` and the published tier.

### Publication

The published confidence for an accessible-tier player **is** this model's own score. It used to
be `min(AIL public confidence, this score)`; that cap described the completeness of the *full*
model's input set — incomplete by definition here — and on WR it dominated, because the frozen
engine runs before being stood down for want of route evidence and its own confidence came out
at or below 10 for every receiver.

### Live distribution

616 players, seasons 2025, as-of `2026-09-11`:

| Tier | n | HIGH | MEDIUM | LOW | none |
|---|---|---|---|---|---|
| Full (QB) | 81 | 0 | 4 | 77 | 0 |
| Standard | 495 | 209 | 225 | 61 | 0 |
| Limited | 40 | — | — | — | 40 |

Accessible confidence: min 11, p25 61, median 73, p75 77, max 79. The maximum is bounded by the
ingested career window — one season, so at most 17 games and a sample term of 85 — not by any
tier rule.

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

Confidence distribution at that as-of predates the coverage/confidence split (§6); see the live distribution there for the current scheme.

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
9. **No replacement-level baseline.** Values are absolute 0–100 scores, not value over
   replacement. A dynasty market ultimately wants VOR, which needs a defined replacement
   population per position; that is future work and does not affect ordering.
10. **`career_touches` in the FROZEN RB engine is defined as carries + targets**
    (`src/ingestion/observedFacts.ts`), where a touch is conventionally carries + *receptions*.
    The accessible model uses carries + receptions for its own yards-per-touch. The frozen
    definition was left untouched because it is part of a frozen contract and that tier does not
    currently run for RB, but it should be revisited whenever the RB FULL tier is restored.
11. **Ties.** 1dp rounding leaves 72 of 226 RBs and 55 of 167 TEs sharing a value with at least
    one other player (largest tie: 4). Ranks break ties on canonical id, so ordering is total
    and replay-stable, but a tie is not a claim that two players are equally valuable.

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
