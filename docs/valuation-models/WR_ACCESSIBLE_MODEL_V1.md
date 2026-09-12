# WR ACCESSIBLE model (`wr-accessible-1.0`)

**WR FULL is the premium-data engine. WR ACCESSIBLE is the production engine for the current
free-data environment.** Both exist, both are reachable, and the tier published on every player
names the one that produced his number.

## 1. Why a second WR model exists

The frozen WR engine (`WR_VALUATION_MODEL_v1.2_FINAL.md`) is a route-and-expectation model. Four
inputs sit at the centre of it and no free source publishes any of them:

| input | what it does in the engine |
|---|---|
| `career_routes` | the exposure denominator for every per-route rate |
| `targets_per_route_run` | target earning per opportunity — the engine's core signal |
| `expected_fantasy_points_per_target` | target quality |
| `catch_rate_over_expected` | hands against expectation |

WR alone has an approved proxy ladder for career routes (REGISTRY §8.1 rungs 2/3), so readiness
passed and the engine ran. It ran on its own fallback table:

| resolved value | every receiver received |
|---|---|
| route participation (last 4 / last 8) | 0.5 |
| targets per route run | 0.18 |
| expected fantasy points per target | the reference median |
| catch rate over expected | exactly 0.0 |

Those are the same numbers for all 309 valued receivers, so the components built on them carried
no information. The engine's own confidence reported it correctly: **every WR came out at 8.**

Nothing here is a criticism of the engine. It is the right model for the data it was specified
against, and it is preserved untouched for the day that data arrives.

## 2. Inputs the accessible model uses, and why

Every one is a column nflverse publishes in an export PlayerTicker already downloads.

| input | source | why it is in the model |
|---|---|---|
| targets | weekly player stats | opportunity, the strongest free WR signal |
| target share | weekly player stats (**provider-measured**) | a receiver's claim on a finite resource |
| receiving air yards | weekly player stats | intended downfield volume; the only free target-quality signal |
| receptions | weekly player stats | catch rate, with targets |
| receiving yards | weekly player stats | production, and yards per target with targets |
| receiving TDs | weekly player stats | scoring |
| games played | weekly player stats | every rate's denominator, and the shrinkage sample |
| rostered team weeks | weekly rosters | the honest durability denominator |
| age | player metadata | the dynasty horizon |
| draft round | player metadata | a decaying prior on opportunity (§4) |
| roster / injury state | rosters | availability |

Target share deserves a note. `ObservedProduction.teamShares.targetShare` is **reconstructed** —
it sums only the players the snapshot holds rows for, so its denominator is a floor and the share
an upper bound. nflverse also publishes its own weekly `target_share`, from which the real
denominator is recoverable as `targets ÷ target_share`. The model prefers the measurement and
falls back to the bound, and falling back costs confidence.

### Inputs deliberately NOT used

- **Anything route-based.** No proxy, no estimate, no substitute. That is the whole point.
- **Team offensive context** (dropbacks, points per drive, QB environment). Derivable later, but
  it has no producer today, so including it would mean including a constant.
- **Red-zone and goal-line target rate.** Needs play-by-play aggregation PlayerTicker does not
  yet do. Listed in §8 as derivable.
- **Snap share.** Participation coverage is partial and era-dependent.
- **Contract security.** Requires contract data. The frozen engine resolves it from draft round
  for every receiver, which is one of the ways draft position becomes a permanent grade there.

## 3. Components

Ten, each 0–100. The structure is WR's own, not the TE model's retuned.

| code | component | measurement |
|---|---|---|
| TS | Target share | provider-measured share of team targets, role window |
| OP | Opportunity | targets per game (0.62) and air yards per game (0.38), shrunk by games |
| PR | Production | receiving yards per game, role window, shrunk by games |
| EF | Efficiency | yards per target (0.60) and catch rate (0.40), shrunk by career targets |
| SC | Scoring | receiving TDs per game, shrunk |
| TR | Trajectory | latest season per-game targets against the prior season |
| AG | Age | WR age curve |
| DC | Draft capital | draft round, weight decaying with games observed |
| AV | Availability | point-in-time roster state |
| DU | Durability | share of rostered team weeks appeared in |

### Three structural differences from the TE accessible model

1. **Target share is the headline component, not a supporting one.** Receiver value is a claim
   on the passing game and share states that claim directly. At tight end, share is diluted by
   the blocking half of the job and volume describes the role better.
2. **Air yards enter opportunity.** Two receivers can draw identical targets and be aimed at
   very different places. Air yards per game is used as **volume** rather than as an average,
   because average depth is not monotone in value — a nineteen-yard average describes a
   boom-and-bust role, not a better one — while total intended yardage is. Depth still appears,
   in the role label and the explanations.
3. **Efficiency is per target, not per reception.** Yards per reception rewards a receiver for
   the targets he failed to catch by excluding them. Yards per target is the rate the
   opportunity actually returned, and it prices catch rate and depth together.

### Horizon weights

```
weekly    TS .22  OP .19  PR .16  EF .08  SC .07  TR .03  AG .02  DC .01  AV .19  DU .03
ros       TS .23  OP .19  PR .15  EF .09  SC .06  TR .05  AG .05  DC .02  AV .12  DU .04
oneYear   TS .23  OP .18  PR .14  EF .09  SC .06  TR .07  AG .10  DC .03  AV .05  DU .05
threeYear TS .21  OP .17  PR .13  EF .09  SC .05  TR .08  AG .14  DC .04  AV .02  DU .07
dynasty   TS .20  OP .16  PR .13  EF .09  SC .05  TR .09  AG .16  DC .05  AV .00  DU .07
```

The governing constraint: **observed football outweighs biography at every horizon, dynasty
included.** On the dynasty horizon the six evidence components carry 0.72 against 0.21 for age
and draft capital combined. The frozen engine puts 0.25 on its age-and-development component
alone, plus 0.23 on a Role Durability component whose contract-security input is itself resolved
from draft round.

Headline position value is the same documented blend the RB and TE accessible models use:
`ros .15 + oneYear .30 + threeYear .30 + dynasty .25`. Dynasty alone made age the primary sort
key for the whole board, which is why none of the three uses it as the headline.

## 4. Draft capital decays

`weight on draft capital = k / (games + k)`, with `k = 16` games.

| games observed | weight on draft round |
|---|---|
| 0 | 1.00 |
| 16 (one season) | 0.50 |
| 48 (three seasons) | 0.25 |

Draft position is a statement about the opportunity a team intends to give a player, which is
exactly what TS, OP and PR measure directly. So it is a **prior the observed record supersedes**,
never standing evidence. With no games it is the only signal there is; by three seasons the
football has taken over. This is what prevents draft position behaving like a permanent grade,
and it means the model contains no rookie penalty and no veteran bonus — only the age curve and
the evidence.

## 5. Tier routing

Objective, and it reads only presence and provenance:

```
FULL          every field in WR_FULL_REQUIRED_EVIDENCE is present AND its provenance is
              DIRECT or DERIVED (or it arrived as an observed fact)
ACCESSIBLE    the above is not satisfied, and the accessible model has a game record with
              at least one target
INSUFFICIENT  neither can run honestly
```

A PROXY or MODEL_ESTIMATE does **not** satisfy the gate. That is the case the gate exists to
catch: a capped route estimate previously kept the FULL badge on a valuation built from league
constants.

The rule is given no player name, no market rank and no hand-picked list, so it cannot consult
one. `wrPremiumEvidenceSatisfied` in `src/inference/production/modelTier.ts`.

## 6. How WR FULL is preserved

- `src/wr-model/**` is **unmodified**. No weight, no reference distribution, no fallback table,
  no premium input definition, no component formula changed.
- The engine is still **tried first**, still runs, and its output is still retained on the
  inference envelope (`engine_output`) even when the player is published at ACCESSIBLE. That is
  what makes the comparison in §7 possible at all.
- `WR_VALUATION_MODEL_v1.2_FINAL.md` remains the spec of record for the FULL path.
- Reactivation needs **no code change**. Supply the four fields and the gate opens. A test
  exercises exactly that: `routes WR back to FULL the moment the premium evidence is genuinely
  supplied`, in `src/inference/production/modelTier.test.ts`.
- No vendor's field names appear in the model contract, the gate, or the registry. The gate
  names the engine's own declared inputs, so any source that fills them satisfies it.

## 7. What changed downstream

`projectPublishedPlayer` now selects which model's numbers to publish **by the published tier**
rather than by which output happens to be present. For QB, RB and TE the two readings agree. WR
is the exception — a stood-down receiver carries both outputs — and reading by presence there
would publish the premium engine's numbers under an ACCESSIBLE badge, which is the exact
mislabelling the tier exists to prevent.

Volatility is a frozen-engine output describing the FULL model's input set, so it is withheld on
the accessible tier rather than borrowed.

WR normalized-input checksums change, because WR normalized input now carries the observed-
production channel. WR **engine** output does not change: production is a separate channel and is
never merged into a frozen engine's supplement.

## 8. Promotion path — what would move a WR from ACCESSIBLE to FULL

| missing input | classification | note |
|---|---|---|
| `career_routes` | **requires premium provider** | nflverse participation covers ~43% of plays and has no approved career-cumulative methodology; the existing ladder yields a capped PROXY, which the gate rejects by design |
| `targets_per_route_run` | **requires premium provider** | needs a route denominator; follows directly once career routes are real |
| `expected_fantasy_points_per_target` | **methodology-specific** | needs an expected-points model over target location and coverage; a provider could supply it, or PlayerTicker could specify one over play-by-play |
| `catch_rate_over_expected` | **methodology-specific** | needs a catch-probability model; same two routes |
| `expected_td_rate_per_target` | **methodology-specific** | same |
| `average_depth_of_target` | **already derivable — and now derived** | air yards ÷ targets; the accessible model uses it |
| `target_share` | **already derivable — and now measured** | provider's own weekly share |
| `red_zone_target_rate` | **derivable from nflverse later** | needs play-by-play field-position aggregation PlayerTicker does not yet run |
| `projected_team_dropbacks` | **derivable from nflverse later** | team pass-rate aggregation |
| `qb_environment_score`, `team_points_per_drive` | **derivable from nflverse later** | team-level aggregation from play-by-play |
| `contract_security` | **requires contract/source data** | no free source; the frozen engine resolves it from draft round |
| `competition_pressure` | **derivable from nflverse later** | needs a teammate depth-chart view |

Two premium inputs and three methodology-specific ones stand between today and a genuine FULL
valuation. A licensed charting feed would supply all five; PlayerTicker could specify the three
methodology-specific ones itself given play-by-play work. Neither path requires a change to the
engine interface or the tier gate.
