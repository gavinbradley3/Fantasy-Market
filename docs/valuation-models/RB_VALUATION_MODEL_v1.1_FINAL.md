# RB_VALUATION_MODEL_v1.1_FINAL.md

**Document status:** Position-specific model specification. Version 1.1 (final hardened MVP specification).  
**Governing authority:** `MARKET_MODEL_FOUNDATION_V2.md` (the Foundation). Where this document and the Foundation conflict, the Foundation controls without exception.  
**Shared platform standard:** `WR_VALUATION_MODEL.md` v1.2. Shared architecture, terminology, output philosophy, confidence philosophy, volatility philosophy, fallback philosophy, testing philosophy, and implementation-contract structure are inherited unless this document explicitly defines RB-specific behavior.  
**Position scope:** NFL running backs, including rookies, committee backs, receiving specialists, goal-line specialists, injured-return players, and veterans changing teams. Excludes fullbacks unless they are fantasy-relevant ball carriers, wide receivers with gadget rushing roles, and quarterbacks with designed rushing usage.  
**Horizons:** Weekly, Rest of Season (ROS), One Year, Three Years, Dynasty.  
**Reference league schema:** 12-team, PPR, 1QB / 2RB / 2WR / 1TE / 1FLEX (RB/WR/TE), standard bench. Half-PPR and standard scoring are supported through the scoring vector in Section 12. The reference schema is a quotation convention, never a claim of universal value.

---

## 1. Document Authority and Scope

### 1.1 What this document defines

This document defines the running back position model: the estimands, RB-specific signals, formulas, provisional weights, shrinkage rules, interactions, update rules, priors, fallbacks, confidence contributors, volatility contributors, explanation drivers, validation plan, and MVP implementation specification required to produce:

1. **Expected Fantasy Output (EFO)** for running backs at Weekly, ROS, One Year, Three Years, and Dynasty horizons.
2. **Inputs to Fundamental Player Utility (FPU):** games-active distributions, workload-state probabilities, role-survival probabilities, career-state transitions, and conditional upside/downside scenarios.
3. **RB-specific contributors** to the shared uncertainty and volatility frameworks.
4. **Structured explanation drivers** compatible with the WR engine and wider platform.

### 1.2 Uses shared platform standard

The following are inherited without redesign:

- deterministic calculations for the first hobby MVP;
- two-track architecture separating EFO from component composites;
- percentile-based component scores;
- confidence never changing value;
- volatility represented separately from confidence;
- transparent fallback logging;
- no silent zero imputation;
- point-in-time snapshots;
- versioned output records;
- explanation drivers as attributions, not causal claims;
- no market-price, consensus-rank, ADP, trade calculator, or sentiment inputs;
- Section 26 as the sole binding authority for Version 1 implementation.

### 1.3 What this document intentionally does not define

- Observed Market Price.
- Intrinsic Asset Value or common latent-unit mapping.
- Mispricing classification.
- Replacement baselines, scarcity curves, or lineup utility.
- QB, WR, TE, pick, package, or roster models.
- Medical diagnosis.
- Proprietary tracking-only metrics as required MVP inputs.

### 1.4 Foundation interpretation rule — position-specific answers

1. **Estimand:** the mathematical objects in Section 3, culminating in RB EFO by horizon.
2. **Native unit:** fantasy points per game and horizon window; carries, targets, receptions, yards, touchdowns, rates, shares, and probabilities.
3. **Permitted inputs:** football workload, rushing, receiving, red-zone, team, age, contract, draft, and injury data listed in Sections 5–6.
4. **Forbidden inputs:** market prices, dynasty rankings, redraft rankings, ADP, trade calculators, social sentiment, acquisition frequency, and platform-published values.
5. **Conditioning:** league schema, scoring vector, horizon, valuation timestamp, information cutoff.
6. **Uncertainty:** shared objects; RB-specific contributors defined in Section 16.
7. **Downstream consumers:** shared utility, confidence, volatility, explanation, and market layers.
8. **Validation:** Section 21.
9. **Historical reproduction:** versioned inputs and point-in-time snapshots.
10. **Explanation:** Section 20.

### 1.5 Evidence tags

Uses shared platform standard:

- **[ES]** Evidence Supported
- **[SPR]** Strong Public Research
- **[IC]** Industry Consensus
- **[EI]** Expert Informed
- **[PH]** Product Hypothesis
- **[TP]** Temporary Placeholder

All numerical weights, caps, priors, thresholds, age multipliers, and shrinkage constants are [TP] unless stated otherwise.

---

## 2. Running Back Modeling Thesis

This section is binding. Every RB-specific rule must trace to one or more theses.

**T1 — Opportunity is the primary weekly engine.** Running back fantasy production is driven first by being active, being on the field, receiving carries, running routes, and receiving targets. Efficiency cannot rescue a player without touches. [SPR]

**T2 — Carries are not interchangeable.** A carry at the opponent 2-yard line is not equivalent to a carry at a team’s own 20. Short-yardage and goal-line opportunities carry disproportionate touchdown value and must be modeled separately. [SPR]

**T3 — Receiving usage provides floor and role insulation.** Routes, targets, and receptions add direct PPR value and make an RB less dependent on game script, rushing efficiency, and touchdowns. [SPR]

**T4 — Raw yards per carry is noisy and context-contaminated.** YPC is affected by offensive line play, box counts, game state, scheme, long runs, and sample size. It must be heavily shrunk and must never substitute for workload evidence. [SPR]

**T5 — Touchdowns regress heavily.** Realized rushing touchdown rate and goal-line conversion are noisy. Expected touchdowns should come from goal-line share, red-zone share, team scoring environment, and expected opportunities. [SPR]

**T6 — Explosive runs matter, but one run must not dominate.** Long-run ability has football value, but single explosive plays create unstable YPC and fantasy spikes. The MVP caps the influence of rushing efficiency and separates explosive-play dependence into volatility. [SPR]

**T7 — Team environment creates the opportunity pool.** Pace, rush volume, scoring trips, offensive quality, and quarterback behavior determine how many useful RB opportunities exist. Team context acts through projected carries, targets, and touchdown opportunities, not as a generic bonus. [SPR]

**T8 — Committee structure is a first-class state.** A running back may have fantasy relevance without a dominant snap share. Carry share, route share, target share, third-down role, and goal-line role can be split across multiple players. [ES]

**T9 — Current role size and role durability are separate.** A 60% snap role held by a first-round rookie under contract is not as fragile as the same role held by a replacement-level veteran ahead of a returning teammate. [IC]

**T10 — RB age curves are earlier and steeper than WR age curves.** Age and accumulated workload affect one-year and dynasty outlooks materially, but they must enter as probability and drift adjustments rather than arbitrary cliffs. [SPR]

**T11 — Injury affects availability, workload, efficiency, and recurrence separately.** A player can be active but limited, fully active but at elevated recurrence risk, or healthy now with long-term durability concerns. [IC]

**T12 — Small-sample role evidence can be more informative than small-sample efficiency.** A rookie receiving 70% of snaps and all goal-line work has revealed more about team intent than a small YPC sample reveals about talent. [SPR]

**T13 — Prospect signals belong in priors only.** Draft capital, college production, athletic testing, and receiving profile initialize expectations. NFL usage progressively replaces them. [SPR]

**T14 — Market information never enters.** The model evaluates football utility only. Market reaction is structurally inaccessible.

---

## 3. Estimands

### 3.1 State and availability estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E1 | **P(active)_w** | Probability the RB is active in week *w* | probability |
| E2 | **SnapShare_w** | Offensive snap share distribution | rate [0,1] |
| E3 | **RoleState_t** | Probability vector over Section 4 states | probability simplex |
| E4 | **G_h** | Games-active distribution over horizon *h* | count distribution |

### 3.2 Rushing opportunity estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E5 | **TeamRush_w** | Projected non-QB team rush attempts per game | count |
| E6 | **CarryShare_w** | Player share of team RB carries | rate [0,1] |
| E7 | **GLShare_w** | Player share of team RB carries inside the 5 | rate [0,1] |
| E8 | **RZShare_w** | Player share of team RB carries inside the 20 | rate [0,1] |

### 3.3 Receiving opportunity estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E9 | **RouteParticipation_w** | Player routes ÷ team dropbacks | rate [0,1] |
| E10 | **TPRR** | Targets per route run | rate |
| E11 | **RBTargetShare** | RB targets ÷ team targets, derived check/fallback | rate [0,1] |

### 3.4 Conversion estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E12 | **RushYardsPerCarry** | Shrunk expected rushing yards per carry | yards |
| E13 | **CatchRate** | Expected receptions per target | probability |
| E14 | **RecYardsPerReception** | Expected receiving yards per reception | yards |
| E15 | **xRushTD** | Expected rushing touchdowns from location and role | count/rate |
| E16 | **xRecTD** | Expected receiving touchdowns from target role | count/rate |

### 3.5 Output estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E17 | **EFO_weekly** | Next-game fantasy output | fantasy points |
| E18 | **EFO_ROS** | Remaining-season fantasy output | fantasy points |
| E19 | **EFO_1yr** | Next-full-season output | fantasy points |
| E20 | **EFO_3yr inputs** | Per-season outputs and role-survival probabilities | fantasy points, probabilities |
| E21 | **Dynasty inputs** | Career-state probabilities and terminal continuation inputs | probabilities |

### 3.6 Explicit non-estimands

This model does not estimate market price, universal RB value, trade demand, positional scarcity, or mispricing.

---

## 4. Running Back State Model

### 4.1 Role states

States describe deployment, not talent.

| State | Code | Operational definition using shrunk trailing evidence |
|---|---|---|
| Inactive / unavailable | S0 | Not active, suspended, unsigned, IR/PUP, or healthy scratch |
| Rostered depth | S1 | Active, snap share < 15%, carry share < 15% |
| Change-of-pace reserve | S2 | Snap share 15–34%; limited carries/routes |
| Receiving specialist | S3 | Snap share 20–49%; route participation or target rate materially exceeds carry role |
| Goal-line specialist | S4 | Snap share 15–49%; goal-line share materially exceeds carry and route shares |
| Committee back | S5 | Snap share 35–59%; meaningful rushing or receiving role |
| Lead back | S6 | Snap share 60–74% or carry share ≥ 60%; meaningful routes or goal-line work |
| Three-down bell cow | S7 | Snap share ≥ 75%, carry share ≥ 65%, route participation ≥ 55% |

Attachable flags:

- **RT — role threatened:** declining workload, incoming competition, teammate return, benching, or uncertain contract.
- **TD-dependent:** projected touchdown points exceed 35% of active-game fantasy points.
- **REC-dependent:** projected reception points exceed 35% of active-game fantasy points.
- **fragile-workload:** high projected touches with low contract security, injury ambiguity, or recent unsustainable role spike.

### 4.2 Boundary smoothing

Uses shared platform standard. Thresholds define state regions, not hard assignments. Posterior distributions over snap share, carry share, route participation, and goal-line share are mapped to state probabilities.

### 4.3 Hybrid representation

Continuous workload estimates drive EFO. Discrete states drive explanations, multi-year transitions, state uncertainty, and event sensitivity.

### 4.4 Transition structure

Within-season transitions use Section 18 event rules. Between-season transitions use age-, durability-, contract-, and workload-conditioned annual matrices in the research model. The first hobby MVP defers fitted matrices and returns horizon composites only.

---

## 5. Signal Families

Format uses shared platform standard: definition, unit, observation window, importance, realistic availability, shrinkage, fallback, horizon relevance, and failure mode.

### 5.1 Availability and participation

#### 5.1.1 Games active

- **Definition:** games active ÷ games possible over the trailing three seasons.
- **Unit:** rate.
- **Window:** trailing three seasons, recency weighted.
- **Why:** availability is the first multiplicative gate.
- **Availability:** Tier 1, public roster/injury data.
- **Shrinkage:** beta-binomial toward RB positional base rate; stronger than WR due to greater missed-time variance.
- **Fallback:** rookie draft-capital cohort.
- **Horizons:** all.

#### 5.1.2 Injury designation and practice participation

Uses shared platform standard with RB-specific workload-ramp effects. A player can be active while projected below his pre-injury snap and touch role.

#### 5.1.3 Snap share

- **Definition:** offensive snaps ÷ team offensive snaps.
- **Window:** last 2/4/8 games.
- **Why:** broadest free role signal.
- **Availability:** Tier 1.
- **Failure mode:** pass protection and decoy snaps can inflate opportunity inference; therefore snap share is not sufficient alone.

#### 5.1.4 Expected snap share next game

Derived from shrunk recent share, injury state, teammate availability, depth-chart events, and post-return ramp.

### 5.2 Rushing workload

#### 5.2.1 Carry share

- **Definition:** player rush attempts ÷ team non-QB rush attempts while active.
- **Unit:** rate.
- **Window:** last 4/8 games and season-to-date.
- **Why:** primary rushing opportunity measure.
- **Availability:** Tier 1 from play-by-play.
- **Shrinkage:** fast; role evidence updates quickly.
- **Fallback:** depth chart + snap share + prior.
- **Failure:** game-script distortions and QB kneels/scrambles; exclude kneels and isolate designed non-QB rush pool.

#### 5.2.2 Carries per active game

- **Definition:** player rush attempts ÷ active games.
- **Why:** useful summary and fallback.
- **Rule:** not independent evidence when carry share and team rush volume are already available.

#### 5.2.3 Short-yardage share

- **Definition:** player share of RB carries with 1–2 yards to gain.
- **Why:** role trust and touchdown access.
- **Availability:** Tier 1 play-by-play.
- **MVP:** folded into goal-line/role durability rather than a standalone component.

#### 5.2.4 Goal-line share

- **Definition:** player share of team RB carries inside the opponent 5.
- **Why:** strongest public rushing-TD opportunity signal.
- **Shrinkage:** heavy because denominators are small.
- **Fallback:** red-zone carry share, then carry share.
- **Failure:** small samples and one-score games.

#### 5.2.5 Red-zone carry share

- **Definition:** player share of team RB carries inside the opponent 20.
- **Why:** stabilizes goal-line projection and captures scoring access.
- **Shrinkage:** moderate-to-heavy.

### 5.3 Receiving workload

#### 5.3.1 Route participation

- **Definition:** routes run ÷ team dropbacks.
- **Why:** receiving opportunity gate.
- **Availability:** paid charting preferred; Tier 1 proxy uses pass-play snaps adjusted for pass blocking.
- **RB proxy:** `proxy_routes = pass_play_snaps × 0.82` [TP]. RBs pass block materially more than WRs, so the proxy is less precise and receives one documented 15-point route-participation fallback penalty when used in Version 1; the same missing field is never penalized twice.
- **Failure:** two-minute and third-down backs may have highly concentrated routes.

#### 5.3.2 Targets per route run

- **Definition:** targets ÷ routes.
- **Why:** measures target earning within receiving deployment.
- **Shrinkage:** moderate; faster than rushing efficiency, slower than role share.
- **Fallback:** targets per team dropback while active.

#### 5.3.3 Target share

Derived check and fallback, not an additive duplicate of route participation × TPRR.

#### 5.3.4 Receptions per active game

Summary metric only. It never replaces route and target primitives.

### 5.4 Rushing efficiency

#### 5.4.1 Yards per carry

- **Definition:** rushing yards ÷ qualifying carries, excluding kneels.
- **Why:** broad efficiency summary.
- **Shrinkage:** heavy.
- **Fallback:** age/archetype league prior.
- **Failure:** long-run sensitivity, line/scheme contamination.

#### 5.4.2 Success rate

- **Definition:** percentage of carries generating positive EPA or context-appropriate success.
- **Why:** less explosive-play-sensitive than YPC.
- **Availability:** Tier 1 derived from play-by-play.
- **Shrinkage:** moderate.
- **MVP:** included where available; otherwise neutral fallback.

#### 5.4.3 Explosive run rate

- **Definition:** runs of 10+ yards ÷ carries.
- **Why:** captures breakaway contribution.
- **Rule:** used as a bounded modifier and volatility contributor, never as an uncapped additive boost.
- **Shrinkage:** heavy.

#### 5.4.4 Rush yards over team expectation proxy

- **Definition:** player YPC minus team non-player RB YPC, adjusted for broad down/distance buckets.
- **Why:** cheap context adjustment when tracking metrics are unavailable.
- **MVP:** optional derived signal; not required in Section 26.

### 5.5 Receiving efficiency

#### 5.5.1 Catch rate

Shrunk toward RB positional mean. Less depth variation than WR, but quarterback and target type still matter.

#### 5.5.2 Receiving yards per reception

Heavily shrunk; screen design and long YAC plays create variance.

#### 5.5.3 Receiving first-down rate

Deferred from the first MVP due to redundancy and data complexity.

### 5.6 Team environment

#### 5.6.1 Projected team non-QB rush attempts

- **Definition:** expected team designed RB rush attempts per game.
- **Inputs:** pace, game environment, coaching tendency, neutral-situation rush rate, quarterback rushing share.
- **Why:** the rushing opportunity pool.
- **Fallback:** league median.

#### 5.6.2 Projected team dropbacks

Required for receiving routes and target volume.

#### 5.6.3 Offensive scoring environment

- **Definition:** points per drive and red-zone trips per game, shrunk.
- **Why:** scales expected touchdown opportunities.

#### 5.6.4 Offensive line environment

- **MVP proxy:** team RB yards before contact proxy, stuff rate, and short-yardage conversion where available.
- **Rule:** small bounded effect only; do not create a proprietary line grade dependency.
- **Fallback:** neutral.

#### 5.6.5 Quarterback rushing pressure

- **Definition:** share of team designed rushes and goal-line rushes taken by the QB.
- **Why:** mobile quarterbacks can reduce RB carries and goal-line opportunities while changing rushing efficiency.
- **MVP:** represented as `qb_rush_pressure` from 0–1.

#### 5.6.6 Backfield competition index

- **Definition:** normalized claim of other active RBs on carries, routes, targets, and goal-line work.
- **Why:** committee structure caps expansion and raises volatility.
- **MVP:** simplified to competition pressure 0–1.

### 5.7 Role durability

Signals shift future role survival, not current weekly production:

- contract security;
- draft capital;
- age and career stage;
- current role trend;
- incoming competition;
- teammate return;
- coaching continuity;
- pass-protection trust proxy where available;
- special-teams/depth status for reserve players;
- fragile role created only by teammate injury.

### 5.8 Age, workload, and career stage

| Stage | Definition | Treatment |
|---|---|---|
| Rookie | 0 completed NFL seasons | Prospect prior; high uncertainty; role evidence updates fast |
| Year 2–3 | 1–2 completed seasons | Development possible; workload evidence dominates quickly |
| Prime | Age 23–25 | Strongest long-term retention baseline |
| Early decline | Age 26–27 | Mild decline/role-loss hazard |
| Aging veteran | Age 28–29 | Material role-loss and injury hazard |
| Late-career RB | Age 30+ | High decline and survival uncertainty; no automatic weekly penalty if role is intact |
| High-workload veteran | Any age with heavy recent touch accumulation | Added durability and availability risk, not direct weekly subtraction |
| Established elite | Multiple seasons of lead/bell-cow deployment | Strong current-role prior, but age and workload still apply |

No hard age cliff is permitted.

### 5.9 Injury and physical risk

Separate:

1. current probability active;
2. expected snap/touch ramp;
3. reinjury hazard;
4. long-term efficiency/role uncertainty;
5. information quality.

RB-specific ramp schedule in the research model:

- major lower-body return: 60% / 80% / 95% of prior workload across first three games [TP];
- minor injury return: 80% / 95% / 100% [TP];
- upper-body injury: workload ramp only if reporting or deployment supports it.

### 5.10 Prospect and prior information

For rookies and players with fewer than 150 NFL touches:

| Input | Role |
|---|---|
| Draft capital | Primary prior axis |
| Age-adjusted college production | Secondary |
| College target share / receiving production | Receiving-role prior |
| Early declare | Small positive |
| Athletic testing | Moderate for RB, especially speed/size profile, but never stronger than capital + production |
| Competition level | Adjustment to production |
| Early NFL snap/carry/route usage | Prior-killer |

Prospect information never appears as a live-season bonus.

---

## 6. MVP Signal Set

Seventeen core inputs survive for the RB engine.

| # | Signal | Source | Refresh | Purpose |
|---|---|---|---|---|
| 1 | Snap share | public weekly data | weekly | broad role backbone |
| 2 | Carry share | play-by-play | weekly | rushing workload |
| 3 | Carries per active game | weekly stats | weekly | fallback/check |
| 4 | Route participation or proxy | participation/snap data | weekly | receiving gate |
| 5 | TPRR | derived | weekly | target earning |
| 6 | Target share | play-by-play | weekly | fallback/check |
| 7 | Goal-line carry share | play-by-play | weekly | TD opportunity |
| 8 | Red-zone carry share | play-by-play | weekly | scoring access |
| 9 | Shrunk YPC | weekly stats | weekly | rushing conversion |
| 10 | Success rate | play-by-play | weekly | stable efficiency support |
| 11 | Catch rate | play-by-play | weekly | receiving conversion |
| 12 | Receiving yards/reception | weekly stats | weekly | receiving yardage |
| 13 | Team non-QB rush projection | derived | weekly | carry pool |
| 14 | Team dropback projection | derived | weekly | route pool |
| 15 | Scoring environment + QB rush pressure | derived | weekly/events | TD/context |
| 16 | Age, draft, contract, competition, coaching | public/derived | annual/events | durability and priors |
| 17 | Injury state + workload ramp | injury reports | daily in season | availability and limitation |

---

## 7. Core MVP Formula

### 7.1 Uses shared two-track architecture

- **Track A:** deterministic opportunity chain produces Weekly and ROS EFO.
- **Track B:** eight component scores produce internal horizon composites for priors, explanations, sanity checks, and future multi-year transitions.

EFO is never calculated from the RB Composite.

### 7.2 RB component scores

1. **Workload Role (WRK)** — current snap, carry, and route deployment.
2. **Opportunity Quality (OQ)** — goal-line, red-zone, and receiving opportunity quality.
3. **Rushing Efficiency (RE)** — heavily shrunk conversion on carries.
4. **Receiving Utility (RU)** — routes, target earning, and receiving conversion.
5. **Team Context (TC)** — rush pool, dropback pool, scoring environment, QB pressure.
6. **Role Durability (RD)** — likelihood the role persists.
7. **Age & Development (AD)** — horizon-scaled career trajectory.
8. **Availability (AV)** — probability active and workload limitation.

Each score is 0–100, where 50 is approximately a rosterable but replaceable active RB reference level.

### 7.3 Provisional horizon weights

| Component | Weekly | ROS | One Year | Three Years | Dynasty |
|---|---:|---:|---:|---:|---:|
| Workload Role | 27 | 24 | 18 | 13 | 10 |
| Opportunity Quality | 15 | 15 | 13 | 10 | 8 |
| Rushing Efficiency | 5 | 6 | 7 | 7 | 6 |
| Receiving Utility | 14 | 15 | 15 | 14 | 13 |
| Team Context | 12 | 10 | 8 | 5 | 3 |
| Role Durability | 5 | 13 | 20 | 24 | 25 |
| Age & Development | 2 | 4 | 14 | 23 | 31 |
| Availability | 20 | 13 | 5 | 4 | 4 |
| **Total** | **100** | **100** | **100** | **100** | **100** |

### 7.4 Weight rationale

- Workload dominates Weekly and ROS.
- Receiving Utility retains more long-term weight than pure rushing efficiency because receiving roles are valuable and often more stable.
- Rushing Efficiency remains low because it is noisy and context-dependent.
- Role Durability and Age dominate multi-year horizons.
- Team Context decays sharply because team environment is unstable beyond one season.
- Availability is large weekly but not double-counted into dynasty, where durability already carries much of the risk.

---

## 8. Component Construction

All inputs are shrunk before formulas. Percentiles use the frozen active-RB universe.

### 8.1 Workload Role — WRK

```text
WRK = 0.40 × pct(shrunk_snap_share_last4)
    + 0.30 × pct(shrunk_carry_share_last4)
    + 0.15 × pct(shrunk_route_participation_last4)
    + 0.10 × pct(shrunk_snap_share_last8)
    + 0.05 × workload_trend_score
```

If route participation uses the RB proxy, WRK is capped at 95 only when the route term is the sole reason the score exceeds 95.

### 8.2 Opportunity Quality — OQ

```text
OQ = 0.40 × pct(shrunk_goal_line_share)
   + 0.25 × pct(shrunk_red_zone_share)
   + 0.20 × pct(projected_targets_per_game)
   + 0.15 × pct(scoring_environment)
```

Goal-line share cannot create high OQ by itself when projected total touches are below 6 per game:

```text
if projected_touches < 6:
    OQ = min(OQ, 70)
```

### 8.3 Rushing Efficiency — RE

```text
RE = 0.55 × pct(shrunk_yards_per_carry)
   + 0.30 × pct(shrunk_success_rate)
   + 0.15 × pct(shrunk_explosive_run_rate)
```

Caps:

- fewer than 75 career carries: RE ∈ [25,75];
- fewer than 150 career carries: RE ∈ [15,85];
- explosive-run term cannot move RE by more than 8 points from the non-explosive baseline.

### 8.4 Receiving Utility — RU

```text
RU = 0.35 × pct(shrunk_route_participation)
   + 0.30 × pct(shrunk_TPRR)
   + 0.20 × pct(shrunk_target_share)
   + 0.10 × pct(shrunk_catch_rate)
   + 0.05 × pct(shrunk_receiving_yards_per_reception)
```

Target share is retained at low weight as a fallback/check because route data are weaker for RB than WR.

### 8.5 Team Context — TC

```text
TC = 0.35 × pct(projected_team_non_qb_rush_attempts)
   + 0.20 × pct(projected_team_dropbacks)
   + 0.25 × pct(team_points_per_drive)
   + 0.10 × pct(team_red_zone_trips)
   + 0.10 × (100 - qb_rush_pressure × 100)
```

### 8.6 Role Durability — RD

```text
RD = 50
   + 16 × contract_security
   + 10 × draft_capital_security
   + role_change_adjustment
   - 18 × competition_pressure
   - 8 × teammate_return_flag
   - 8 × incoming_competition_flag
   + 5 × coaching_continuity_signal
   + elite_role_bonus
   - fragile_role_penalty
```

Where:

```text
role_change_adjustment = +10 promoted | -10 demoted | 0 stable/unknown
elite_role_bonus = +8 if two prior seasons in S6/S7, else 0
fragile_role_penalty = 8 if current role exists primarily due to teammate absence, else 0
coaching_continuity_signal = +1 continuity | -1 confirmed new system | 0 unknown
```

Clamp to [0,100].

### 8.7 Age & Development — AD

| Age | Development drift | Annual role-survival multiplier | AD base |
|---|---:|---:|---:|
| 20–21 | +8 | 0.96 | 82 |
| 22 | +6 | 0.98 | 78 |
| 23 | +4 | 1.00 | 74 |
| 24–25 | +1 | 1.00 | 68 |
| 26 | -2 | 0.95 | 56 |
| 27 | -4 | 0.89 | 45 |
| 28 | -7 | 0.80 | 34 |
| 29 | -10 | 0.68 | 24 |
| 30+ | -13 | 0.52 | 14 |

Adjustments:

```text
AD = age_base
   + 5 × year2_flag
   + 3 × early_nfl_role_flag
   - workload_wear_penalty
```

`workload_wear_penalty` in the research model is 0–10 based on recent two-year touches and injury history. The first MVP uses a simpler high-workload flag.

### 8.8 Availability — AV

```text
HEALTHY/FULL = 98
QUESTIONABLE + FULL = 85
QUESTIONABLE + LIMITED = 68
QUESTIONABLE + DNP or UNKNOWN practice = 42
DOUBTFUL = 12
OUT/IR/PUP/SUSPENDED = 0
UNKNOWN = 72
```

The research model applies a workload-ramp factor separately. Section 26 provides the binding MVP rule.

---

## 9. Shrinkage and Sample-Size Rules

### 9.1 Universal form

Uses shared platform standard:

```text
w = n / (n + k)
regressed_metric = w × observed + (1 - w) × prior
```

### 9.2 RB stabilization constants

| Metric | Exposure | k | Prior |
|---|---|---:|---|
| Snap share | snaps | 45 | preseason/career role |
| Carry share | team RB carries | 45 | role prior |
| Route participation | routes/proxy routes | 70 | career/archetype |
| TPRR | routes | 90 | archetype/draft prior |
| Target share | team targets | 70 | route × TPRR implied |
| Goal-line share | team RB carries inside 5 | 18 | red-zone share |
| Red-zone share | team RB carries inside 20 | 35 | carry share |
| Yards per carry | carries | 220 | archetype mean |
| Success rate | carries | 140 | league mean |
| Explosive run rate | carries | 240 | archetype mean |
| Catch rate | targets | 90 | RB mean |
| Receiving yards/reception | receptions | 120 | RB mean |
| Realized rush TD/carry | carries | 350 | xRushTD rate |
| Games active | games | 28 | RB base rate |

### 9.3 Metrics that shrink faster than WR equivalents

“Shrink faster” here means observed results receive less weight at the same sample size.

- **Yards per carry:** strongly affected by blocking, scheme, long runs, and game state.
- **Explosive run rate:** sparse and highly sensitive to one play.
- **Goal-line conversion:** tiny sample and defense/context dependent.
- **Rushing TD rate:** very slow stabilization.
- **Receiving yards per reception:** screens and YAC spikes create noise.
- **Target share after a teammate injury:** role may be temporary and must carry reversal metadata.

### 9.4 Metrics allowed to update quickly

- snap share;
- carry share;
- route participation;
- goal-line share when supported by repeated deployment;
- confirmed third-down/two-minute role;
- depth-chart changes supported by game usage.

### 9.5 Binding ordering

Role evidence updates fastest. Receiving earning updates next. Rushing/receiving efficiency updates slowly. Touchdown conversion updates slowest.

---

## 10. Interaction Rules

| # | Interaction | Type | Rule |
|---|---|---|---|
| 10.1 | Team rush volume × carry share | multiplicative | Expected carries are the product, never additive scores. |
| 10.2 | Team dropbacks × route participation × TPRR | multiplicative | Expected targets are built from all three. |
| 10.3 | Snap share × opportunity | gate | Low snaps cap both carry and route opportunities. |
| 10.4 | Goal-line share × team scoring | multiplicative | Goal-line dominance only matters when the offense creates scoring opportunities. |
| 10.5 | Efficiency × volume | multiplicative + cap | Efficiency refines workload; it cannot raise active-game EFO by more than 20% over league-average conversion at the same volume. |
| 10.6 | Explosive rate × YPC | anti-double-count | Explosive rate may not also inflate the YPC prior beyond its explicit bounded term. |
| 10.7 | Receiving role × game script | stabilizer | High route/target roles reduce downside from negative rushing script and increase PPR floor. |
| 10.8 | Mobile QB × goal-line role | cap | High QB rush pressure reduces projected RB team carries and goal-line opportunities. |
| 10.9 | Age × workload | prior modifier | High recent touch volume amplifies age-related durability hazard only at One Year+ horizons. |
| 10.10 | Injury × workload | cap + uncertainty | Post-return ramp caps snap/carry/route shares; vague information widens intervals. |
| 10.11 | Teammate injury × temporary role | reversible update | Role increases must store a reversal trigger tied to teammate return. |
| 10.12 | Draft capital × NFL evidence | prior decay | Capital sets prior strength and durability; NFL deployment replaces it. |
| 10.13 | TD opportunity × realized TDs | anti-double-count | xTD is opportunity-driven; realized conversion receives only heavy-shrink weight. |

No additional MVP interactions are permitted without a model-version change.

---

## 11. Archetype Handling

Archetypes supply priors and volatility context only.

| Archetype | Measurable proxy | Prior notes |
|---|---|---|
| Three-down bell cow | snap ≥75%, carry ≥65%, route ≥55% | strongest workload persistence prior |
| Early-down lead | carry share high, route share low | rushing-heavy, game-script sensitive |
| Receiving specialist | route/target percentile materially above carry percentile | PPR stability, limited rushing ceiling |
| Goal-line specialist | goal-line share far above snap/carry share | high TD dependence and volatility |
| Committee all-purpose | snap 35–60%, balanced carry/route work | moderate floor, expansion optionality |
| Explosive change-of-pace | low volume, high explosive rate | high output volatility, heavy efficiency shrink |
| Depth reserve | snap/carry low | prior-driven, high role-event sensitivity |

Players may blend across archetypes. Archetypes never override observed role.

---

## 12. Expected Fantasy Output Construction

### 12.1 Scoring vector

```text
score(rec, recYds, recTD, rushYds, rushTD) =
    ppr_pt × rec
  + recYds × points_per_receiving_yard
  + recTD × points_per_receiving_td
  + rushYds × points_per_rushing_yard
  + rushTD × points_per_rushing_td
```

### 12.2 Weekly deterministic chain for the first MVP

```text
Pactive
↓
projected team non-QB rush attempts
↓
carry share
↓
expected carries
↓
rush efficiency
↓
rushing yards

projected team dropbacks
↓
route participation
↓
routes
↓
TPRR
↓
targets
↓
catch rate and yards/reception
↓
receiving production

goal-line/red-zone opportunity
↓
expected rushing TDs

all branches
↓
fantasy points
```

### 12.3 Research-model weekly distribution

The future upgraded model may use deterministic-seed Monte Carlo draws over:

- active/inactive;
- team rush volume;
- team dropbacks;
- carry share;
- route participation;
- targets;
- rushing efficiency;
- red-zone and goal-line opportunities;
- rushing and receiving touchdowns.

This is explicitly deferred from Version 1.

### 12.4 ROS

ROS integrates expected active games and current role persistence. Version 1 applies the current ramp to the first expected active game only and assumes full workload for later expected active games. It does not simulate multi-week recovery or scheduled inactive-list returns.

### 12.5 One Year, Three Years, Dynasty

Research model:

- one-year role survival and age/workload drift;
- annual state transition over collapsed RB role states;
- explicit seasons 1–3;
- terminal continuation with stronger decay than WR due to shorter RB careers.

Recommended RB terminal decay:

```text
δ = 0.72 per season
sensitivity = {0.65, 0.80}
```

The first MVP returns composites only for these horizons.

---

## 13. Fundamental Player Utility Handoff

Uses shared platform standard.

The RB model supplies:

- Weekly and ROS EFO;
- future season EFO distributions when upgraded;
- active-games distributions;
- role-state probabilities;
- role-survival probabilities;
- conditional event scenarios;
- confidence and volatility contributors.

The shared utility layer computes replacement, scarcity, flex competition, startable-week probabilities, marginal points, and latent utility.

The internal RB Composite must never be published as universal RB value.

---

## 14. Horizon-Specific Logic

### 14.1 Weekly

Dominated by:

- P(active);
- workload ramp;
- team rush and dropback projections;
- current carry/route shares;
- opponent broad rush/pass environment where available;
- goal-line role;
- scoring environment.

Age and contract have near-zero direct effect.

### 14.2 ROS

Adds:

- expected games remaining;
- teammate return calendar;
- committee persistence;
- offensive role trend;
- QB and coaching stability;
- reversible injury-created opportunity.

### 14.3 One Year

Adds:

- offseason competition;
- contract status;
- coaching change;
- age/workload drift;
- regression of team environment;
- rookie development and veteran decline.

### 14.4 Three Years

The research model collapses states into:

1. out/depth;
2. specialist;
3. committee;
4. lead/bell cow.

Transitions are stratified by age band and RD tier.

### 14.5 Dynasty

Explicit first three seasons plus terminal continuation. RB career decay is steeper than WR. Youth preference itself is not modeled; only football survival and output probability are.

---

## 15. Rookie and Low-Sample RB Handling

### 15.1 Prospect prior

```text
prospect_prior_percentile =
  0.60 × draft_capital_score
+ 0.20 × age_adjusted_college_rushing_production
+ 0.12 × college_receiving_profile
+ 0.08 × athletic_testing_score
```

Early declare adds a small prior adjustment. Competition level adjusts production.

### 15.2 Landing spot

Landing spot changes projected workload and team context, not talent priors.

### 15.3 Prior decay

```text
prior_weight = K_prior / (K_prior + career_touches)

where `career_touches = career rushing attempts + career receptions`; uncaught targets do not count as touches.
```

Starting K values:

```text
Round 1: 220
Round 2: 180
Round 3: 130
Rounds 4–5: 90
Rounds 6–7/UDFA: 55
```

NFL snaps, carries, routes, and targets displace the prior.

### 15.4 Rookie policies

- Zero-touch rookies are prior-driven with maximum state uncertainty.
- A low-capital rookie earning lead usage updates quickly.
- Injured rookies preserve prior mass but lose availability and gain uncertainty.
- Receiving usage is treated as role evidence, not merely production.
- A one-game preseason workload does not establish an NFL role.

### 15.5 Veterans changing teams

Skill estimates travel. Workload shares re-anchor to the new backfield. Team context changes immediately. State uncertainty rises one band for four games.

### 15.6 Aging bell cows

Strong current workload remains valid for Weekly/ROS. One-Year+ role survival and availability decline more sharply. The model must show horizon divergence rather than burying current production.

---

## 16. Confidence Model Inputs

Uses shared platform framework. RB-specific contributors:

| Confidence object | RB contributors |
|---|---|
| State Uncertainty | committee entropy; snap/carry/route posterior widths; teammate-return uncertainty; injury ambiguity; new-team flag |
| Forecast Uncertainty | EFO width; touchdown-dependence; receiving-dependence; fragile workload; game-script sensitivity |
| Intrinsic-Estimate Confidence | career touches; career routes; prior weight; route-proxy flag; role/output disagreement |
| Data-Quality Confidence | freshness; missing goal-line data; proxy routes; missing competition fields; provider disagreement |
| Explanation Confidence | concentration or dispersion of movement drivers |

### 16.1 RB Evidence Adequacy

```text
adequacy = 100
  - 30 × prior_weight
  - 18 × route_proxy_flag
  - 15 × injury_ambiguity
  - 12 × committee_uncertainty
  - 10 × recent_team_change_flag
  - 10 × role_output_disagreement
  -  5 × stale_depth_chart_flag
```

Clamp to [0,100]. It never changes EFO or components.

---

## 17. RB Volatility and Event Sensitivity

### 17.1 Revision-volatility contributors

- uncertain committee;
- low sample;
- temporary role due to teammate injury;
- goal-line dependence;
- receiving dependence;
- explosive-play dependence;
- current injury ambiguity;
- recurrence concern;
- coaching change;
- expiring contract;
- incoming competition;
- fragile workload after one-game spike.

### 17.2 Event scenarios

| Scenario | Parameter change |
|---|---|
| Backfield teammate injury | carry/route/goal-line shares redistributed; reversible |
| Teammate return | inverse redistribution |
| QB injury | team rush/dropback/scoring environment recomputed |
| Mobile QB replacement | QB rush pressure changes |
| Role promotion | snap/carry/route priors re-centered |
| Goal-line role change | GL share re-centered |
| Third-down role change | route and TPRR path changes |
| Player trade | new backfield and team context |
| Team drafts RB early | competition rises; RD falls |
| Contract extension | contract security rises |
| Coaching change | uncertainty rises; role tendency updates only with evidence |
| Injury activation | Pactive rises; ramp applies |

---

## 18. Update Rules

| Event | Update |
|---|---|
| One big rushing game, role flat | YPC and explosive rate update only through shrinkage; workload unchanged |
| One poor rushing game, role intact | symmetric |
| Carry-share jump sustained two games | workload re-centers quickly |
| Goal-line spike without total-role change | GL share updates through heavy shrinkage; volatility rises |
| Receiving-role expansion | route participation and targets update quickly; RU rises |
| Two long TD runs | realized TD rate barely moves; explosive dependence noted |
| Teammate injury | workload opportunity shifts; reversal trigger stored |
| Teammate return | scheduled reversal |
| Confirmed demotion | workload state shifts immediately |
| Player trade | skill travels; role re-anchors |
| Major injury | horizon-split availability, ramp, and durability updates |
| Camp hype | ignored unless supported by measurable first-team deployment |
| Official depth chart | expected role moves, uncertainty remains until game confirmation |
| Contract event | RD only, unless role event also occurs |

### 18.1 Smoothing

- Component movement cap: ±5 points per week absent structural event.
- Snap/carry/route roles may bypass smoothing on confirmed deployment change.
- TD conversion never bypasses shrinkage.
- Reversible opportunity records require reversal triggers.

---

## 19. Missing Data and Fallbacks

| Missing item | Fallback | Confidence effect |
|---|---|---|
| Charted routes | pass-play snap proxy × 0.82 | one route-participation fallback penalty; no duplicate proxy penalty |
| Routes and pass-play snaps | depth chart + snap/carry prior | critical data warning |
| Carry share | carries/game + team rush estimate | moderate penalty |
| Goal-line share | red-zone share | penalty |
| Goal-line and red-zone share | carry share | stronger penalty |
| Success rate | neutral league prior | small penalty |
| Explosive rate | neutral archetype prior | small penalty |
| Team rush projection | league median | penalty |
| Team dropbacks | league median | penalty |
| QB rush pressure | neutral 0.35 | penalty |
| Competition pressure | 0.50 | penalty |
| Rookie NFL history | prospect prior | prior weight reported |
| Vague injury | widen uncertainty, do not invent mean shift | injury ambiguity |
| New-team role | depth chart + prior, uncertainty raised | new-team flag |

Every fallback is written to the output record. Missing data never becomes silent zero.

---

## 20. Explanation Contract

Uses shared output structure:

```text
primary_positive_driver
primary_negative_driver
movement_drivers[]
role_change_flag
confidence_warnings[]
next_evidence[]
```

### 20.1 Plain-language examples

Good:

- “Projected to handle most of the backfield carries.”
- “Receiving usage provides weekly stability.”
- “Projected to dominate goal-line work.”
- “Committee usage limits expected workload.”
- “Current production depends heavily on touchdowns.”
- “The role is strong now, but age and workload reduce the long-term outlook.”
- “Recent opportunity increased because a teammate is injured; the change is temporary until confirmed otherwise.”

Poor:

- “Composite opportunity coefficient exceeded the latent threshold.”
- “The model proves he is injury-prone.”
- “Age caused the decline.”

### 20.2 Driver generation

Drivers come from weighted component deviations and direct EFO branch attribution:

- expected carries;
- expected targets;
- expected rushing TDs;
- expected receiving contribution;
- probability active;
- efficiency adjustment.

---

## 21. Validation Plan

### 21.1 Primary targets

| Target | Primary metric |
|---|---|
| Next-week RB points | MAE |
| Next-4-week points | MAE and rank correlation |
| ROS points | MAE and top-12/24 calibration |
| Next-season points | MAE and rank correlation |
| Active games | probability calibration |
| Next-4-week carry share | MAE |
| Next-4-week route/target role | MAE |
| Goal-line share | calibration by opportunity bucket |

### 21.2 Baselines

1. previous-season PPG;
2. current-season PPG;
3. carries + targets simple linear model;
4. snap-share model;
5. public consensus projection;
6. age-adjusted prior-production model.

### 21.3 Split design

Rolling-origin by season. No random row split. Most recent complete season held out.

### 21.4 Calibration priorities

- P(active);
- carry share;
- route/target share;
- touchdown opportunity;
- top-12 and top-24 finish probability;
- interval coverage after simulation upgrade.

### 21.5 Parameter replacement

Temporary constants are replaced only through versioned calibration. Simple methods win ties.

### 21.6 Error review cohorts

- rookies;
- receiving specialists;
- goal-line specialists;
- committee backs;
- age 28+;
- injury-return players;
- mobile-QB offenses;
- weak offensive lines;
- new-team veterans.

---

## 22. Failure Modes and Mitigations

| # | Failure | Mitigation |
|---|---|---|
| F1 | Treating carries as targets with renamed fields | Separate carry, route, target, goal-line, and receiving branches |
| F2 | Overrating YPC | Heavy shrinkage and low RE weight |
| F3 | Overreacting to one long run | Explosive cap and volatility flag |
| F4 | Overrating touchdowns | Opportunity-based xTD and heavy conversion shrinkage |
| F5 | Missing receiving floor | Dedicated RU component and receiving branch |
| F6 | Ignoring committee specialization | Role states and separate shares |
| F7 | Overrating goal-line specialists | Touch-volume gate on OQ and TD-dependence volatility |
| F8 | Underrating committee backs with strong receiving work | RU independent of rushing dominance |
| F9 | Double-counting volume | Team volume × share chain; summary metrics demoted |
| F10 | Age cliff | Horizon-scaled survival/drift, no weekly cliff |
| F11 | Ignoring workload wear | One-Year+ durability adjustment |
| F12 | Treating active as fully healthy | Separate ramp factor |
| F13 | Permanent promotion from teammate injury | Reversal metadata |
| F14 | Overtrusting draft capital | Prior decay through NFL touches |
| F15 | Missing late-round breakouts | Low-capital prior decays faster |
| F16 | Mobile QB distortion | QB rush pressure in carry/goal-line opportunity |
| F17 | Market leakage | No market field exists |
| F18 | Composite becoming forecast | Track A and Track B separation |

---

## 23. MVP Implementation Specification

### 23.1 Required data feeds

Uses the same open-data-first philosophy as WR:

- play-by-play;
- weekly player stats;
- snap counts;
- injuries/practice;
- depth charts;
- rosters and draft picks;
- contracts;
- public college stats;
- historical participation where available.

### 23.2 Calculation sequence

```text
1. Ingest and snapshot
2. Resolve player identity
3. Compute raw RB signals
4. Apply fallbacks
5. Apply shrinkage and priors
6. Derive workload, receiving, TD, and team-context objects
7. Compute eight component scores
8. Compute role state
9. Compute Weekly and ROS EFO
10. Compute confidence and volatility
11. Generate explanations
12. Write versioned output and movement diff
```

### 23.3 Storage

Same platform tables and metadata philosophy as WR, with RB-specific signal fields.

### 23.4 Point-in-time discipline

Non-negotiable.

### 23.5 Pre-launch tests

- formula bounds;
- deterministic outputs;
- fallbacks;
- active gate;
- carry/route multiplication;
- touchdown anti-overreaction;
- rookie prior decay;
- committee behavior;
- age-horizon divergence;
- market-field absence;
- golden acceptance fixtures.

---

## 24. Deferred Enhancements

| Enhancement | Purpose |
|---|---|
| Paid route and pass-protection data | better receiving-role precision |
| Tracking-based yards over expectation | replace crude rushing efficiency |
| Box-count and run-concept adjustment | context-decontaminated rushing |
| Explicit game-script simulation | better Weekly/ROS distributions |
| Full Bayesian posteriors | replace k-shrinkage if justified |
| Fitted injury recurrence model | replace coarse tiers |
| Multi-year state transitions | explicit One/Three/Dynasty EFO |
| Joint QB-RB outcome model | correlated team outcomes |
| Automatic percentile universe | live production percentile refresh |
| Full historical replay | robust backtesting |
| Market and mispricing layers | downstream only |

---

## 25. Acceptance Tests

Each case becomes a deterministic golden fixture.

| # | Case | Expected behavior |
|---|---|---|
| 1 | Elite three-down bell cow | Top-tier WRK, RU, OQ; high Weekly/ROS EFO; low committee volatility |
| 2 | Goal-line TD specialist | Strong OQ, weak WRK/RU; high TD-dependence; high volatility; workload gate prevents elite projection |
| 3 | Receiving specialist | Strong RU and PPR floor; modest carries; stable Weekly value in PPR |
| 4 | Committee back | Moderate WRK; capped workload; medium/high volatility; expansion event sensitivity |
| 5 | Explosive rookie | Prior-driven, high RE uncertainty, role evidence updates fast; one long run does not dominate |
| 6 | Aging veteran | Strong Weekly/ROS if role intact; materially weaker One-Year/Three-Year/Dynasty |
| 7 | Injury-return player | Pactive and workload ramp reduce Weekly; confidence lower; role prior preserved |
| 8 | Mobile-QB offense | QB rush pressure reduces expected RB goal-line and team carry pool |
| 9 | Teammate injury opens role | Workload rises with reversible flag |
| 10 | Teammate returns | Temporary workload reverts |
| 11 | Low YPC bell cow | Workload keeps EFO strong; RE weak but cannot erase role |
| 12 | High YPC reserve | RE strong but workload gate caps EFO |
| 13 | Two-TD low-volume game | Minimal ROS movement; TD-dependence explanation |
| 14 | Rookie lead-back promotion | WRK rises quickly; prior weight declines |
| 15 | Market-hyped RB, no football evidence | No movement |
| 16 | New-team veteran in crowded room | skill travels; workload re-anchors; uncertainty rises |
| 17 | Missing route data | proxy path used; one 15-point route fallback penalty logged; no duplicate deduction |

---

# 26. Practical Hobby MVP Implementation Contract

## 26.0 Authority and implementation boundary

This section is the complete and binding specification for the first coded RB MVP.

If Sections 1–25 conflict with Section 26, **Section 26 governs**. A developer must be able to implement Version 1 using only this section.

The first MVP is deterministic, transparent, fixture-driven, compatible with the WR platform architecture, free of market inputs, and practical for a hobby project.

The first MVP does **not** require Monte Carlo simulation, fitted Bayesian models, annual state-transition matrices, paid tracking data, live API integration, market prices, trade values, ADP, consensus rankings, mispricing classification, medical diagnosis, or One-Year/Three-Year/Dynasty fantasy-point simulations.

## 26.1 Public engine API and MVP deliverables

The engine exposes one entry point:

```ts
function evaluateRunningBack(
  input: RBMVPInput,
  options?: {
    selected_horizon?:
      | "WEEKLY"
      | "ROS"
      | "ONE_YEAR"
      | "THREE_YEAR"
      | "DYNASTY";
    reference_distributions?: RBReferenceDistributions;
    model_version?: string;
  }
): RBMVPOutput
```

Defaults:

```text
selected_horizon = WEEKLY
reference_distributions = bundled default reference table
model_version = "rb-mvp-1.0"
```

The selected horizon controls explanation-driver weighting only. All five composites are always returned. Do not create separate entry points by horizon.

Given one normalized RB input record, the engine returns:

1. eight component scores from 0–100;
2. five internal horizon composites;
3. conditional-on-active Weekly rushing and receiving statistics;
4. unconditional Weekly EFO;
5. recovery-aware ROS EFO;
6. confidence score, label, and penalties;
7. volatility score, label, and dependence measures;
8. up to three positive and three negative explanations;
9. fallback log and status;
10. schema, model, reference, and timestamp metadata.

## 26.2 Canonical conventions, validation, scoring, and serialization

### 26.2.1 Units and precision

- Rates and shares are decimals from `0.00` to `1.00`.
- Percentiles, components, composites, confidence, and volatility are from `0` to `100`.
- Counts, yards, and fantasy points may be fractional expectations.
- Keep full precision through every calculation.
- Never silently convert a missing numeric value to zero.
- Clamp values only where this contract explicitly requires it.
- EFO is never derived from a component or composite.

### 26.2.2 Input validation

Reject the input rather than return a partial calculation when any of the following is true:

- `player_id` or `player_name` is empty;
- `age` is missing, non-finite, or less than 18;
- `expected_games_remaining` is missing, non-finite, or negative;
- `career_touches`, `career_carries`, or `career_routes` is missing, non-finite, or negative;
- any provided rate/share field expected in `[0,1]` is outside `[0,1]`;
- any provided numeric field is `NaN`, positive infinity, or negative infinity;
- any required normalized boolean is null or undefined;
- `as_of_timestamp` is not a valid ISO-8601 timestamp;
- any scoring value is non-finite or negative;
- `selected_horizon` is outside the declared enum.

`career_touches` has one canonical definition:

```text
career_touches = career rushing attempts + career receptions
```

It is used only for confidence and low-sample classification. It is not the exposure unit for TPRR shrinkage. Targets that were not caught do not count as touches. `career_carries` and `career_routes` remain separate exposure inputs for their own formulas.

### 26.2.3 Default scoring

When `input.scoring` is absent, use:

```text
points_per_reception = 1.0
points_per_rushing_yard = 0.1
points_per_receiving_yard = 0.1
points_per_rushing_td = 6.0
points_per_receiving_td = 6.0
```

Scoring changes affect only fantasy-point outputs. They must not change components, composites, carries, routes, targets, receptions, yards, touchdowns, or confidence. Volatility may change only through TD dependence or reception-point dependence because those definitions explicitly use scoring points.

### 26.2.4 Serialization and labels

- Keep full precision internally.
- Round serialized component scores, composites, projection outputs, confidence scores, volatility scores, TD dependence, and receiving dependence to one decimal place.
- `weekly.probability_active` and `weekly.workload_ramp_factor` may be serialized to three decimal places.
- Derive confidence and volatility labels from the rounded serialized score.

Confidence labels:

```text
LOW = 0.0–59.9
MEDIUM = 60.0–79.9
HIGH = 80.0–100.0
```

Volatility labels:

```text
LOW = 0.0–32.9
MEDIUM = 33.0–65.9
HIGH = 66.0–100.0
```

## 26.3 Required normalized input

```ts
interface RBMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: 1|2|3|4|5|6|7|null;

  // Career exposure
  career_touches: number; // career rushing attempts + career receptions
  career_carries: number;
  career_routes: number;

  // Current role: current season through information cutoff unless named last4/last8
  snap_share_last4: number | null;
  snap_share_last8: number | null;
  carry_share_last4: number | null;
  route_participation_last4: number | null;
  targets_per_route_run: number | null;
  target_share: number | null;

  // Opportunity quality
  goal_line_carry_share: number | null;
  red_zone_carry_share: number | null;

  // Current-season efficiency through information cutoff
  yards_per_carry: number | null;
  rushing_success_rate: number | null;
  explosive_run_rate: number | null;
  catch_rate: number | null;
  receiving_yards_per_reception: number | null;

  // Team environment
  projected_team_non_qb_rush_attempts: number | null;
  projected_team_dropbacks: number | null;
  team_points_per_drive: number | null;
  team_red_zone_trips_per_game: number | null;
  qb_rush_pressure: number | null; // 0–1; higher reduces RB rush and goal-line opportunity

  // Availability and durability
  injury_status:
    | "HEALTHY"
    | "QUESTIONABLE"
    | "DOUBTFUL"
    | "OUT"
    | "IR"
    | "PUP"
    | "SUSPENDED"
    | "UNKNOWN";
  practice_status: "FULL"|"LIMITED"|"DNP"|"UNKNOWN";
  expected_games_remaining: number;
  workload_ramp_factor: number | null;
  contract_security: number | null;
  competition_pressure: number | null;
  role_change: "PROMOTED"|"DEMOTED"|"STABLE"|"UNKNOWN";
  teammate_return_flag: boolean;
  incoming_competition_flag: boolean;
  coaching_continuity: "CONTINUITY"|"CHANGE"|"UNKNOWN";
  high_recent_workload_flag: boolean;

  // Optional non-overlapping history
  previous_snap_share: number | null;
  previous_carry_share: number | null;
  previous_route_participation: number | null;
  career_yards_per_carry: number | null;
  career_targets_per_route_run: number | null;
  career_catch_rate: number | null;
  career_receiving_yards_per_reception: number | null;

  scoring?: {
    points_per_reception: number;
    points_per_rushing_yard: number;
    points_per_receiving_yard: number;
    points_per_rushing_td: number;
    points_per_receiving_td: number;
  };

  as_of_timestamp: string;
}
```

### 26.3.1 Efficiency-window definitions

- `yards_per_carry`: current-season rushing yards divided by current-season qualifying carries through the information cutoff.
- `career_yards_per_carry`: career rushing yards divided by career qualifying carries, excluding the current season when the normalized data layer can provide that split.
- `catch_rate`: current-season receptions divided by current-season targets.
- `career_catch_rate`: career catch rate before the current-season sample where available.
- `receiving_yards_per_reception`: current-season receiving yards divided by current-season receptions.
- `career_receiving_yards_per_reception`: career value before the current-season sample where available.

Do not self-blend a current metric with the same sample labeled as career. If a non-overlapping historical value is unavailable, use the neutral priors in Section 26.6.

## 26.4 Reference distributions and percentile estimator

```ts
interface RBReferenceDistributions {
  reference_version: string;
  snap_share: number[];
  carry_share: number[];
  route_participation: number[];
  targets_per_route_run: number[];
  target_share: number[];
  goal_line_carry_share: number[];
  red_zone_carry_share: number[];
  yards_per_carry: number[];
  rushing_success_rate: number[];
  explosive_run_rate: number[];
  catch_rate: number[];
  receiving_yards_per_reception: number[];
  projected_team_non_qb_rush_attempts: number[];
  projected_team_dropbacks: number[];
  team_points_per_drive: number[];
  team_red_zone_trips_per_game: number[];
  expected_targets_per_game: number[];
}
```

The Version 1 configuration must contain a fixed `expected_targets_per_game` reference array. It must not substitute the TPRR or target-share reference distribution.

For every percentile call, use this exact estimator:

```text
pct(x) =
100 × (
  count(reference values strictly below x)
  + 0.5 × count(reference values exactly equal to x)
) / N
```

Rules:

- reference arrays may be unsorted;
- exact ties receive average-rank treatment;
- values below the minimum resolve naturally to `0`;
- values above the maximum resolve naturally to `100`;
- do not interpolate between adjacent reference points;
- clamp the result to `[0,100]`;
- use this same estimator for every RB component.

If a named distribution is absent, empty, or contains no finite values, use percentile `50`, add one fallback-log entry for that canonical distribution, subtract one five-point confidence penalty, and set status to `PARTIAL`. Sanitize a non-empty array by rejecting non-finite members during configuration validation; do not silently drop them.

## 26.5 Exact fallback rules and status

### 26.5.1 Fallback evaluation semantics

- Resolve every fallback against the original input record, not values already filled earlier in the same pass, except where a row explicitly names a previously canonicalized derived field.
- Mutual fallbacks such as Snap4 ↔ Snap8 must use original input values. This prevents circular, order-dependent behavior.
- A fallback penalty applies once per canonical field.
- Reusing a fallback value in multiple downstream formulas does not repeat its penalty.
- When one missing canonical field is derived from another canonical field that also required a fallback, log and penalize both only because both primary fields were independently missing—not because one value was reused.
- No canonical field may appear more than once in `fallback_log`.

### 26.5.2 Fallback table

| Canonical field | Primary | First fallback | Final fallback | Penalty |
|---|---|---|---|---:|
| Snap4 | original `snap_share_last4` | original Snap8 | `0.45` | 8 |
| Snap8 | original `snap_share_last8` | original Snap4 | `0.45` | 8 |
| Carry share | current | canonical Snap4 × `0.90`, capped at `0.80` | `0.35` | 8 |
| Route participation | current | canonical Snap4 × `0.60` | `0.25` | 15 |
| TPRR | current | career TPRR | draft-round prior | 10 |
| Target share | current | canonical route participation × canonical TPRR × `0.85`, capped at `0.20` | `0.06` | 6 |
| Goal-line share | current | original red-zone share if present, otherwise canonical red-zone share | canonical carry share | 8 |
| Red-zone share | current | canonical carry share | `0.35` | 6 |
| YPC | current | non-overlapping career YPC | `4.20` | 5 |
| Success rate | current | none | `0.42` | 5 |
| Explosive rate | current | none | `0.10` | 5 |
| Catch rate | current | non-overlapping career catch rate | `0.78` | 5 |
| Rec yards/reception | current | non-overlapping career value | `7.50` | 5 |
| Team non-QB rushes | projection | reference median | `24.0` | 5 |
| Team dropbacks | projection | reference median | `34.0` | 5 |
| Points/drive | current | reference median | `1.90` | 5 |
| Red-zone trips | current | reference median | `3.2` | 5 |
| QB rush pressure | current | none | `0.35` | 4 |
| Workload ramp | current | status/practice lookup below | lookup value | 4 |
| Contract security | current | draft-round mapping | `0.35` | 4 |
| Competition pressure | current | none | `0.50` | 4 |

Required booleans have no fallback rows. The upstream normalization layer must supply `true` or `false` for `teammate_return_flag`, `incoming_competition_flag`, and `high_recent_workload_flag`.

### 26.5.3 Workload-ramp fallback

If `workload_ramp_factor` is provided, clamp it to `[0,1]` and do not log a fallback.

If missing, use:

```text
HEALTHY = 1.00
QUESTIONABLE + FULL = 0.90
QUESTIONABLE + LIMITED = 0.80
QUESTIONABLE + DNP/UNKNOWN = 0.70
DOUBTFUL = 0.60
OUT/IR/PUP/SUSPENDED = 0.00
UNKNOWN injury status = 0.80
```

Apply the four-point workload-ramp fallback penalty once and log it once.

### 26.5.4 Draft mappings

Contract-security fallback:

```text
Round 1 = 1.00
Round 2 = 0.82
Round 3 = 0.65
Rounds 4–5 = 0.42
Rounds 6–7 = 0.24
Undrafted/unknown = 0.18
```

TPRR prior:

```text
Round 1 = 0.19
Round 2 = 0.18
Round 3 = 0.17
Rounds 4–5 = 0.16
Rounds 6–7/UDFA/unknown = 0.15
```

### 26.5.5 Output status

- `OK` means no Section 26.5 field fallback and no Section 26.4 reference-distribution fallback was used.
- `PARTIAL` means one or more such fallbacks were used.
- Missing `previous_*` history uses the neutral trend rule in Section 26.7 and does not create a fallback-log entry, confidence penalty, or `PARTIAL` status.

## 26.6 Simple shrinkage

Version 1 shrinks only TPRR, YPC, success rate, explosive rate, catch rate, and receiving yards per reception.

### 26.6.1 TPRR

```text
sample_weight = career_routes / (career_routes + 120)
shrunk_TPRR =
    sample_weight × canonical_TPRR
  + (1 - sample_weight) × draft_round_TPRR_prior
```

### 26.6.2 Yards per carry

Use the non-overlapping career value as the prior only when the normalization layer confirms it excludes the current-season sample. Otherwise use `4.20`.

```text
sample_weight = career_carries / (career_carries + 250)
ypc_prior = valid_non_overlapping_career_YPC ?? 4.20

shrunk_YPC =
    sample_weight × canonical_YPC
  + (1 - sample_weight) × ypc_prior
```

### 26.6.3 Success rate

```text
sample_weight = career_carries / (career_carries + 160)
shrunk_success_rate =
    sample_weight × canonical_success_rate
  + (1 - sample_weight) × 0.42
```

### 26.6.4 Explosive run rate

```text
sample_weight = career_carries / (career_carries + 280)
shrunk_explosive_rate =
    sample_weight × canonical_explosive_rate
  + (1 - sample_weight) × 0.10
```

### 26.6.5 Catch rate

Use the non-overlapping historical value only when it excludes the current-season sample. Otherwise use `0.78`.

```text
sample_weight = career_routes / (career_routes + 100)
catch_prior = valid_non_overlapping_career_catch_rate ?? 0.78

shrunk_catch_rate =
    sample_weight × canonical_catch_rate
  + (1 - sample_weight) × catch_prior
```

### 26.6.6 Receiving yards per reception

Use the non-overlapping historical value only when it excludes the current-season sample. Otherwise use `7.50`.

```text
sample_weight = career_routes / (career_routes + 150)
rypr_prior = valid_non_overlapping_career_RYPR ?? 7.50

shrunk_receiving_yards_per_reception =
    sample_weight × canonical_receiving_yards_per_reception
  + (1 - sample_weight) × rypr_prior
```

No other Version 1 signal is shrunk.

## 26.7 Trend scores

```text
if previous_snap_share is null:
    snap_trend_score = 50
else:
    snap_delta = Snap4 - previous_snap_share
    snap_trend_score = clamp(50 + 200 × snap_delta, 0, 100)
```

```text
if previous_carry_share is null:
    carry_trend_score = 50
else:
    carry_delta = carry_share - previous_carry_share
    carry_trend_score = clamp(50 + 200 × carry_delta, 0, 100)
```

```text
if previous_route_participation is null:
    route_trend_score = 50
else:
    route_delta = route_participation - previous_route_participation
    route_trend_score = clamp(50 + 200 × route_delta, 0, 100)
```

```text
workload_trend_score =
    0.45 × snap_trend_score
  + 0.35 × carry_trend_score
  + 0.20 × route_trend_score
```

Missing previous history is neutral, not a fallback.

## 26.8 Component formulas

All formulas are binding. Every `pct` call uses the named Section 26.4 distribution.

### 26.8.1 Shared pre-component derived values

These values describe the current role profile and deliberately exclude weekly availability and workload ramp:

```text
base_expected_carries =
    projected_team_non_qb_rush_attempts × carry_share

base_expected_routes =
    projected_team_dropbacks × route_participation

base_expected_targets =
    base_expected_routes × shrunk_TPRR

projected_touches_for_OQ =
    base_expected_carries + base_expected_targets
```

For the OQ touch gate, use base expected carries before QB adjustment and ramp plus expected targets before workload ramp. OQ must not change solely because `Pactive` or weekly injury ramp changes. Availability belongs to AV and EFO.

### 26.8.2 Workload Role — WRK

```text
WRK = clamp(
  0.40 × pct(Snap4; snap_share)
+ 0.30 × pct(carry_share; carry_share)
+ 0.15 × pct(route_participation; route_participation)
+ 0.10 × pct(Snap8; snap_share)
+ 0.05 × workload_trend_score,
0,100)
```

### 26.8.3 Opportunity Quality — OQ

```text
OQ_raw =
    0.40 × pct(goal_line_carry_share; goal_line_carry_share)
  + 0.25 × pct(red_zone_carry_share; red_zone_carry_share)
  + 0.20 × pct(base_expected_targets; expected_targets_per_game)
  + 0.15 × pct(team_points_per_drive; team_points_per_drive)

if projected_touches_for_OQ < 6:
    OQ = min(OQ_raw,70)
else:
    OQ = OQ_raw

OQ = clamp(OQ,0,100)
```

### 26.8.4 Rushing Efficiency — RE

```text
RE_base =
    0.55 × pct(shrunk_YPC; yards_per_carry)
  + 0.30 × pct(shrunk_success_rate; rushing_success_rate)

explosive_term =
    0.15 × pct(shrunk_explosive_rate; explosive_run_rate)

RE_raw = RE_base + explosive_term
RE_without_explosive = RE_base + 7.5
RE = clamp(RE_raw, RE_without_explosive - 8, RE_without_explosive + 8)

if career_carries < 75:
    RE = clamp(RE,25,75)
else if career_carries < 150:
    RE = clamp(RE,15,85)
else:
    RE = clamp(RE,0,100)
```

### 26.8.5 Receiving Utility — RU

```text
RU = clamp(
  0.35 × pct(route_participation; route_participation)
+ 0.30 × pct(shrunk_TPRR; targets_per_route_run)
+ 0.20 × pct(target_share; target_share)
+ 0.10 × pct(shrunk_catch_rate; catch_rate)
+ 0.05 × pct(shrunk_receiving_yards_per_reception; receiving_yards_per_reception),
0,100)
```

### 26.8.6 Team Context — TC

```text
TC = clamp(
  0.35 × pct(projected_team_non_qb_rush_attempts; projected_team_non_qb_rush_attempts)
+ 0.20 × pct(projected_team_dropbacks; projected_team_dropbacks)
+ 0.25 × pct(team_points_per_drive; team_points_per_drive)
+ 0.10 × pct(team_red_zone_trips_per_game; team_red_zone_trips_per_game)
+ 0.10 × (100 - 100 × qb_rush_pressure),
0,100)
```

QB pressure appears here and in EFO intentionally:

- TC summarizes the environment for explanations and horizon composites.
- EFO uses QB pressure directly in the rushing opportunity chain.
- TC never feeds EFO.

### 26.8.7 Role Durability — RD

```text
role_change_adjustment =
    +12 for PROMOTED
    -12 for DEMOTED
      0 otherwise

coaching_adjustment =
    +5 for CONTINUITY
    -5 for CHANGE
     0 for UNKNOWN

age_security_adjustment =
    +5 when age <= 24
     0 when age is 25–26
    -5 when age is 27
   -10 when age is 28
   -15 when age >= 29

workload_wear_adjustment =
    -8 when high_recent_workload_flag is true
     0 otherwise

RD = clamp(
  50
+ 18 × contract_security
- 20 × competition_pressure
+ role_change_adjustment
+ coaching_adjustment
+ age_security_adjustment
+ workload_wear_adjustment
- (8 if teammate_return_flag else 0)
- (8 if incoming_competition_flag else 0),
0,100)
```

### 26.8.8 Age & Development — AD

| Age | Base |
|---|---:|
| 20–21 | 84 |
| 22 | 80 |
| 23 | 75 |
| 24 | 69 |
| 25 | 62 |
| 26 | 53 |
| 27 | 43 |
| 28 | 32 |
| 29 | 23 |
| 30+ | 14 |

```text
AD = age_base
   + (5 if nfl_seasons_completed is 1 or 2 else 0)
   - (6 if high_recent_workload_flag and age >= 26 else 0)

AD = clamp(AD,0,100)
```

### 26.8.9 Availability — AV

```text
HEALTHY = 98
QUESTIONABLE + FULL = 85
QUESTIONABLE + LIMITED = 68
QUESTIONABLE + DNP/UNKNOWN = 42
DOUBTFUL = 12
OUT/IR/PUP/SUSPENDED = 0
UNKNOWN = 72
```

## 26.9 Horizon composites

Component order is always `WRK, OQ, RE, RU, TC, RD, AD, AV`.

| Horizon | WRK | OQ | RE | RU | TC | RD | AD | AV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Weekly | .27 | .15 | .05 | .14 | .12 | .05 | .02 | .20 |
| ROS | .24 | .15 | .06 | .15 | .10 | .13 | .04 | .13 |
| One Year | .18 | .13 | .07 | .15 | .08 | .20 | .14 | .05 |
| Three Years | .13 | .10 | .07 | .14 | .05 | .24 | .23 | .04 |
| Dynasty | .10 | .08 | .06 | .13 | .03 | .25 | .31 | .04 |

Each row sums to `1.00`.

```text
composite[horizon] = Σ component × horizon_weight
```

The selected horizon does not change component or composite calculation. Composites are internal and never feed EFO.

## 26.10 Expected Fantasy Output

Version 1 is deterministic.

### 26.10.1 Probability active and inactive-list policy

```text
Pactive = AV / 100
```

For `OUT`, `IR`, `PUP`, or `SUSPENDED`:

```text
AV = 0
Pactive = 0
effective_ramp = 0
Weekly EFO = 0
expected active games remaining = 0
ROS EFO = 0
```

Version 1 does not model scheduled returns for inactive-list players. That is a deferred upgrade, not a defect.

For all other statuses:

```text
effective_ramp = clamp(canonical_workload_ramp_factor,0,1)
```

### 26.10.2 Active-game calculation function

Define one deterministic helper conceptually:

```text
calculate_active_game(ramp):
    expected_carries =
        projected_team_non_qb_rush_attempts
      × carry_share
      × (1 - 0.20 × qb_rush_pressure)
      × ramp

    expected_routes =
        projected_team_dropbacks
      × route_participation
      × ramp

    expected_targets = expected_routes × shrunk_TPRR
    expected_receptions = expected_targets × shrunk_catch_rate
    expected_receiving_yards =
        expected_receptions × shrunk_receiving_yards_per_reception

    effective_YPC = clamp(shrunk_YPC,3.2,5.5)
    expected_rushing_yards = expected_carries × effective_YPC

    scoring_factor =
        clamp(team_points_per_drive / 1.90,0.65,1.35)

    base_rush_td_rate_per_carry =
        0.025
      + 0.045 × goal_line_carry_share
      + 0.020 × red_zone_carry_share

    qb_goal_line_factor = 1 - 0.30 × qb_rush_pressure

    expected_rushing_touchdowns =
        expected_carries
      × base_rush_td_rate_per_carry
      × scoring_factor
      × qb_goal_line_factor

    expected_receiving_touchdowns =
        expected_targets × 0.025 × scoring_factor

    active_game_fantasy_points =
        expected_rushing_yards × points_per_rushing_yard
      + expected_rushing_touchdowns × points_per_rushing_td
      + expected_receptions × points_per_reception
      + expected_receiving_yards × points_per_receiving_yard
      + expected_receiving_touchdowns × points_per_receiving_td

    return all expected statistics and active_game_fantasy_points
```

Compute:

```text
current_active_game = calculate_active_game(effective_ramp)
full_workload_active_game = calculate_active_game(1.00)
```

### 26.10.3 Weekly interpretation

Weekly football-stat expectations are conditional on the player being active. They include the workload-ramp factor but are not multiplied by `Pactive`.

This applies to:

- expected carries;
- expected rushing yards;
- expected rushing touchdowns;
- expected routes;
- expected targets;
- expected receptions;
- expected receiving yards;
- expected receiving touchdowns.

```text
weekly.expected_fantasy_points =
    Pactive × current_active_game.active_game_fantasy_points
```

`Pactive` is applied exactly once.

### 26.10.4 ROS recovery-aware approximation

```text
current_active_game_fantasy_points =
    current_active_game.active_game_fantasy_points

full_workload_active_game_fantasy_points =
    full_workload_active_game.active_game_fantasy_points

expected_active_games_remaining =
    expected_games_remaining × Pactive
```

If `expected_active_games_remaining <= 0`:

```text
ROS_EFO = 0
```

Otherwise:

```text
first_active_game_weight = min(expected_active_games_remaining,1)

later_active_games =
    max(expected_active_games_remaining - first_active_game_weight,0)

ROS_EFO =
    first_active_game_weight × current_active_game_fantasy_points
  + later_active_games × full_workload_active_game_fantasy_points
```

This intentionally assumes the current workload limitation applies only to the first expected active game and full workload resumes afterward. It is a practical Version 1 approximation, not a multi-week recovery simulation.

One-Year, Three-Year, and Dynasty EFO remain deferred. Return their composites only.

## 26.11 Confidence

Start at `100` and subtract each unique Section 26.5 fallback penalty once, plus any Section 26.4 missing-distribution penalties.

Then subtract:

```text
15 when career_touches < 50
10 when career_touches is 50–149
6 when career_touches is 150–299
10 when injury_status is UNKNOWN
10 when role_change is UNKNOWN
8 when teammate_return_flag is true
5 when team is null
5 when coaching_continuity is UNKNOWN
```

Do not apply any additional route-proxy deduction. Route participation fallback already carries one total 15-point penalty and is logged once.

```text
raw_confidence_score = clamp(100 - total_unique_penalties,0,100)
serialized_confidence_score = round(raw_confidence_score,1)
```

Derive the label from the serialized score using Section 26.2.4. Confidence never changes EFO, components, composites, or football-stat expectations.

## 26.12 Volatility

Use current active-game outputs, not Pactive-weighted Weekly EFO, for dependence ratios.

```text
touchdown_points =
    current_active_game.expected_rushing_touchdowns × points_per_rushing_td
  + current_active_game.expected_receiving_touchdowns × points_per_receiving_td

reception_points =
    current_active_game.expected_receptions × points_per_reception

td_dependence =
    clamp(touchdown_points /
      max(current_active_game.active_game_fantasy_points,1),0,1)

receiving_dependence =
    clamp(reception_points /
      max(current_active_game.active_game_fantasy_points,1),0,1)

prior_weight =
    120 / (120 + career_routes + career_carries)
```

```text
raw_volatility_score =
    18 × (1 - Snap4)
  + 16 × competition_pressure
  + 16 × td_dependence
  + 10 × receiving_dependence
  + 15 × prior_weight
  + (10 if injury_status is QUESTIONABLE or UNKNOWN else 0)
  + (10 if role_change is PROMOTED, DEMOTED, or UNKNOWN else 0)
  + (8 if teammate_return_flag else 0)
  + (7 if shrunk_explosive_rate >= 0.15 else 0)

raw_volatility_score = clamp(raw_volatility_score,0,100)
serialized_volatility_score = round(raw_volatility_score,1)
```

Round dependence measures to one decimal place for serialization after converting them to their stored decimal values; for example, `0.347` serializes as `0.3`. Derive the volatility label from the rounded serialized volatility score.

Volatility is not a medical diagnosis and remains separate from confidence.

## 26.13 Explanation generation

### 26.13.1 Direct explanations

Evaluate in this exact order.

Positive:

1. `carry_share >= 0.60` → “Projected to control most backfield carries.” Topic: `workload`.
2. `goal_line_carry_share >= 0.65` → “Projected to dominate goal-line work.” Topic: `goal_line`.
3. `current_active_game.expected_targets >= 4.0` → “Receiving usage provides weekly stability.” Topic: `receiving`.

Negative:

4. `competition_pressure >= 0.65` → “Committee usage limits expected workload.” Topic: `workload`.
5. `td_dependence >= 0.35` → “The projection depends heavily on touchdown opportunities.” Topic: `touchdown_dependence`.
6. `teammate_return_flag = true` → “Current workload may shrink when a teammate returns.” Topic: `workload_durability`.
7. `AV < 60` → “Current availability materially lowers the weekly outlook.” Topic: `availability`.
8. `AD < 35` and selected horizon is `THREE_YEAR` or `DYNASTY` → “Age and workload reduce the long-term outlook.” Topic: `age`.

### 26.13.2 Component drivers

For the selected horizon:

```text
component_deviation = component_score - 50
weighted_driver = component_deviation × horizon_weight
```

- Positive component drivers require `weighted_driver >= 1.0`.
- Negative component drivers require `weighted_driver <= -1.0`.
- Sort positive component drivers from largest to smallest weighted contribution.
- Sort negative component drivers from most negative to least negative contribution.

Use fixed component templates, not generated prose:

| Component | Positive template | Negative template | Topic |
|---|---|---|---|
| WRK | “Current workload supports the outlook.” | “Limited workload lowers the outlook.” | workload |
| OQ | “High-value opportunities strengthen the projection.” | “Limited high-value opportunities constrain the projection.” | opportunity_quality |
| RE | “Rushing efficiency is above the RB reference group.” | “Rushing efficiency is below the RB reference group.” | rushing_efficiency |
| RU | “Receiving utility strengthens the profile.” | “Limited receiving utility reduces weekly stability.” | receiving |
| TC | “The team environment supports RB opportunity.” | “The team environment limits RB opportunity.” | team_context |
| RD | “The current role has strong durability support.” | “Role durability is a material concern.” | workload_durability |
| AD | “Age and development support the long-term profile.” | “Age and workload reduce the long-term profile.” | age |
| AV | “Current availability supports the weekly outlook.” | “Current availability lowers the weekly outlook.” | availability |

### 26.13.3 Merge and ordering

Apply this exact deterministic process:

1. Generate applicable direct EFO explanations in the order listed above.
2. Classify each direct explanation as positive or negative.
3. Generate component drivers from weighted deviations.
4. Sort positive component drivers from largest to smallest.
5. Sort negative component drivers from most negative to least negative.
6. Add direct explanations before component explanations.
7. Remove semantic duplicates by topic or component.
8. Return no more than three positive and three negative explanations total.
9. Do not allow the same topic to appear in both arrays.

When the same topic has both a positive and negative candidate, the first applicable direct explanation wins. If neither is direct, keep the candidate with the larger absolute weighted component contribution; on an exact tie, prefer the negative candidate. Direct explanations are fixed statements about calculated profiles, not AI-generated text.

No explanation may claim certainty, proof, or causation.

## 26.14 Exact calculation order

1. Validate `RBMVPInput`, options, scoring, and reference configuration.
2. Capture original nullable input values for fallback resolution.
3. Apply each canonical field fallback once and create a de-duplicated fallback log.
4. Resolve default scoring and model/reference metadata.
5. Compute draft-round TPRR prior and contract-security mapping.
6. Apply shrinkage.
7. Compute neutral-or-observed trend scores.
8. Compute pre-component base expected carries, routes, targets, and OQ touches.
9. Compute all named percentiles with the Section 26.4 estimator.
10. Compute WRK, OQ, RE, RU, TC, RD, AD, and AV.
11. Compute all five horizon composites.
12. Compute current-ramp and full-workload active-game statistics.
13. Compute unconditional Weekly EFO and recovery-aware ROS EFO.
14. Compute unique confidence penalties and rounded confidence label.
15. Compute volatility, dependence values, rounding, and label.
16. Generate explanations using the selected horizon.
17. Set `status` from fallback usage.
18. Serialize with required rounding.
19. Validate every output is finite and within its declared range.
20. Return `RBMVPOutput`.

Do not add simulation, hidden smoothing, return-date inference, fitted transitions, or market data.

## 26.15 Output schema and metadata

```ts
interface RBMVPOutput {
  schema_version: "rb-mvp-1.0";
  model_version: string;       // default "rb-mvp-1.0"
  reference_version: string;   // from RBReferenceDistributions
  player_id: string;
  player_name: string;
  as_of_timestamp: string;

  components: {
    WRK: number;
    OQ: number;
    RE: number;
    RU: number;
    TC: number;
    RD: number;
    AD: number;
    AV: number;
  };

  composites: {
    WEEKLY: number;
    ROS: number;
    ONE_YEAR: number;
    THREE_YEAR: number;
    DYNASTY: number;
  };

  weekly: {
    probability_active: number;      // unconditional availability probability; 3 decimals allowed
    workload_ramp_factor: number;    // conditional active-game ramp; 3 decimals allowed
    expected_carries: number;        // conditional on active; includes ramp; not multiplied by Pactive
    expected_rushing_yards: number;  // conditional on active
    expected_rushing_touchdowns: number; // conditional on active
    expected_routes: number;         // conditional on active
    expected_targets: number;        // conditional on active
    expected_receptions: number;     // conditional on active
    expected_receiving_yards: number; // conditional on active
    expected_receiving_touchdowns: number; // conditional on active
    expected_fantasy_points: number; // unconditional: Pactive × active-game fantasy points
  };

  ros: {
    expected_active_games: number;
    expected_fantasy_points: number;
  };

  confidence: {
    score: number;
    label: "LOW"|"MEDIUM"|"HIGH";
    penalties: string[];
  };

  volatility: {
    score: number;
    label: "LOW"|"MEDIUM"|"HIGH";
    td_dependence: number;
    receiving_dependence: number;
  };

  explanations: {
    positive_drivers: string[];
    negative_drivers: string[];
  };

  fallback_log: Array<{
    field: string;
    fallback_used: string;
    confidence_penalty: number;
  }>;

  status: "OK"|"PARTIAL";
}
```

All output records must include `schema_version`, `model_version`, `reference_version`, and `as_of_timestamp`. Store outputs historically. Keep composites internal until shared utility and market layers exist.

## 26.16 Mandatory tests and golden fixtures

All tests below must pass before implementation is approved.

### 26.16.1 Formula and architecture tests

1. Every component remains in `[0,100]`.
2. Every horizon weight row sums to `1.00`.
3. Higher carry share raises expected carries and Weekly EFO, all else equal.
4. Higher route participation raises expected targets and PPR EFO.
5. A high-YPC reserve remains below an otherwise identical lead back because workload gates EFO.
6. A goal-line specialist with fewer than six base projected touches triggers the OQ cap.
7. Increasing QB rush pressure reduces expected carries, rushing touchdowns, TC, and Weekly EFO.
8. Identical input and configuration produce identical output.
9. Confidence does not change components, composites, football statistics, or EFO.
10. Composites do not feed EFO.
11. No schema accepts ADP, ranking, market price, consensus value, or trade value.
12. One-Year, Three-Year, and Dynasty fantasy points are not returned or fabricated.

### 26.16.2 Percentile tests

1. An exact tie uses mid-rank.
2. Unsorted reference arrays produce the same result as sorted arrays.
3. A below-minimum value produces `0`.
4. An above-maximum value produces `100`.
5. A missing distribution produces percentile `50`, one fallback entry, one five-point penalty, and `PARTIAL` status.

### 26.16.3 Status tests

1. No fallback returns `OK`.
2. Any Section 26.5 or 26.4 fallback returns `PARTIAL`.
3. Missing previous trend history does not change status.

### 26.16.4 Penalty tests

1. Route-participation fallback produces exactly one 15-point penalty.
2. A fallback reused in multiple components is penalized once.
3. Mutual Snap4/Snap8 fallbacks resolve against original values.
4. No canonical fallback field is logged twice.
5. When Snap4 and carry share are both missing, each independently missing canonical field is logged once even though carry share uses canonical Snap4.

### 26.16.5 ROS ramp tests

1. A healthy player with ramp `1.00` uses the same active-game expectation throughout ROS.
2. An injury-return player uses the reduced ramp for the first expected active game only.
3. Later expected active games use full workload.
4. `OUT`, `IR`, `PUP`, or `SUSPENDED` produces zero Weekly and ROS EFO.
5. Expected active games at or below zero produces ROS EFO of zero.

### 26.16.6 Conditional-stat tests

1. Conditional weekly carries do not change when only Pactive changes.
2. Weekly EFO decreases when Pactive decreases.
3. Workload ramp changes conditional weekly statistics.
4. Pactive is not applied twice.
5. Weekly conditional statistics equal the current-ramp active-game calculation.

### 26.16.7 Rounding and label tests

1. Raw volatility `32.97` serializes as `33.0` and labels `MEDIUM`.
2. Raw confidence `79.96` serializes as `80.0` and labels `HIGH`.
3. Intermediate calculations remain unrounded.
4. Serialized component, composite, projection, confidence, volatility, and dependence values follow Section 26.2.4.

### 26.16.8 Explanation tests

1. Direct explanations precede component explanations.
2. Positive explanations never exceed three.
3. Negative explanations never exceed three.
4. Duplicate topics are removed.
5. Committee explanation is negative.
6. Receiving-stability explanation is positive.
7. Long-term age explanation appears only for `THREE_YEAR` or `DYNASTY`.
8. The same topic cannot appear in both arrays.
9. No explanation claims certainty, proof, or causation.
10. Changing selected horizon can change component-driver ordering but not calculations or composites.

### 26.16.9 Scoring tests

1. Full PPR, half-PPR, and standard scoring preserve football-stat expectations.
2. Fantasy points change correctly.
3. Components and composites remain unchanged.
4. Confidence remains unchanged.
5. Volatility changes only through TD/reception point dependence.

### 26.16.10 Input-definition tests

1. Negative career touches, carries, or routes are rejected.
2. Rates outside `[0,1]` are rejected.
3. Required normalized booleans cannot be null.
4. Invalid timestamp is rejected.
5. Non-finite numbers are rejected.
6. `career_touches` is interpreted as carries plus receptions, not carries plus targets.
7. Overlapping current and career efficiency samples use neutral priors rather than self-blending.

### 26.16.11 Ten mandatory golden fixtures

Create fixed JSON inputs and generated complete outputs for:

1. **Elite three-down bell cow** — high snap, carry, route, target, and goal-line shares; high WRK/RU/OQ and Weekly/ROS EFO.
2. **Goal-line touchdown specialist** — low/moderate workload, high goal-line share, OQ gate where applicable, high TD dependence.
3. **Receiving specialist** — modest carries, strong routes/TPRR/targets, strong RU and PPR floor.
4. **Committee back** — moderate shares, high competition pressure, committee explanation, medium/high volatility.
5. **Explosive rookie** — low sample, high observed efficiency, RE sample cap, prior-driven confidence penalties.
6. **Aging veteran** — strong Weekly/ROS profile, materially weaker Three-Year/Dynasty composites.
7. **Injury-return player** — nonzero Pactive, ramp below one, reduced first active game, later ROS games at full workload.
8. **Out player** — AV zero, zero workload, zero Weekly EFO, zero active games, zero ROS EFO.
9. **Missing-data player** — exercises every major fallback, `PARTIAL`, LOW confidence, finite outputs, no silent zero.
10. **Mobile-QB pressure comparison** — two otherwise identical RBs; higher pressure produces fewer carries, fewer rushing TDs, lower TC, and lower Weekly EFO.

Golden outputs must be generated only after formula-level tests pass. They must not be manually edited to make tests pass. Future code changes must reproduce them unless `model_version` or `reference_version` changes.

## 26.17 Deferred upgrades and Version 1 limitations

Deferred upgrades:

1. live data adapters;
2. automatic reference-distribution refresh;
3. paid route/pass-protection data;
4. Monte Carlo output distributions;
5. opponent-level matchup adjustment;
6. fitted priors and touchdown models;
7. explicit role-state probabilities;
8. multi-year EFO;
9. calibrated age/workload survival models;
10. historical replay and rolling-origin backtests;
11. event-driven multi-week injury recovery;
12. scheduled return modeling for IR/PUP/OUT players;
13. shared utility and market-price integration.

Real Version 1 limitations:

- ROS assumes one reduced active game followed by full workload.
- Inactive-list players receive zero ROS output because return timelines are not modeled.
- Fixed reference arrays require explicit version management.
- Public-data proxies cannot fully distinguish routes from pass protection.
- Touchdown expectation is deliberately simple and uncalibrated.

These limitations are accepted product boundaries, not hidden assumptions.

*End of `RB_VALUATION_MODEL_v1.1_FINAL.md` — practical hobby MVP contract.*
