# TE_VALUATION_MODEL.md

**Document status:** Position-specific model specification. Version 1.0 (practical hobby MVP specification).  
**Position scope:** NFL tight ends, including rookies, committee players, injury-return players, and veterans changing teams.  
**Horizons:** Weekly, Rest of Season (ROS), One Year, Three Years, Dynasty.  
**Model boundary:** Football and fantasy utility only. No market price, ADP, trade value, scarcity, replacement value, premium-format value, or mispricing classification.

---

## 1. Document Authority and Scope

### 1.1 What this document defines

This document defines the deterministic Tight End valuation model used by the shared fantasy-football player-model platform. It specifies:

- the TE estimands;
- the eight TE-specific components;
- the normalized MVP signal set;
- priors, shrinkage, trends, fallbacks, and confidence penalties;
- Weekly and ROS Expected Fantasy Output (EFO);
- horizon-specific internal composites;
- volatility and explanation logic;
- validation, fixture, and implementation requirements.

The model estimates football and fantasy utility. It does not estimate what a player costs in a fantasy market.

### 1.2 Governing implementation rule

Sections 1–25 explain the research logic, product rationale, and future direction. Section 26 is the complete and sole binding Version 1 contract. If any earlier language conflicts with Section 26, Section 26 governs.

### 1.3 Explicit exclusions

The TE engine must not consume or emit:

- ADP, consensus rank, trade calculator values, roster percentage, acquisition rate, sentiment, or observed market price;
- positional scarcity, replacement level, TE-premium adjustments, or universal player value;
- proprietary pass-blocking grades, paid alignment charting, private medical information, or subjective film grades;
- One-Year, Three-Year, or Dynasty fantasy-point totals in Version 1.

### 1.4 Platform compatibility

The TE model reuses the platform conventions established by the WR and RB models:

- one public deterministic engine entry point;
- normalized input and structured output;
- eight components and five composites;
- empirical mid-rank percentile scoring;
- fixed versioned reference arrays;
- explicit fallback logs and one-time confidence penalties;
- `OK` and `PARTIAL` status semantics;
- full precision internally and declared serialization rounding;
- confidence separated from quality;
- volatility separated from medical diagnosis;
- fixture-driven testing before live-data integration.

It does not copy WR receiving logic blindly or RB rushing logic at all.

---

## 2. Tight End Modeling Thesis

1. **Tight ends are not low-volume wide receivers.** Inline work, pass protection, run blocking, chips, and heavy personnel create snaps that do not create receiving opportunity.
2. **Routes are the first fantasy gate.** Route participation is the primary receiving-role signal. Snap share is supporting evidence or a penalized fallback only.
3. **Target earning is the second gate.** TPRR and target share separate true receiving weapons from blockers and touchdown-only role players.
4. **Target quality matters after routes and targets.** Depth, catchability, red-zone access, and end-zone access affect the expected value of each target.
5. **Efficiency is real but noisy.** Catch rate and yards per target are regressed and capped so one long play cannot dominate.
6. **Blocking can preserve NFL playing time while suppressing fantasy volume.** Football-role durability and receiving-role durability are not equivalent.
7. **Touchdowns are opportunity-driven and volatile.** The model uses red-zone and end-zone access plus team scoring environment, not recent touchdown conversion as the primary forecast.
8. **Team and quarterback context scale the opportunity pie.** Dropbacks, scoring efficiency, red-zone trips, and a defined quarterback environment affect receiving volume and touchdown opportunity.
9. **Competition is TE-specific.** Another receiving TE, slot targets, pass-catching backs, dominant WRs, and teammate returns can cap the role without requiring a full offensive allocation model.
10. **TE development is later and less linear than WR development.** Years 2–4 can still contain meaningful growth; the prime generally extends later than RB.
11. **Role evidence updates faster than efficiency evidence.** A route-share promotion matters immediately; one explosive catch does not.
12. **Prospect data initializes priors and then fades.** Draft capital and prospect type never operate as live-season bonus points.
13. **Confidence is not quality.** Low confidence communicates uncertainty only.
14. **Market information never enters.** Football facts may enter; market reactions may not.

---

## 3. Estimands

| ID | Estimand | Definition | Unit |
|---|---|---|---|
| E1 | `Pactive` | Probability the TE is active for the next game | probability |
| E2 | `workload_ramp` | Conditional active-game workload multiplier | rate 0–1 |
| E3 | `route_participation` | Routes divided by projected team dropbacks | rate 0–1 |
| E4 | `shrunk_TPRR` | Regressed targets per route run | rate |
| E5 | `expected_targets` | Expected routes multiplied by shrunk TPRR | count |
| E6 | `expected_catch_rate` | Regressed expected receptions per target | probability |
| E7 | `expected_receiving_yards` | Expected receptions multiplied by expected yards per reception | yards |
| E8 | `expected_receiving_touchdowns` | Opportunity-based receiving touchdown expectation | touchdowns |
| E9 | `Weekly EFO` | Unconditional expected next-game fantasy points | fantasy points |
| E10 | `ROS EFO` | Recovery-aware expected fantasy points over remaining games | fantasy points |
| E11 | Component scores | Eight TE-specific normalized scores | 0–100 |
| E12 | Horizon composites | Five internal weighted summaries | 0–100 |
| E13 | Confidence | Reliability of the available evidence and fallbacks | 0–100 |
| E14 | Volatility | Expected instability and event dependence | 0–100 |

Weekly football-stat expectations are conditional on activity. Weekly fantasy points are unconditional and apply `Pactive` exactly once.

---

## 4. TE Role States and Archetypes

### 4.1 Practical role states

Role states are descriptive tools for testing and explanations. They do not replace the continuous formulas.

| State | Operational description |
|---|---|
| Inactive/unavailable | Not expected to play |
| Blocking/depth TE | Low route participation and low target earning |
| Rotational receiving TE | Limited routes with some target involvement |
| Committee TE | Moderate routes with material competition from another TE |
| Full-time balanced TE | Strong route participation with average target earning |
| Receiving focal point | Strong routes and strong target earning |
| Red-zone specialist | Modest general volume but strong red-zone/end-zone access |
| Transitional role | Recent promotion, demotion, teammate injury, return, or team change |

### 4.2 Required archetypes

The model and fixture suite must cover:

1. elite receiving focal point;
2. full-time balanced TE;
3. blocking-heavy starter;
4. red-zone touchdown specialist;
5. low-route high-TPRR player;
6. young breakout candidate;
7. committee or two-TE player;
8. aging productive veteran;
9. injury-return player;
10. new-team veteran.

Archetypes may choose priors and test expectations. They never override observed route or target evidence.

---

## 5. Signal Families

### 5.1 Role and participation

- route participation last 4 and last 8;
- route trend versus a non-overlapping prior window;
- snap share last 4 as supporting evidence and route fallback;
- blocking-role proxy from the gap between snap share and route participation.

### 5.2 Target earning

- targets per route run;
- target share;
- targets per game as a reasonableness reference, not an independent formula multiplier;
- TPRR trend.

### 5.3 Target quality

- average depth of target;
- red-zone targets per target;
- end-zone targets per target;
- catchable-target rate where public and normalized;
- expected fantasy points per target when supplied by a public or internally derived process.

### 5.4 Receiving efficiency

- catch rate;
- yards per target;
- yards per reception;
- YAC per reception or a bounded public proxy.

### 5.5 Team environment

- projected team dropbacks;
- team points per drive;
- team red-zone trips per game;
- explicit QB environment score;
- competition pressure.

### 5.6 Durability and availability

- depth-chart role;
- contract security;
- draft round;
- coaching continuity;
- role change;
- teammate return;
- another receiving TE;
- new-team flag;
- injury and practice status;
- career routes.

---

## 6. MVP Signal Set

The binding Version 1 input interface appears in Section 26. Every MVP signal must be public-data compatible or normalized upstream. Alignment, blocking, and quarterback tendencies are represented through explicit bounded proxies rather than proprietary charting.

### 6.1 Signal dictionary

| Canonical signal | Definition / unit | Window / update | Availability | Why it matters | Shrinkage | Fallback | Main failure mode |
|---|---|---|---|---|---|---|---|
| `RP4` | routes ÷ team dropbacks, 0–1 | last 4; weekly | medium | immediate receiving gate | none | RP8, then snap proxy | vendor route definitions |
| `RP8` | routes ÷ team dropbacks, 0–1 | last 8; weekly | medium | role stability | none | RP4, then snap proxy | stale role after promotion |
| `Snap4` | offensive snaps ÷ team snaps, 0–1 | last 4; weekly | high | football-role support/fallback | none | RP-based estimate, then neutral | blocking snaps mistaken for routes |
| `TPRR` | targets ÷ routes, 0–1 | season/career; weekly | medium-high | target-earning skill | yes, career routes | career TPRR, draft prior | unstable tiny route samples |
| `target_share` | player targets ÷ team targets, 0–1 | season/recent; weekly | high | validates offensive target slice | none | RP×TPRR scaling | team attempts denominator mismatch |
| `aDOT` | air yards ÷ targets, yards | season; weekly | medium | target depth and catch difficulty | no | TE neutral | target coding differences |
| `red_zone_target_rate` | red-zone targets ÷ targets, 0–1 | season; weekly | medium | repeatable TD opportunity | yes | end-zone-informed/neutral | very small samples |
| `end_zone_target_rate` | end-zone targets ÷ targets, 0–1 | season; weekly | medium | direct TD opportunity | yes | red-zone-informed/neutral | charting availability |
| `catchable_target_rate` | catchable targets ÷ targets, 0–1 | season; weekly | low-medium | practical target quality | yes | QB environment mapping | subjective charting |
| `catch_rate` | receptions ÷ targets, 0–1 | season/career | high | conversion | yes | career/neutral | role and depth confounding |
| `yards_per_target` | receiving yards ÷ targets | season/career | high | broad efficiency | yes | career/neutral | explosive-play distortion |
| `yards_per_reception` | receiving yards ÷ receptions | season/career | high | yardage conversion | yes | career/neutral | low receptions |
| `yac_per_reception` | YAC ÷ receptions | season/career | medium | TE-specific after-catch utility | yes | neutral | provider differences |
| `team_dropbacks` | projected team dropbacks/game | weekly | high | route-volume pie | no | reference median | game-script error |
| `points_per_drive` | offensive points/drive | season | high | scoring environment | no | reference median | opponent and schedule noise |
| `red_zone_trips` | team red-zone trips/game | season | high | TD opportunities | no | reference median | small early-season sample |
| `qb_environment_score` | defined normalized 0–100 upstream composite | weekly | medium | catchability and passing stability | no | 50 | vague construction if undocumented |
| `competition_pressure` | normalized 0–1 receiving competition | weekly | medium | role persistence | no | 0.50 | subjective upstream estimate |
| `contract_security` | normalized 0–1 | event-driven | medium | durability | no | draft mapping | contract details oversimplified |
| `career_routes` | total NFL routes | weekly | medium | sample size | n/a | none; required | route source changes |
| `injury_status` | official enum | daily/weekly | high | active probability | n/a | UNKNOWN enum | team reporting ambiguity |
| `workload_ramp` | conditional active workload 0–1 | weekly | medium | injury-return usage | n/a | status lookup | recovery nonlinear |

---

## 7. Core Formula Philosophy

The model uses a transparent chain:

```text
availability
→ conditional workload ramp
→ projected team dropbacks
→ route participation
→ expected routes
→ shrunk TPRR
→ expected targets
→ shrunk catch rate
→ expected receptions
→ regressed yards per reception
→ expected receiving yards
→ opportunity-based touchdown expectation
→ scoring vector
```

Components summarize football dimensions for comparison and explanation. Components and composites never feed EFO.

---

## 8. Component Construction

Exactly eight components are used:

1. **Route Role — RR**
2. **Target Earning — TE**
3. **Target Quality — TQ**
4. **Receiving Efficiency — RE**
5. **Team Context — TC**
6. **Role Durability — RD**
7. **Age & Development — AD**
8. **Availability — AV**

The exact Version 1 formulas are in Section 26.

---

## 9. Shrinkage and Priors

The shared form is:

```text
sample_weight = n / (n + k)
shrunk_value = sample_weight × observed + (1 - sample_weight) × prior
```

Version 1 shrinks TPRR, catch rate, yards per target, yards per reception, YAC per reception, red-zone target rate, and end-zone target rate. Route participation is intentionally not shrunk because role evidence must update quickly; it is stabilized with two windows and a trend term instead.

Prospect priors are simple draft-round and prospect-type mappings. NFL routes progressively replace them. No prospect variable adds direct points after shrinkage.

---

## 10. Interaction and Anti-Double-Counting Rules

1. Route participation determines expected routes and RR. Snap share does not independently increase EFO.
2. Snap share may support RD and calculate a blocking-role proxy, but high snaps cannot rescue low routes.
3. Competition pressure primarily affects RD and volatility. It does not directly reduce EFO in Version 1 because observed route participation and TPRR already reflect current competition.
4. Red-zone and end-zone rates affect TQ, touchdown expectation, volatility, and explanations. Realized touchdowns do not enter any component.
5. Team context appears in TC and the EFO environment chain. TC itself never feeds EFO.
6. Availability affects AV and `Pactive`; `Pactive` is applied once to Weekly fantasy points and expected active games.
7. Workload ramp affects conditional active-game routes only. It does not lower component scores.
8. Age has negligible direct Weekly influence and larger long-term composite influence through weights.
9. Confidence penalties never alter football outputs.
10. Each missing canonical field receives at most one fallback entry and one penalty.

---

## 11. Archetype Handling

Archetypes provide test profiles and optional prior selection:

- **Receiving prospect:** higher TPRR prior, ordinary route prior.
- **Balanced prospect:** neutral TPRR prior.
- **Blocking-first prospect:** lower TPRR prior, potentially strong contract prior.
- **Established veteran:** career evidence dominates draft priors.
- **New-team veteran:** current ability evidence remains, but durability/confidence/volatility reflect role uncertainty.

Observed NFL route and target evidence always overrides archetype expectations through the declared shrinkage formulas.

---

## 12. Expected Fantasy Output

### 12.1 Weekly

Weekly returns probability active, workload ramp, expected routes, targets, receptions, receiving yards, receiving touchdowns, and fantasy points.

All football statistics are conditional on activity and include the workload ramp. Fantasy points are unconditional:

```text
Weekly EFO = Pactive × conditional active-game fantasy points
```

### 12.2 ROS

ROS uses expected active games. The current ramp applies only to the first expected active game, with full workload for later expected active games. OUT, IR, PUP, and SUSPENDED receive zero ROS EFO in Version 1 because scheduled returns are not modeled.

### 12.3 Long-term

One-Year, Three-Year, and Dynasty return composites only. Multi-year fantasy-point totals are deferred.

---

## 13. Shared Utility Handoff

The future shared utility layer may consume:

- all five composites;
- Weekly and ROS EFO;
- confidence and volatility;
- route and target role summaries;
- age/development and role-durability states;
- structured explanations.

The shared layer—not the TE engine—may later add replacement value, positional scarcity, TE-premium treatment, market comparison, or universal value.

---

## 14. Horizon Logic

Weekly emphasizes current routes, target earning, availability, and team context. ROS increases durability and trend. One Year increases durability and development. Three Year and Dynasty emphasize age/development and durable receiving ability. Every binding row appears in Section 26 and sums to 1.00.

---

## 15. Rookie and Low-Sample Handling

- Career routes determine how strongly NFL efficiency replaces priors.
- Young TEs are not penalized merely for failing to break out immediately.
- Draft-round and prospect-type priors initialize TPRR only.
- Route promotions update RR immediately.
- Low sample reduces confidence and increases volatility.
- Low-sample efficiency components are capped.
- No rookie bonus enters Weekly EFO outside the prior/shrinkage chain.

---

## 16. Confidence

Confidence starts at 100 and subtracts explicit, de-duplicated penalties. It measures evidence quality, sample sufficiency, role clarity, and availability clarity. It never changes projections, components, or composites.

TE-specific uncertainty includes estimated routes from snaps, missing red-zone data, unclear competition, new-team role, injury ambiguity, missing historical efficiency, and missing team environment.

---

## 17. Volatility and Event Sensitivity

Volatility represents instability in expected output, not medical diagnosis and not player quality. Version 1 considers:

- low route participation;
- the snap-route gap associated with blocking-heavy deployment;
- competition pressure;
- touchdown dependence;
- explosive-play dependence;
- prior/sample dependence;
- injury ambiguity;
- role change;
- teammate return;
- new team.

A stable low-volume blocker may correctly have low EFO and only moderate or low volatility.

---

## 18. Update Rules

- Route participation and role-change fields update after each game or confirmed role event.
- TPRR and target share update weekly but remain shrunk.
- Efficiency updates weekly and remains more heavily shrunk.
- Official injury/practice states update whenever new information is available.
- Contract, team, coaching, and teammate-return flags update event-by-event.
- Missing prior trend history resolves to neutral trend 50 without a fallback penalty.
- Identical inputs and references must reproduce identical outputs.

---

## 19. Missing Data and Fallbacks

Version 1 requires explicit canonical fallbacks. Missing values never become silent zeros. Route participation estimated from snap share must:

- use a penalty factor;
- create one fallback entry;
- reduce confidence once;
- set status to `PARTIAL`;
- be identifiable in explanations when materially relevant.

The exact table is in Section 26.

---

## 20. Explanation Contract

Explanations are deterministic, plain-language statements. Return up to three positive and three negative drivers. Direct EFO statements precede component statements. Duplicate topics are removed. Selected horizon affects ordering only.

Permitted language includes:

- “Runs routes on most team dropbacks.”
- “Earns targets at a strong rate when in a route.”
- “Red-zone usage supports touchdown opportunity.”
- “A blocking-heavy role limits receiving volume.”
- “Another tight end creates meaningful route competition.”
- “The current role is strong, but long-term age risk is increasing.”
- “The projection depends heavily on touchdowns.”

Explanations may not claim proof, certainty, causation, medical diagnosis, or guaranteed breakout.

---

## 21. Validation Plan

Validation begins with deterministic formula tests, invariants, fallback tests, explanation tests, and fictional golden fixtures. Historical calibration and real-player backtests are deferred but should eventually examine:

- route and target projection error;
- reception, yardage, touchdown, and fantasy-point error;
- calibration by career-route band, age, archetype, and role-change state;
- error when routes are observed versus snap-proxied;
- stability across reference-version changes.

---

## 22. Failure Modes

| Failure mode | Mitigation |
|---|---|
| High snap share mistaken for receiving role | Route participation is primary; snap proxy is discounted and penalized |
| Touchdown streak drives elite projection | Realized TDs excluded; opportunity-based rate and caps used |
| One long catch inflates efficiency | Shrinkage, bounded metrics, efficiency cap |
| Competition counted repeatedly | Primary effect limited to RD and volatility |
| Young TE dismissed too early | TE-specific AD curve and prospect priors |
| Age destroys current projection | Age weighted lightly Weekly and never directly enters EFO |
| Injury probability applied twice | Conditional stats plus one unconditional `Pactive` multiplier |
| Current ramp applied all ROS | First expected active game only |
| Missing data looks real | Fallback log, confidence penalty, PARTIAL status |
| Reference table changes outputs silently | Required `reference_version` |

---

## 23. MVP Implementation Specification

Implementation should use a small pure TypeScript module with:

- one public `evaluateTightEnd` function;
- private validation, fallback, percentile, shrinkage, component, EFO, confidence, volatility, and explanation helpers;
- bundled versioned reference arrays;
- JSON fixtures and generated golden outputs;
- no network access in the engine;
- no UI dependencies;
- no hidden mutable state.

---

## 24. Deferred Enhancements

Deferred features include:

- live data adapters;
- paid route and alignment data;
- pass-blocking and inline/slot splits;
- opponent matchup models;
- route-level expected fantasy points;
- fitted priors and constants;
- Monte Carlo distributions;
- scheduled injury returns;
- multi-week recovery curves;
- explicit role-state transition models;
- One-Year/Three-Year/Dynasty EFO;
- historical rolling-origin backtests;
- shared utility, scarcity, TE-premium, and market layers.

---

## 25. Final Design Review

### 25.1 Compatibility review

- Shared five horizons retained.
- Confidence and volatility labels retained.
- `OK`/`PARTIAL` semantics retained.
- Mid-rank percentile estimator retained.
- One entry point and fixed references retained.
- Recovery-aware ROS follows the stronger RB convention.

### 25.2 TE independence review

- Routes are explicitly distinguished from snaps.
- Blocking-heavy deployment is represented by the snap-route gap.
- Red-zone and end-zone opportunity drive TD expectation.
- TE-specific age curve supports later development.
- Competition includes another TE and broad receiving pressure.
- No scarcity, rushing logic, or market information is present.

### 25.3 Implementation-readiness review

Section 26 defines every required input, unit, fallback, penalty, prior, shrinkage constant, percentile, component, horizon row, EFO formula, confidence rule, volatility rule, explanation order, output field, and mandatory test.

---

# 26. Practical Hobby MVP Implementation Contract

## 26.0 Authority and implementation boundary

This section is the complete and sole binding Version 1 specification for the first coded TE MVP.

If Sections 1–25 conflict with Section 26, **Section 26 governs**. A developer must be able to implement Version 1 using only this section.

The engine is deterministic, transparent, fixture-driven, compatible with the shared WR/RB application architecture, free of market inputs, and practical for a hobby project.

Version 1 does **not** require live data, paid routes, proprietary blocking grades, Monte Carlo, Bayesian fitting, opponent modeling, multi-year EFO, real-player projections, UI work, market information, positional scarcity, TE premium, replacement value, or trade values.

## 26.1 Public engine API and exact deliverables

```ts
function evaluateTightEnd(
  input: TEMVPInput,
  options?: {
    selected_horizon?:
      | "WEEKLY"
      | "ROS"
      | "ONE_YEAR"
      | "THREE_YEAR"
      | "DYNASTY";
    reference_distributions?: TEReferenceDistributions;
    model_version?: string;
  }
): TEMVPOutput
```

Defaults:

```text
selected_horizon = WEEKLY
reference_distributions = bundled default reference table
model_version = "te-mvp-1.0"
```

The selected horizon controls explanation weighting only. All five composites are always returned. There is one public engine entry point.

The engine returns:

1. eight components from 0–100;
2. five internal horizon composites;
3. conditional-on-active Weekly receiving expectations;
4. unconditional Weekly EFO;
5. recovery-aware ROS EFO;
6. confidence score, label, and penalty list;
7. volatility score, label, touchdown dependence, and explosive dependence;
8. up to three positive and three negative explanations;
9. de-duplicated fallback log and status;
10. schema, model, reference, player, and timestamp metadata.

## 26.2 Canonical units, validation, scoring, and serialization

### 26.2.1 Canonical units

- Rates and shares use decimals from `0.00` to `1.00`.
- `qb_environment_score` uses `0` to `100`.
- Counts, yards, touchdowns, and fantasy points may be fractional expectations.
- Components, composites, confidence, and volatility use `0` to `100`.
- `average_depth_of_target`, `yards_per_target`, `yards_per_reception`, and `yac_per_reception` use yards.
- `expected_games_remaining`, `career_routes`, and `career_targets` are non-negative counts.
- Keep full precision internally.
- Never convert a missing numeric value to zero.
- Clamp only where this contract explicitly directs.
- EFO is never calculated from components or composites.

### 26.2.2 Input validation

Reject the input instead of returning a partial result when any condition is true:

- `player_id`, `player_name`, `model_version`, or `reference_version` is empty after trimming;
- `age` is missing, non-finite, not an integer, below `18`, or above `45`;
- `nfl_seasons_completed` is missing, non-finite, not an integer, or negative;
- `career_routes` or `career_targets` is missing, non-finite, negative, or not an integer;
- `expected_games_remaining` is missing, non-finite, or negative;
- any provided field declared as a rate/share other than `workload_ramp_factor` is outside `[0,1]`;
- `qb_environment_score` is provided outside `[0,100]`;
- any provided numeric value is `NaN`, positive infinity, or negative infinity;
- any required boolean is null or undefined;
- any enum is outside its declared values;
- `as_of_timestamp` is not a valid ISO-8601 timestamp;
- any scoring constant is non-finite or negative;
- `selected_horizon` is invalid;
- the bundled reference object fails its binding validation rules.

A caller-supplied runtime reference object is validated per named distribution under Section 26.4 and may be partial; invalid members do not reject the entire player evaluation.

Reject the input when any provided value below is negative:

- `career_routes`;
- `career_targets`;
- `expected_games_remaining`;
- `projected_team_dropbacks`;
- `team_points_per_drive`;
- `team_red_zone_trips_per_game`;
- `yards_per_target`;
- `yards_per_reception`;
- `yac_per_reception`.

The following must be non-negative integers:

- `career_routes`;
- `career_targets`;
- `nfl_seasons_completed`.

`expected_games_remaining` may be fractional. `average_depth_of_target` may be negative and is not subject to the non-negative rule. Do not clamp invalid negative values except for `workload_ramp_factor`, which follows its separate rule.

Trim these strings before validation and serialization:

- `player_id`;
- `player_name`;
- `model_version`;
- `reference_version`.

Reject any of those strings when empty after trimming. When `model_version` is omitted, continue to use the existing default model version. Do not trim or otherwise transform `team` unless a separate team-code normalization contract is later introduced.

Nullable fields with documented fallbacks are not rejected solely because they are null.

### 26.2.3 Default scoring

When `input.scoring` is absent, use:

```text
points_per_reception = 1.0
points_per_receiving_yard = 0.1
points_per_receiving_td = 6.0
```

Scoring changes affect fantasy-point outputs only. They do not change football statistics, components, composites, confidence, or fallback status. Volatility may change only through the explicitly scoring-dependent dependence ratios.

### 26.2.4 Serialization and labels

- Keep full precision internally.
- Round serialized components, composites, projections, confidence, volatility, and dependence values to one decimal.
- `weekly.probability_active` and `weekly.workload_ramp_factor` may use three decimals.
- Derive labels from rounded serialized scores.

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

## 26.3 Exact input interface and definitions

```ts
interface TEMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: 1|2|3|4|5|6|7|null;
  prospect_type: "RECEIVING"|"BALANCED"|"BLOCKING_FIRST"|"UNKNOWN";

  // Career exposure
  career_routes: number;
  career_targets: number;

  // Current role and opportunity
  route_participation_last4: number | null;
  route_participation_last8: number | null;
  snap_share_last4: number | null;
  targets_per_route_run: number | null;
  target_share: number | null;

  // Target quality
  average_depth_of_target: number | null;
  red_zone_target_rate: number | null;
  end_zone_target_rate: number | null;
  catchable_target_rate: number | null;

  // Current-season receiving efficiency through cutoff
  catch_rate: number | null;
  yards_per_target: number | null;
  yards_per_reception: number | null;
  yac_per_reception: number | null;

  // Team environment
  projected_team_dropbacks: number | null;
  team_points_per_drive: number | null;
  team_red_zone_trips_per_game: number | null;
  qb_environment_score: number | null;
  competition_pressure: number | null;

  // Durability and role context
  contract_security: number | null;
  depth_chart_role: "TE1"|"TE2"|"TE3_OR_DEPTH"|"UNKNOWN";
  role_change: "PROMOTED"|"DEMOTED"|"STABLE"|"UNKNOWN";
  coaching_continuity: "CONTINUITY"|"CHANGE"|"UNKNOWN";
  teammate_return_flag: boolean;
  another_receiving_te_flag: boolean;
  temporary_opportunity_flag: boolean;
  new_team_flag: boolean;

  // Availability
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

  // Optional non-overlapping history
  previous_route_participation: number | null;
  previous_targets_per_route_run: number | null;
  career_targets_per_route_run: number | null;
  career_catch_rate: number | null;
  career_yards_per_target: number | null;
  career_yards_per_reception: number | null;
  career_yac_per_reception: number | null;
  career_red_zone_target_rate: number | null;
  career_end_zone_target_rate: number | null;

  scoring?: {
    points_per_reception: number;
    points_per_receiving_yard: number;
    points_per_receiving_td: number;
  };

  as_of_timestamp: string;
}
```

### 26.3.1 Field definitions

- `career_routes`: total known NFL routes through the information cutoff.
- `career_targets`: total NFL targets through the information cutoff.
- `route_participation_last4`: routes divided by team dropbacks across the most recent four active games. It is not snap share.
- `route_participation_last8`: same calculation across the most recent eight active games.
- `snap_share_last4`: offensive snaps divided by team offensive snaps across the most recent four active games.
- `targets_per_route_run`: current-season targets divided by current-season routes.
- `target_share`: current-season player targets divided by team pass targets.
- `red_zone_target_rate`: player targets at or inside the opponent 20 divided by player targets.
- `end_zone_target_rate`: targets directed into the end zone divided by player targets.
- `catchable_target_rate`: charted catchable targets divided by targets. If unavailable, use the declared fallback.
- `competition_pressure`: upstream normalized `0–1` summary of another TE, slot, RB, and dominant WR competition. Higher is worse. It must use these anchors: `0.00` = no meaningful established receiving competition; `0.25` = light competition with the player still the clear primary TE receiving option; `0.50` = ordinary mixed competition; `0.75` = strong competition from at least one established receiving option or a meaningful two-TE split; `1.00` = extreme competition with no stable path to primary receiving volume. Intermediate values are permitted. Version 1 consumes this field only in `TC`, `RD`, volatility, and explanations. It must not directly modify route participation, TPRR, expected routes, expected targets, catch rate, yardage, touchdown rate, Weekly EFO, or ROS EFO.
- `qb_environment_score`: upstream `0–100` score based only on explicit quarterback passing accuracy, stability, and expected attempt quality. It must not include fantasy-market sentiment.
- `contract_security`: upstream `0–1` estimate of near-term roster/role security.
- `workload_ramp_factor`: conditional active-game workload multiplier. It is not `Pactive`.

### 26.3.2 Non-overlapping historical values

Every `career_*` efficiency field used as a prior should exclude the current-season observation where the normalized data layer can provide that split. Do not blend a current metric with the same sample labeled as career. If a non-overlapping historical value is unavailable, use the fixed neutral prior.

## 26.4 Required reference distributions and exact percentile estimator

```ts
interface TEReferenceDistributions {
  reference_version: string;
  route_participation: readonly number[];
  snap_share: readonly number[];
  targets_per_route_run: readonly number[];
  target_share: readonly number[];
  average_depth_of_target: readonly number[];
  red_zone_target_rate: readonly number[];
  end_zone_target_rate: readonly number[];
  catchable_target_rate: readonly number[];
  catch_rate: readonly number[];
  yards_per_target: readonly number[];
  yards_per_reception: readonly number[];
  yac_per_reception: readonly number[];
  projected_team_dropbacks: readonly number[];
  team_points_per_drive: readonly number[];
  team_red_zone_trips_per_game: readonly number[];
  expected_targets_per_game: readonly number[];
}
```

### 26.4.1 Binding Version 1 Reference Object

The bundled Tight End reference distributions are part of the binding model specification.

When `options.reference_distributions` is omitted, the engine must use the exact literal object defined in this subsection.

Implementers must not:

- generate their own reference arrays;
- retrieve reference values from an external source;
- reuse WR or RB reference arrays;
- estimate missing values;
- modify the bundled arrays at runtime;
- refresh the arrays without changing `reference_version`.

```ts
export const TE_MVP_V1_REFERENCE_DISTRIBUTIONS:
  Readonly<TEReferenceDistributions> = Object.freeze({
    reference_version: "TE_REFERENCE_V1",
    route_participation: Object.freeze([
      0.18, 0.24, 0.30, 0.36, 0.41, 0.46, 0.50, 0.54, 0.58,
      0.62, 0.66, 0.70, 0.73, 0.76, 0.79, 0.82, 0.85, 0.88
    ]),
    snap_share: Object.freeze([
      0.28, 0.36, 0.43, 0.50, 0.56, 0.61, 0.66, 0.70, 0.74,
      0.78, 0.81, 0.84, 0.87, 0.89, 0.91, 0.93, 0.95, 0.97
    ]),
    targets_per_route_run: Object.freeze([
      0.07, 0.09, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17,
      0.18, 0.19, 0.20, 0.21, 0.22, 0.24, 0.26, 0.28, 0.31
    ]),
    target_share: Object.freeze([
      0.025, 0.040, 0.055, 0.070, 0.082, 0.094, 0.105, 0.116, 0.127,
      0.138, 0.149, 0.160, 0.172, 0.185, 0.200, 0.218, 0.240, 0.270
    ]),
    average_depth_of_target: Object.freeze([
      2.5, 3.4, 4.2, 4.9, 5.5, 6.0, 6.5, 7.0, 7.4,
      7.8, 8.2, 8.7, 9.2, 9.8, 10.5, 11.3, 12.2, 13.5
    ]),
    red_zone_target_rate: Object.freeze([
      0.000, 0.020, 0.040, 0.060, 0.080, 0.100, 0.120, 0.140, 0.160,
      0.180, 0.200, 0.225, 0.250, 0.280, 0.315, 0.355, 0.400, 0.460
    ]),
    end_zone_target_rate: Object.freeze([
      0.000, 0.000, 0.010, 0.020, 0.030, 0.040, 0.050, 0.060, 0.070,
      0.080, 0.095, 0.110, 0.130, 0.150, 0.175, 0.205, 0.240, 0.290
    ]),
    catchable_target_rate: Object.freeze([
      0.58, 0.62, 0.65, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78,
      0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92, 0.94, 0.96
    ]),
    catch_rate: Object.freeze([
      0.48, 0.52, 0.55, 0.58, 0.60, 0.62, 0.64, 0.66, 0.68,
      0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.82, 0.85, 0.88
    ]),
    yards_per_target: Object.freeze([
      4.2, 4.8, 5.3, 5.8, 6.2, 6.6, 6.9, 7.2, 7.5,
      7.8, 8.1, 8.4, 8.8, 9.2, 9.7, 10.3, 11.0, 12.0
    ]),
    yards_per_reception: Object.freeze([
      7.2, 7.9, 8.5, 9.0, 9.4, 9.8, 10.1, 10.4, 10.7,
      11.0, 11.3, 11.7, 12.1, 12.6, 13.2, 13.9, 14.7, 15.8
    ]),
    yac_per_reception: Object.freeze([
      2.2, 2.6, 3.0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8,
      5.1, 5.4, 5.8, 6.2, 6.7, 7.2, 7.8, 8.5, 9.4
    ]),
    projected_team_dropbacks: Object.freeze([
      27.0, 28.5, 29.5, 30.5, 31.5, 32.5, 33.0, 33.5, 34.0,
      34.5, 35.0, 35.5, 36.0, 37.0, 38.0, 39.0, 40.5, 42.0
    ]),
    team_points_per_drive: Object.freeze([
      1.25, 1.40, 1.52, 1.62, 1.72, 1.80, 1.88, 1.96, 2.04,
      2.12, 2.20, 2.28, 2.38, 2.48, 2.60, 2.75, 2.92, 3.12
    ]),
    team_red_zone_trips_per_game: Object.freeze([
      2.0, 2.2, 2.4, 2.6, 2.8, 2.9, 3.0, 3.1, 3.2,
      3.3, 3.4, 3.5, 3.6, 3.8, 4.0, 4.2, 4.5, 4.8
    ]),
    expected_targets_per_game: Object.freeze([
      0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0,
      4.4, 4.8, 5.2, 5.7, 6.2, 6.8, 7.5, 8.3, 9.2
    ])
  });
```

Every array must:

- contain at least one finite number;
- use the same units as the associated input;
- contain no `null`, `undefined`, `NaN`, or infinite values.

The bundled object must be immutable during evaluation.

Failure to load or validate the bundled reference object is a fatal engine-configuration error. It must not silently degrade to percentile `50`.

The missing-reference fallback defined elsewhere in Section 26 applies only when a caller explicitly supplies a runtime reference object with a missing, invalid, or empty named distribution.

The Version 1 reference distributions are provisional implementation constants for the deterministic hobby MVP.
They are not claimed to be fully calibrated empirical NFL distributions.
They must remain unchanged for `TE_REFERENCE_V1`.
Any future replacement requires a new `reference_version`, regenerated golden outputs, and documented release notes.

The outer object and every nested array are frozen with `Object.freeze`. Implementations in another language must provide equivalent deep runtime immutability. A shallowly immutable outer object with mutable nested arrays is non-compliant.

Section 26 is implementation-frozen only while the literal values above remain unchanged under `TE_REFERENCE_V1`.

The bundled Version 1 configuration must contain all arrays above. `expected_targets_per_game` is a distinct reference distribution and cannot be replaced by the TPRR or target-share array.

For every percentile call use:

```text
pct(x) =
100 × (
  count(reference values strictly below x)
  + 0.5 × count(reference values exactly equal to x)
) / N
```

Rules:

- arrays may be unsorted;
- exact ties use mid-rank;
- below minimum returns `0` naturally;
- above maximum returns `100` naturally;
- no interpolation;
- clamp final percentile to `[0,100]`;
- use the same estimator for every component.

For percentile calculations, equality means strict numeric equality after parsing. Implementations must not use epsilon comparison, approximate equality, decimal rounding before comparison, or string-formatted equality. Use the exact finite numeric values supplied to the percentile function.

#### Reference Median

Whenever a fallback requires the median of a reference distribution, use this exact algorithm:

```text
reference_median(values):
1. Reject non-finite values.
2. Sort a copy of the remaining values in ascending numeric order.
3. Let N equal the number of values.
4. If N is odd:
       return sorted[(N - 1) / 2]
5. If N is even:
       return (
           sorted[N / 2 - 1]
         + sorted[N / 2]
       ) / 2
```

The engine must not mutate the supplied reference array. If the applicable runtime reference distribution is missing, empty, or contains no finite values, use the fixed secondary fallback stated for that canonical field.

#### Runtime Reference-Object Validation

A caller-supplied reference object may be partial at runtime even if the compile-time TypeScript interface uses required properties.

For each named distribution:

```text
if the property exists
and is an array
and contains at least one finite value:
    use its finite values
otherwise:
    treat that named distribution as missing
```

A missing runtime distribution must:

1. produce percentile `50` wherever that distribution is consumed;
2. create exactly one missing-reference log entry for that distribution;
3. subtract exactly `5` confidence points;
4. cause output status `PARTIAL`;
5. allow calculation to continue.

The penalty applies once per missing named distribution, regardless of how many calculations consume that distribution.

## 26.5 Exact fallback table, penalties, and status

### 26.5.1 Fallback semantics

- Resolve fallbacks from the original input values unless a row explicitly names a canonical field.
- Mutual fallbacks use original values to prevent circular behavior.
- Each canonical field appears at most once in `fallback_log`.
- Each canonical field incurs its penalty once.
- Reuse of a fallback value downstream does not repeat the penalty.
- No silent zero is permitted.

### 26.5.2 Fallback table

| Canonical field | Primary | First fallback | Final fallback | Penalty |
|---|---|---|---|---:|
| RP4 | original `route_participation_last4` | original RP8 | `clamp(original Snap4 × 0.72, 0, 0.85)` if Snap4 exists, else `0.50` | 15 |
| RP8 | original `route_participation_last8` | original RP4 | `clamp(original Snap4 × 0.72, 0, 0.85)` if Snap4 exists, else `0.50` | 12 |
| Snap4 | original `snap_share_last4` | `clamp(max(canonical RP4, canonical RP8) / 0.80, 0, 1)` | `0.65` | 6 |
| TPRR | current | non-overlapping career TPRR | draft/prospect prior | 10 |
| Target share | current | `canonical RP4 × shrunk_TPRR × 0.92`, capped at `0.30` | `0.12` | 6 |
| aDOT | current | none | `7.5` | 3 |
| Red-zone target rate | current | non-overlapping career rate | `0.18` | 6 |
| End-zone target rate | current | non-overlapping career rate | `0.08` | 6 |
| Catchable-target rate | current | QB mapping | `0.76` | 6 |
| Catch rate | current | non-overlapping career rate | `0.68` | 5 |
| Yards/target | current | non-overlapping career value | `7.20` | 5 |
| Yards/reception | current | non-overlapping career value | `10.60` | 5 |
| YAC/reception | current | non-overlapping career value | `4.60` | 5 |
| Team dropbacks | projection | reference median | `34.0` | 5 |
| Points/drive | current | reference median | `1.90` | 5 |
| Team red-zone trips | current | reference median | `3.2` | 5 |
| QB environment | current | none | `50` | 6 |
| Competition pressure | current | none | `0.50` | 4 |
| Contract security | current | draft-round mapping | `0.35` | 4 |
| Workload ramp | current | status/practice lookup | lookup value | 4 |

The route fallback is deliberately discounted. `Snap4 × 0.72` is only a proxy and must not be treated as observed routes.

### 26.5.3 Binding Fallback Dependency Order

Canonical fallbacks must be resolved in the following dependency order:

1. Preserve all original nullable input values.
2. Compute the draft-round and prospect-type priors required by fallback rules.
3. Resolve canonical RP4 and canonical RP8 from the original route-participation and snap-share inputs.
4. Resolve canonical Snap4 from the canonical route-participation values.
5. Resolve canonical TPRR.
6. Compute `shrunk_TPRR`.
7. Resolve canonical target share.
8. Resolve canonical QB environment.
9. Resolve canonical catchable-target rate.
10. Resolve all remaining canonical fields.
11. Apply all remaining shrinkage formulas.

The target-share fallback must use:

```text
derived_target_share =
    canonical_RP4
  × shrunk_TPRR
  × 0.92
canonical_target_share =
    min(derived_target_share, 0.30)
```

The target-share fallback must never use unshrunk TPRR.

This dependency order overrides any general wording elsewhere in Section 26 that instructs the engine to resolve every fallback before computing shrinkage.

#### 26.5.2.1 Mutual Route-Participation Fallback Rule

RP4 and RP8 must be resolved from the original submitted values, not from values generated earlier in the fallback process.

Use:

```text
original_RP4
original_RP8
original_Snap4
```

The engine must not allow a fallback-generated RP4 to become the source of RP8, or a fallback-generated RP8 to become the source of RP4.

Required resolution:

```text
canonical_RP4:
    if original_RP4 is present:
        original_RP4
    else if original_RP8 is present:
        original_RP8
    else if original_Snap4 is present:
        min(original_Snap4 × 0.72, 0.85)
    else:
        0.50
canonical_RP8:
    if original_RP8 is present:
        original_RP8
    else if original_RP4 is present:
        original_RP4
    else if original_Snap4 is present:
        min(original_Snap4 × 0.72, 0.85)
    else:
        0.50
```

#### 26.5.2.2 Binding route-participation proxy behavior

When original `route_participation_last4` is null and original `route_participation_last8` is also null, but original `snap_share_last4` exists, resolve both canonical route fields as:

```text
route_proxy = clamp(original snap_share_last4 × 0.72, 0, 0.85)
canonical RP4 = route_proxy
canonical RP8 = route_proxy
```

Implementation rules:

1. Log one fallback for canonical `RP4` with `fallback_used = "SNAP_SHARE_PROXY"` and confidence penalty `15`.
2. Log one fallback for canonical `RP8` with `fallback_used = "SNAP_SHARE_PROXY"` and confidence penalty `12`.
3. Set output `status = PARTIAL`.
4. The canonical proxy values may feed every downstream calculation that normally consumes `RP4` or `RP8`, including trends, consistency, blocking gap, components, expected routes, expected targets, EFO, volatility, and explanations.
5. Do not apply an additional generic route-proxy penalty beyond the two canonical-field penalties above.
6. If RP4 is missing but original RP8 exists, RP4 uses original RP8; if RP8 is missing but original RP4 exists, RP8 uses original RP4. Those are cross-window fallbacks, not snap-derived proxies, and use the penalties already listed in the fallback table.
7. When neither route field nor snap share exists, use `0.50` for the missing canonical route field, log `fallback_used = "FIXED_0.50"`, apply that field's listed penalty, and set `PARTIAL`.

### 26.5.4 QB fallback mapping for catchable-target rate

When `catchable_target_rate` is missing:

```text
qb_mapped_catchable_rate = clamp(0.66 + 0.002 × qb_environment_score, 0.66, 0.86)
```

Use the canonical QB environment score after its own fallback. Log and penalize the missing catchable-target rate independently.

### 26.5.5 Workload-ramp fallback

`workload_ramp_factor` is a multiplier. When supplied, it must be finite and must be clamped as follows:

```text
canonical_workload_ramp_factor =
    clamp(workload_ramp_factor, 0, 1)
```

A supplied value below `0` or above `1` is clamped rather than rejected. Clamping a supplied workload-ramp value does not create a fallback log entry, does not cause `PARTIAL`, and does not create a confidence penalty.

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

Log one four-point workload-ramp penalty.

### 26.5.6 Contract-security mapping

```text
Round 1 = 1.00
Round 2 = 0.82
Round 3 = 0.65
Rounds 4–5 = 0.45
Rounds 6–7 = 0.26
Undrafted/unknown = 0.20
```

### 26.5.7 TPRR prior mapping

Start with draft-round base:

```text
Round 1 = 0.205
Round 2 = 0.195
Round 3 = 0.185
Rounds 4–5 = 0.175
Rounds 6–7 = 0.165
Undrafted/unknown = 0.160
```

Apply one prospect-type adjustment:

```text
RECEIVING = +0.015
BALANCED = 0.000
BLOCKING_FIRST = -0.015
UNKNOWN = 0.000
```

Then clamp the prior to `[0.145,0.225]`.

### 26.5.8 Canonical Fallback-Log Values

`fallback_log.field` and `fallback_log.fallback_used` are closed string enums.

| Canonical field | `field` | Allowed `fallback_used` |
|---|---|---|
| RP4 | `RP4` | `RP8_CROSS_WINDOW`, `SNAP_SHARE_PROXY`, `FIXED_0.50` |
| RP8 | `RP8` | `RP4_CROSS_WINDOW`, `SNAP_SHARE_PROXY`, `FIXED_0.50` |
| Snap4 | `SNAP4` | `ROUTE_PARTICIPATION_PROXY`, `FIXED_0.65` |
| TPRR | `TPRR` | `CAREER_TPRR`, `DRAFT_PROSPECT_PRIOR` |
| Target share | `TARGET_SHARE` | `RP4_SHRUNK_TPRR_PROXY`, `FIXED_0.12` |
| aDOT | `AVERAGE_DEPTH_OF_TARGET` | `FIXED_7.50` |
| Red-zone rate | `RED_ZONE_TARGET_RATE` | `CAREER_RED_ZONE_TARGET_RATE`, `FIXED_0.18` |
| End-zone rate | `END_ZONE_TARGET_RATE` | `CAREER_END_ZONE_TARGET_RATE`, `FIXED_0.08` |
| Catchable rate | `CATCHABLE_TARGET_RATE` | `QB_ENVIRONMENT_PROXY`, `FIXED_0.76` |
| Catch rate | `CATCH_RATE` | `CAREER_CATCH_RATE`, `FIXED_0.68` |
| Yards per target | `YARDS_PER_TARGET` | `CAREER_YARDS_PER_TARGET`, `FIXED_7.20` |
| Yards per reception | `YARDS_PER_RECEPTION` | `CAREER_YARDS_PER_RECEPTION`, `FIXED_10.60` |
| YAC per reception | `YAC_PER_RECEPTION` | `CAREER_YAC_PER_RECEPTION`, `FIXED_4.60` |
| Team dropbacks | `PROJECTED_TEAM_DROPBACKS` | `REFERENCE_MEDIAN`, `FIXED_34.00` |
| Points per drive | `TEAM_POINTS_PER_DRIVE` | `REFERENCE_MEDIAN`, `FIXED_1.90` |
| Red-zone trips | `TEAM_RED_ZONE_TRIPS_PER_GAME` | `REFERENCE_MEDIAN`, `FIXED_3.20` |
| QB environment | `QB_ENVIRONMENT_SCORE` | `FIXED_50` |
| Competition | `COMPETITION_PRESSURE` | `FIXED_0.50` |
| Contract security | `CONTRACT_SECURITY` | `DRAFT_ROUND_MAPPING` |
| Workload ramp | `WORKLOAD_RAMP_FACTOR` | `STATUS_PRACTICE_MAPPING` |

For a missing runtime reference distribution, use:

```text
field =
    "REFERENCE_DISTRIBUTION:<distribution_property_name>"
fallback_used =
    "PERCENTILE_50"
```

Each canonical field may appear at most once in `fallback_log`.

Entries must be serialized in:

1. the canonical field order shown in the table above;
2. followed by missing reference distributions in `TEReferenceDistributions` interface order.

### 26.5.9 Status

- `OK`: no field fallback and no reference-distribution fallback was used.
- `PARTIAL`: one or more documented fallbacks were used.
- Missing `previous_*` trend history uses neutral 50 and does not create a fallback entry, confidence penalty, or `PARTIAL` status.

## 26.6 Exact shrinkage formulas

Use:

```text
sample_weight = n / (n + k)
shrunk_value = sample_weight × observed + (1 - sample_weight) × prior
```

### 26.6.1 TPRR

```text
tprr_weight = career_routes / (career_routes + 140)
shrunk_TPRR =
    tprr_weight × canonical_TPRR
  + (1 - tprr_weight) × draft_prospect_TPRR_prior
```

### 26.6.2 Catch rate

```text
catch_weight = career_targets / (career_targets + 120)
catch_prior = valid_non_overlapping_career_catch_rate ?? 0.68
shrunk_catch_rate =
    catch_weight × canonical_catch_rate
  + (1 - catch_weight) × catch_prior
```

### 26.6.3 Yards per target

```text
ypt_weight = career_targets / (career_targets + 180)
ypt_prior = valid_non_overlapping_career_yards_per_target ?? 7.20
shrunk_yards_per_target =
    ypt_weight × canonical_yards_per_target
  + (1 - ypt_weight) × ypt_prior
```

### 26.6.4 Yards per reception

```text
ypr_weight = career_targets / (career_targets + 160)
ypr_prior = valid_non_overlapping_career_yards_per_reception ?? 10.60
shrunk_yards_per_reception =
    ypr_weight × canonical_yards_per_reception
  + (1 - ypr_weight) × ypr_prior
```

### 26.6.5 YAC per reception

```text
yac_weight = career_targets / (career_targets + 180)
yac_prior = valid_non_overlapping_career_yac_per_reception ?? 4.60
shrunk_yac_per_reception =
    yac_weight × canonical_yac_per_reception
  + (1 - yac_weight) × yac_prior
```

### 26.6.6 Red-zone target rate

```text
rz_weight = career_targets / (career_targets + 120)
rz_prior = valid_non_overlapping_career_red_zone_target_rate ?? 0.18
shrunk_red_zone_target_rate =
    rz_weight × canonical_red_zone_target_rate
  + (1 - rz_weight) × rz_prior
```

### 26.6.7 End-zone target rate

```text
ez_weight = career_targets / (career_targets + 160)
ez_prior = valid_non_overlapping_career_end_zone_target_rate ?? 0.08
shrunk_end_zone_target_rate =
    ez_weight × canonical_end_zone_target_rate
  + (1 - ez_weight) × ez_prior
```

No other Version 1 signal is shrunk.

## 26.7 Exact trend formulas

```text
if previous_route_participation is null:
    route_trend_score = 50
else:
    route_delta = RP4 - previous_route_participation
    route_trend_score = clamp(50 + 220 × route_delta, 0, 100)
```

```text
if previous_targets_per_route_run is null:
    tprr_trend_score = 50
else:
    tprr_delta = shrunk_TPRR - previous_targets_per_route_run
    tprr_trend_score = clamp(50 + 300 × tprr_delta, 0, 100)
```

```text
route_consistency_score = clamp(100 - 250 × abs(RP4 - RP8), 0, 100)
```

Missing previous history is neutral and not a fallback.

## 26.8 Exact derived values and eight component formulas

Every `pct` uses the matching Section 26.4 distribution.

### 26.8.1 Shared pre-component values

```text
blocking_gap = clamp(Snap4 - RP4, 0, 1)

blocking_heavy_role =
    blocking_gap >= 0.25
    and RP4 < 0.65

base_expected_routes = projected_team_dropbacks × RP4
base_expected_targets = base_expected_routes × shrunk_TPRR
```

These values exclude `Pactive` and workload ramp. Components describe the current football profile, not this week's availability limitation.

### 26.8.2 Route Role — RR

```text
RR = clamp(
    0.50 × pct(RP4; route_participation)
  + 0.20 × pct(RP8; route_participation)
  + 0.15 × route_trend_score
  + 0.10 × route_consistency_score
  + 0.05 × pct(Snap4; snap_share),
0,100)
```

Apply the binding blocking-role gate:

```text
if blocking_heavy_role:
    RR = min(RR,65)
```

This is the complete Version 1 blocking gate. It suppresses the Route Role component and is also consumed by the declared RD adjustment, volatility term through `blocking_gap`, and blocking explanation. It does **not** independently reduce canonical RP4, expected routes, shrunk TPRR, expected targets, catch rate, yardage, touchdown rate, Weekly EFO, or ROS EFO. The observed or proxied route participation already performs the volume suppression; applying another EFO multiplier would double-count blocking deployment.

### 26.8.3 Target Earning — TE

```text
TE = clamp(
    0.65 × pct(shrunk_TPRR; targets_per_route_run)
  + 0.20 × pct(target_share; target_share)
  + 0.15 × tprr_trend_score,
0,100)
```

Apply a low-route ceiling only to the component's claim of established target dominance:

```text
if RP4 < 0.45:
    TE = min(TE,82)
```

This cap does not reduce shrunk TPRR or expected targets.

### 26.8.4 Target Quality — TQ

Construct a public-data target-quality score:

```text
depth_quality_score = clamp(100 - 5 × abs(aDOT - 8.0), 0, 100)

TQ_raw =
    0.25 × depth_quality_score
  + 0.25 × pct(catchable_target_rate; catchable_target_rate)
  + 0.25 × pct(shrunk_red_zone_target_rate; red_zone_target_rate)
  + 0.25 × pct(shrunk_end_zone_target_rate; end_zone_target_rate)
```

Apply a volume gate:

```text
if base_expected_targets < 2.0:
    TQ = min(TQ_raw,72)
else:
    TQ = TQ_raw

TQ = clamp(TQ,0,100)
```

### 26.8.5 Receiving Efficiency — RE

```text
RE_raw =
    0.35 × pct(shrunk_catch_rate; catch_rate)
  + 0.35 × pct(shrunk_yards_per_target; yards_per_target)
  + 0.20 × pct(shrunk_yards_per_reception; yards_per_reception)
  + 0.10 × pct(shrunk_yac_per_reception; yac_per_reception)
```

Sample caps:

```text
if career_targets < 40:
    RE = clamp(RE_raw,25,75)
else if career_targets < 100:
    RE = clamp(RE_raw,15,85)
else:
    RE = clamp(RE_raw,0,100)
```

### 26.8.6 Team Context — TC

```text
TC = clamp(
    0.35 × pct(projected_team_dropbacks; projected_team_dropbacks)
  + 0.20 × pct(team_points_per_drive; team_points_per_drive)
  + 0.20 × pct(team_red_zone_trips_per_game; team_red_zone_trips_per_game)
  + 0.15 × qb_environment_score
  + 0.10 × (100 - 100 × competition_pressure),
0,100)
```

Competition appears in exactly four places: `10%` of TC through `(100 - 100 × competition_pressure)`, the `-22 × competition_pressure` RD term, the `+16 × competition_pressure` volatility term, and the declared competition explanation trigger. It must not be consumed anywhere else. It does not directly alter EFO in Version 1.

### 26.8.7 Role Durability — RD

```text
role_change_adjustment =
    +12 for PROMOTED
    -12 for DEMOTED
      0 otherwise

depth_chart_adjustment =
    +10 for TE1
     +2 for TE2
    -10 for TE3_OR_DEPTH
      0 for UNKNOWN

coaching_adjustment =
     +5 for CONTINUITY
     -5 for CHANGE
      0 for UNKNOWN

age_security_adjustment =
     +5 when age <= 25
      0 when age is 26–29
     -5 when age is 30–31
    -10 when age >= 32

receiving_role_adjustment =
     +6 when RP4 >= 0.70 and shrunk_TPRR >= 0.18
     -8 when blocking_heavy_role and shrunk_TPRR < 0.16
      0 otherwise
```

```text
RD = clamp(
  45
+ 20 × contract_security
- 22 × competition_pressure
+ role_change_adjustment
+ depth_chart_adjustment
+ coaching_adjustment
+ age_security_adjustment
+ receiving_role_adjustment
- (8 if teammate_return_flag else 0)
- (8 if another_receiving_te_flag else 0)
- (10 if temporary_opportunity_flag else 0)
- (6 if new_team_flag else 0),
0,100)
```

### 26.8.8 Age & Development — AD

The age curve is a discrete lookup with no interpolation. Use the player's exact integer age from the validated input. Age affects the model only through `AD`, the explicit age-security adjustment inside `RD`, horizon weights, and age explanations. It never directly changes Weekly or ROS football-stat expectations or EFO.

| Age | Development stage | Base score |
|---|---|---:|
| 18–21 | Developmental prospect | 88 |
| 22 | Early development | 86 |
| 23 | Early development | 84 |
| 24 | Breakout window | 82 |
| 25 | Breakout/prime-building | 78 |
| 26 | Prime-building | 73 |
| 27 | Prime | 68 |
| 28 | Prime | 63 |
| 29 | Late prime | 57 |
| 30 | Early decline | 49 |
| 31 | Gradual decline | 40 |
| 32 | Material long-term decline | 31 |
| 33 | Material long-term decline | 23 |
| 34–45 | Late-career decline | 16 |

```text
development_adjustment =
    +6 when nfl_seasons_completed is 1 or 2
    +3 when nfl_seasons_completed is 3
     0 otherwise

prospect_adjustment =
    +3 when prospect_type is RECEIVING and career_routes < 300
    -3 when prospect_type is BLOCKING_FIRST and career_routes < 300
     0 otherwise

AD = clamp(age_base + development_adjustment + prospect_adjustment,0,100)
```

Horizon effect is determined only by the fixed AD weights in Section 26.9: `0.02` Weekly, `0.05` ROS, `0.13` One Year, `0.20` Three Year, and `0.27` Dynasty. These values are binding; do not create separate horizon-specific age curves. Age never enters Weekly or ROS EFO directly.

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

## 26.9 All five horizon weight rows

Component order is `RR, TE, TQ, RE, TC, RD, AD, AV`.

| Horizon | RR | TE | TQ | RE | TC | RD | AD | AV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| WEEKLY | .25 | .22 | .10 | .05 | .14 | .05 | .02 | .17 |
| ROS | .22 | .22 | .10 | .06 | .11 | .14 | .05 | .10 |
| ONE_YEAR | .17 | .20 | .09 | .08 | .08 | .21 | .13 | .04 |
| THREE_YEAR | .12 | .18 | .08 | .09 | .05 | .24 | .20 | .04 |
| DYNASTY | .09 | .17 | .07 | .08 | .03 | .25 | .27 | .04 |

Every row sums to `1.00`.

```text
composite[horizon] = Σ(component × horizon_weight)
```

All composites are internal. They never feed EFO and contain no scarcity.

## 26.10 Weekly and ROS Expected Fantasy Output

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
expected_active_games_remaining = 0
ROS EFO = 0
```

Version 1 does not infer scheduled returns.

For other statuses:

```text
effective_ramp = clamp(canonical_workload_ramp_factor,0,1)
```

### 26.10.2 Active-game calculation

Define:

```text
calculate_active_game(ramp):
    expected_routes =
        projected_team_dropbacks
      × RP4
      × ramp

    expected_targets = expected_routes × shrunk_TPRR

    depth_catch_adjustment =
        -0.010 × max(aDOT - 8, 0)
        +0.006 × max(8 - aDOT, 0)

    qb_catch_adjustment =
        0.08 × ((qb_environment_score - 50) / 50)

    expected_catch_rate = clamp(
        0.55 × shrunk_catch_rate
      + 0.30 × catchable_target_rate
      + 0.15 × 0.68
      + depth_catch_adjustment
      + qb_catch_adjustment,
      0.42,
      0.88
    )

    expected_receptions = expected_targets × expected_catch_rate

    ypr_from_depth = 6.8 + 0.52 × aDOT
    expected_yards_per_reception = clamp(
        0.55 × shrunk_yards_per_reception
      + 0.25 × ypr_from_depth
      + 0.20 × (6.0 + shrunk_yac_per_reception),
      6.0,
      18.0
    )

    ypt_consistency_cap = clamp(
        shrunk_yards_per_target / max(expected_catch_rate,0.01),
        6.0,
        18.0
    )

    expected_yards_per_reception = clamp(
        0.75 × expected_yards_per_reception
      + 0.25 × ypt_consistency_cap,
      6.0,
      18.0
    )

    expected_receiving_yards =
        expected_receptions × expected_yards_per_reception

    base_receiving_td_rate_per_target = 0.040

    red_zone_opportunity_factor = clamp(
        0.70 + 1.50 × shrunk_red_zone_target_rate,
        0.70,
        1.35
    )

    end_zone_opportunity_factor = clamp(
        0.75 + 2.50 × shrunk_end_zone_target_rate,
        0.75,
        1.35
    )

    team_scoring_factor = clamp(
        team_points_per_drive / 1.90,
        0.70,
        1.35
    )

    expected_td_rate_per_target = clamp(
        base_receiving_td_rate_per_target
      × red_zone_opportunity_factor
      × end_zone_opportunity_factor
      × team_scoring_factor,
      0.015,
      0.095
    )

    expected_receiving_touchdowns =
        expected_targets
      × expected_td_rate_per_target

    active_game_fantasy_points =
        expected_receptions × points_per_reception
      + expected_receiving_yards × points_per_receiving_yard
      + expected_receiving_touchdowns × points_per_receiving_td

    return all values above
```

This is the complete binding touchdown chain:

```text
Expected Targets
× 0.040 base receiving TD rate per target
× red-zone opportunity factor
× end-zone opportunity factor
× team scoring factor
→ capped expected TD rate per target
× Expected Targets
→ Expected Receiving Touchdowns
```

The minimum and maximum expected TD rates per target are `0.015` and `0.095`. No other touchdown multiplier, recent conversion rate, realized touchdown total, quarterback touchdown rate, or red-zone-trip multiplier may be added in Version 1. `team_red_zone_trips_per_game` affects `TC` only and does not enter this EFO touchdown chain, preventing duplicate team red-zone adjustment.

Compute:

```text
current_active_game = calculate_active_game(effective_ramp)
full_workload_active_game = calculate_active_game(1.00)
```

### 26.10.3 Weekly interpretation

Weekly football-stat expectations are conditional on activity, include the ramp, and are not multiplied by `Pactive`:

- expected routes;
- expected targets;
- expected receptions;
- expected receiving yards;
- expected receiving touchdowns.

```text
weekly.expected_fantasy_points =
    Pactive × current_active_game.active_game_fantasy_points
```

Apply `Pactive` exactly once.

### 26.10.4 ROS recovery-aware formula

```text
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
later_active_games = max(expected_active_games_remaining - first_active_game_weight,0)

ROS_EFO =
    first_active_game_weight
      × current_active_game.active_game_fantasy_points
  + later_active_games
      × full_workload_active_game.active_game_fantasy_points
```

The current ramp applies only to the first expected active game. No recovery simulation is implied.

One-Year, Three-Year, and Dynasty EFO are deferred. Return their composites only.

## 26.11 Exact confidence formula

Start at `100`.

Subtract every unique Section 26.5 field-fallback penalty once and every missing-distribution penalty once.

Then subtract these non-fallback penalties once:

```text
15 when career_routes < 75
10 when career_routes is 75–199
6 when career_routes is 200–399

10 when injury_status is UNKNOWN
10 when role_change is UNKNOWN
8 when depth_chart_role is UNKNOWN
6 when coaching_continuity is UNKNOWN
8 when new_team_flag is true
6 when another_receiving_te_flag is true
5 when team is null
```

Do not add another route-proxy penalty when RP4 or RP8 fallback already captured it. Do not penalize the same missing field twice.

#### Canonical Confidence-Penalty Codes

`confidence.penalties` must contain machine-readable codes rather than developer-written prose.

For canonical field fallbacks, use:

```text
FALLBACK:<fallback_log.field>
```

For missing reference distributions, use:

```text
MISSING_REFERENCE:<distribution_property_name>
```

Use the following exact non-fallback codes:

```text
LOW_CAREER_ROUTES_LT_75
LOW_CAREER_ROUTES_75_TO_199
LOW_CAREER_ROUTES_200_TO_399
UNKNOWN_INJURY_STATUS
UNKNOWN_ROLE_CHANGE
UNKNOWN_DEPTH_CHART_ROLE
UNKNOWN_COACHING_CONTINUITY
NEW_TEAM
ANOTHER_RECEIVING_TE
MISSING_TEAM
```

Each code may appear at most once.

Serialize confidence-penalty codes in this order:

1. canonical field fallbacks in fallback-table order;
2. missing reference distributions in reference-interface order;
3. non-fallback rules in the order listed above.

The confidence score is unaffected by the ordering of these codes.

```text
raw_confidence = clamp(100 - sum(unique penalties),0,100)
serialized_confidence = round(raw_confidence,1)
```

Derive the label from Section 26.2.4. Confidence never changes EFO, components, composites, or football statistics.

## 26.12 Exact volatility formula

Use current active-game values, not `Pactive`-weighted Weekly EFO.

```text
touchdown_points =
    current_active_game.expected_receiving_touchdowns
  × points_per_receiving_td

td_dependence = clamp(
  touchdown_points /
    max(current_active_game.active_game_fantasy_points,1),
  0,1)

explosive_yardage_proxy = clamp(
  (shrunk_yards_per_reception - 9.0) / 9.0,
  0,1)

explosive_dependence = clamp(
    0.60 × explosive_yardage_proxy
  + 0.40 × clamp(shrunk_yac_per_reception / 8.0,0,1),
  0,1)

prior_weight = 140 / (career_routes + 140)
```

```text
raw_volatility =
    16 × (1 - RP4)
  + 10 × blocking_gap
  + 16 × competition_pressure
  + 18 × td_dependence
  + 10 × explosive_dependence
  + 14 × prior_weight
  + (10 if injury_status is QUESTIONABLE or UNKNOWN else 0)
  + (10 if role_change is PROMOTED, DEMOTED, or UNKNOWN else 0)
  + (8 if teammate_return_flag else 0)
  + (8 if another_receiving_te_flag else 0)
  + (8 if temporary_opportunity_flag else 0)
  + (6 if new_team_flag else 0)

raw_volatility = clamp(raw_volatility,0,100)
serialized_volatility = round(raw_volatility,1)
```

Serialize `td_dependence` and `explosive_dependence` to one decimal. Derive the label from the rounded volatility score.

Low expected output does not automatically mean high volatility.

## 26.13 Exact explanation generation and merge order

### 26.13.1 Direct EFO explanations

Evaluate in this exact order.

Positive:

1. `RP4 >= 0.75` → “Runs routes on most team dropbacks.” Topic `route_role`.
2. `shrunk_TPRR >= 0.22` → “Earns targets at a strong rate when in a route.” Topic `target_earning`.
3. `shrunk_red_zone_target_rate >= 0.24 or shrunk_end_zone_target_rate >= 0.12` → “Red-zone usage supports touchdown opportunity.” Topic `touchdown_opportunity`.

Negative:

4. `blocking_heavy_role` → “A blocking-heavy role limits receiving volume.” Topic `route_role`.
5. `competition_pressure >= 0.65 or another_receiving_te_flag` → “Another receiving option creates meaningful route and target competition.” Topic `competition`.
6. `temporary_opportunity_flag` → “Recent receiving usage may be temporary while a teammate is unavailable.” Topic `role_durability`.
7. `td_dependence >= 0.35` → “The projection depends heavily on touchdowns.” Topic `touchdown_dependence`.
8. `AV < 60` → “Current availability materially lowers the weekly outlook.” Topic `availability`.
9. `AD < 35 and selected_horizon in {THREE_YEAR,DYNASTY}` → “The current role is productive, but long-term age risk is increasing.” Topic `age`.
10. `new_team_flag` → “A new-team role adds uncertainty to the projection.” Topic `role_durability`.

### 26.13.2 Component drivers

For the selected horizon:

```text
component_deviation = component_score - 50
weighted_driver = component_deviation × horizon_weight
```

- Positive component candidate: `weighted_driver >= 1.0`.
- Negative component candidate: `weighted_driver <= -1.0`.
- Sort positives largest to smallest.
- Sort negatives most negative to least negative.

Templates:

| Component | Positive | Negative | Topic |
|---|---|---|---|
| RR | “Current route usage supports the outlook.” | “Limited route usage constrains the outlook.” | route_role |
| TE | “Target-earning ability strengthens the profile.” | “Target earning is below the TE reference group.” | target_earning |
| TQ | “Target quality supports efficient fantasy opportunity.” | “Target quality limits the value of expected volume.” | target_quality |
| RE | “Receiving efficiency is above the TE reference group.” | “Receiving efficiency is below the TE reference group.” | receiving_efficiency |
| TC | “The team passing environment supports opportunity.” | “The team environment limits receiving opportunity.” | team_context |
| RD | “The receiving role has strong durability support.” | “Role durability is a material concern.” | role_durability |
| AD | “Age and development support the long-term profile.” | “Age reduces the long-term profile.” | age |
| AV | “Current availability supports the weekly outlook.” | “Current availability lowers the weekly outlook.” | availability |

### 26.13.3 Merge order

1. Generate direct explanations in the exact order above.
2. Separate direct positives and negatives.
3. Generate and sort component candidates.
4. Add direct explanations before component explanations.
5. Remove duplicates by topic.
6. Do not permit one topic in both arrays.
7. When direct candidates conflict by topic, the first applicable direct candidate wins.
8. When component candidates conflict and no direct candidate exists, retain the larger absolute weighted contribution; exact tie prefers negative.
9. Return at most three positives and three negatives.
10. Use fixed templates only.
11. No statement may claim certainty, proof, causation, diagnosis, or guaranteed breakout.

## 26.14 Binding Calculation Order

The engine must execute in this exact order:

1. Validate the input, scoring object, options, and explicitly supplied runtime reference object.
2. Trim and normalize the declared identity and version strings.
3. Preserve all original nullable input values.
4. Resolve scoring defaults, selected-horizon default, model-version default, and the applicable reference object.
5. Compute draft-round and prospect-type priors required by fallback rules.
6. Resolve canonical RP4 and RP8 from original values.
7. Resolve canonical Snap4.
8. Resolve canonical TPRR.
9. Compute `shrunk_TPRR`.
10. Resolve canonical target share using `shrunk_TPRR`.
11. Resolve canonical QB environment.
12. Resolve canonical catchable-target rate.
13. Resolve all remaining canonical fallbacks.
14. Apply all remaining shrinkage formulas.
15. Compute route trend, TPRR trend, and route consistency.
16. Compute shared role and opportunity values.
17. Compute every required percentile.
18. Compute all eight components and apply their gates, floors, and caps.
19. Compute all five horizon composites.
20. Compute availability and probability active.
21. Compute the current-ramp conditional active-game projection.
22. Compute the full-workload conditional active-game projection.
23. Compute Weekly EFO.
24. Compute ROS EFO.
25. Compute confidence.
26. Compute volatility and dependence ratios.
27. Generate and order explanations using the selected horizon.
28. Determine `OK` or `PARTIAL`.
29. Round and serialize the output.
30. Derive categorical labels from the rounded scores.
31. Validate that every serialized numeric output is finite and within its declared output range.

No later step may alter a value used by an earlier step unless the specification explicitly defines that alteration.

Do not add simulation, hidden smoothing, market inputs, scarcity, scheduled-return inference, or long-term fantasy-point fabrication.

## 26.15 Exact output interface

```ts
interface TEMVPOutput {
  schema_version: "te-mvp-1.0";
  model_version: string;
  reference_version: string;
  selected_horizon:
    | "WEEKLY"
    | "ROS"
    | "ONE_YEAR"
    | "THREE_YEAR"
    | "DYNASTY";
  scoring: {
    points_per_reception: number;
    points_per_receiving_yard: number;
    points_per_receiving_td: number;
  };
  player_id: string;
  player_name: string;
  team: string | null;
  as_of_timestamp: string;

  components: {
    RR: number;
    TE: number;
    TQ: number;
    RE: number;
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
    probability_active: number;
    workload_ramp_factor: number;
    expected_routes: number;
    expected_targets: number;
    expected_receptions: number;
    expected_receiving_yards: number;
    expected_receiving_touchdowns: number;
    expected_fantasy_points: number;
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
    explosive_dependence: number;
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

`selected_horizon` must contain the resolved option after applying the default. `scoring` must contain the resolved scoring values after applying scoring defaults. These metadata fields do not change any model calculation.

Shared metadata fields are mandatory. Store outputs historically. Keep all five composites internal until the shared utility layer exists.

## 26.16 Mandatory tests

### 26.16.1 Formula and invariant tests

1. Every component is finite and within `[0,100]`.
2. Every composite is finite and within `[0,100]`.
3. Every horizon row sums to `1.00` within machine tolerance.
4. Increasing RP4 with all else fixed increases expected routes and Weekly EFO.
5. Increasing shrunk TPRR with all else fixed increases targets and Weekly EFO.
6. Increasing expected catch rate inputs increases receptions.
7. Increasing red-zone or end-zone opportunity increases expected TDs.
8. Increasing competition pressure lowers RD.
9. `OUT`, `IR`, `PUP`, and `SUSPENDED` produce `AV=0`, `Pactive=0`, Weekly EFO `0`, expected active games `0`, and ROS EFO `0`.
10. Components and composites never feed EFO.
11. Confidence never changes EFO or football statistics.
12. Scoring changes fantasy points but not routes, targets, receptions, yards, TD expectations, components, or composites.
13. Identical normalized inputs, references, and options reproduce identical outputs.
14. No serialized output is non-finite.
15. `Pactive` is applied exactly once.
16. Current ramp affects the first expected active game only in ROS.

### 26.16.2 TE-specific tests

1. Two players with identical snap share but different route participation satisfy the exact paired invariant in Section 26.16.7.
2. High snap share alone cannot produce strong RR or receiving projection when route participation is low.
3. High route participation with moderate snap share can still create strong fantasy utility.
4. A blocking-heavy role triggers the RR cap where specified.
5. A low-route/high-TPRR player has TE greater than RR and remains volume-capped by routes.
6. A touchdown specialist cannot reach elite EFO without sufficient routes and targets.
7. A young low-route TE remains more prior-driven and has lower confidence/higher volatility than an established TE.
8. An aging productive veteran has strong Weekly/ROS output but weaker Three-Year/Dynasty composites.
9. A snap-derived route proxy sets `PARTIAL`; when both route windows are missing, it logs canonical RP4 and RP8 once each and applies the `15`- and `12`-point penalties once each, with no additional proxy penalty.
10. Another receiving TE or teammate return lowers RD and/or raises volatility exactly as specified.
11. Realized touchdown totals cannot change any output because they are not an input.
12. Blocking gap may affect RR, RD, volatility, and explanation, but never directly reduce expected routes beyond observed RP4.

### 26.16.3 Fallback tests

1. Test every fallback row independently.
2. Each missing canonical field logs once and penalizes once.
3. No duplicate fallback fields.
4. Mutual RP4/RP8 fallbacks use original values.
5. Chained fallbacks do not become order-dependent.
6. Missing references use percentile 50, five-point penalty, and `PARTIAL`.
7. No missing value becomes a silent zero.
8. Missing previous trend history remains neutral without `PARTIAL`.

### 26.16.4 Explanation tests

1. Positive and negative arrays contain at most three statements each.
2. Direct EFO statements precede component statements.
3. Duplicate topics are removed.
4. One topic cannot appear in both arrays.
5. Selected horizon may change component ordering but not components, composites, or EFO.
6. No explanation uses causal, diagnostic, certainty, or proof language.
7. Blocking-heavy, touchdown-dependent, teammate-return, age, and new-team statements trigger only under declared rules.

### 26.16.5 Validation tests

Reject:

- empty identity;
- age outside `18–45`;
- negative career routes or targets;
- negative expected games remaining;
- rates outside `[0,1]`;
- QB score outside `[0,100]`;
- non-finite values;
- invalid enums;
- invalid timestamps;
- negative scoring constants;
- null required booleans;
- invalid selected horizon;
- empty reference version;
- an invalid bundled reference object.

A partial caller-supplied runtime reference object is accepted and handled under Section 26.4.

Accept nullable fields that have documented fallbacks.

### 26.16.6 Ten mandatory fictional golden fixtures

After formula tests pass, generate complete expected outputs from the approved implementation. Do not manually edit golden outputs.

1. **Elite receiving focal point**
   - high RP4/RP8, TPRR, target share, red-zone role;
   - strong RR and TE;
   - high Weekly and ROS EFO;
   - high confidence.

2. **Blocking-heavy starter**
   - high snap share, modest route participation, low target volume;
   - durable football role but weak receiving projection;
   - proves snaps are not routes.

3. **Red-zone touchdown specialist**
   - modest routes/targets, strong red-zone/end-zone rates;
   - elevated TD dependence and volatility;
   - cannot become elite through TD opportunity alone.

4. **Low-route high-TPRR player**
   - TE component exceeds RR;
   - expected target ceiling remains route-constrained;
   - promotion flag may create upside and volatility.

5. **Young breakout candidate**
   - low career routes, improving RP, receiving-prospect prior;
   - strong AD, lower confidence, higher volatility.

6. **Committee/two-TE player**
   - moderate RP, another receiving TE, high competition;
   - capped durability and meaningful uncertainty.

7. **Aging productive veteran**
   - strong current role and high confidence;
   - Weekly/ROS remain strong;
   - Three-Year and Dynasty composites fall through AD/RD weighting.

8. **Injury-return player**
   - nonzero Pactive, ramp below 1;
   - lower Weekly EFO;
   - first-game-only ramp in ROS;
   - elevated volatility.

9. **Out player**
   - AV and Pactive zero;
   - Weekly and ROS EFO zero.

10. **Missing-data player**
    - multiple documented fallbacks;
    - `PARTIAL`, LOW confidence, finite output, no silent zeros.

### 26.16.7 Required paired invariant fixture

Create two otherwise identical fictional TEs:

```text
Player A: Snap4 = 0.82, RP4 = 0.78
Player B: Snap4 = 0.82, RP4 = 0.52
```

Keep team dropbacks, TPRR, availability, ramp, scoring, references, and every other input equal. Evaluate both with `selected_horizon = WEEKLY`.

The test passes only when all conditions hold before serialization:

```text
A.expected_routes >= B.expected_routes × 1.40
A.expected_targets >= B.expected_targets × 1.40
A.weekly_expected_fantasy_points >= B.weekly_expected_fantasy_points × 1.40
A.RR > B.RR
```

Because expected routes and targets are linear in RP4 when all else is equal, the first two ratios should equal `0.78 / 0.52 = 1.50` within floating-point tolerance. Weekly EFO should also equal that ratio because catch, yardage, TD-rate, availability, ramp, and scoring inputs are held constant. Use relative tolerance `1e-9` for the expected `1.50` ratios. RR must be strictly higher for Player A; no fixed RR-point gap is required because percentile spacing depends on the bundled reference array. This paired test is mandatory even if an eleventh standalone fixture is not stored.

### 26.16.8 Golden-output policy

- Save complete outputs as versioned JSON fixtures.
- Golden outputs are generated by the approved implementation after all formula tests pass.
- Do not hand-edit expected values.
- Any intentional formula or constant change requires a new `model_version` and regenerated goldens.
- A reference-array-only change requires a new `reference_version`; regenerate goldens and document whether `model_version` also changes.

## 26.16.9 Binding cold-session completeness assertions

Before implementation approval, verify mechanically or by review that:

1. every symbol used by a formula is defined earlier in Section 26;
2. every numeric threshold, cap, weight, prior, and penalty is stated numerically;
3. each nullable input has exactly one canonical fallback path;
4. each used fallback creates one log entry, one listed confidence penalty, and `PARTIAL` status;
5. no fallback re-use creates a second log or penalty;
6. `blocking_heavy_role` is the only Boolean blocking gate;
7. `competition_pressure` is consumed only by TC, RD, volatility, and explanations;
8. the touchdown chain contains only the factors declared in Section 26.10.2;
9. all five horizon rows sum to `1.00`;
10. `Pactive` is applied once to Weekly fantasy points and not to conditional football statistics;
11. workload ramp affects Weekly conditional statistics and only the first expected active ROS game;
12. selected horizon changes explanation weighting only;
13. full-precision calculations precede serialization and label derivation;
14. every returned output field is defined in Section 26.15 and populated deterministically.

A failed assertion is a specification or implementation defect, not permission for developer interpretation.

### 26.16.10 Implementation-Equivalence Tests

The following tests are mandatory:

1. Omitting runtime references uses the exact bundled reference arrays and exact bundled `reference_version`.
2. A missing or invalid bundled reference object causes a fatal configuration error.
3. A missing distribution in an explicitly supplied runtime reference object produces percentile `50`, one confidence penalty, one log entry, and `PARTIAL`.
4. An even-length reference distribution uses the arithmetic mean of its two central sorted values.
5. Reference-median calculation does not mutate the input array.
6. Percentile ties use strict numeric equality.
7. RP4 and RP8 mutual fallbacks use original values and cannot form a fallback chain.
8. Target-share fallback uses `shrunk_TPRR`.
9. Target-share fallback never uses unshrunk canonical TPRR.
10. Supplied workload ramp below `0` clamps to `0`.
11. Supplied workload ramp above `1` clamps to `1`.
12. Workload-ramp clamping does not cause `PARTIAL` or a confidence penalty.
13. Negative projection and volume inputs covered by validation are rejected.
14. Fallback-log field values, fallback codes, penalties, uniqueness, and order match the binding table.
15. Confidence-penalty codes, uniqueness, and order match the binding specification.
16. Output includes resolved scoring and selected horizon.
17. Identity and version strings are trimmed before serialization.
18. Complete-output golden fixtures compare every serialized field, including metadata, logs, penalties, and explanations.
19. Two evaluations with byte-equivalent normalized inputs, model version, scoring, horizon, and references produce byte-equivalent serialized output.
20. Changing only `selected_horizon` may change explanation selection or ordering but must not change components, composites, Weekly EFO, ROS EFO, confidence, or volatility.
21. The bundled `TE_MVP_V1_REFERENCE_DISTRIBUTIONS` object contains all 16 named arrays.
22. Every bundled reference array is non-empty and every contained value is finite.
23. Every bundled reference array is sorted in ascending numeric order, allowing equal adjacent values.
24. Every bundled reference value falls within the declared domain and uses the declared metric unit.
25. The bundled outer object and every nested reference array are immutable at runtime; attempted mutation cannot change any stored value.
26. Omitting `options.reference_distributions` uses the bundled object without copying, regenerating, or altering its values.
27. A valid explicitly supplied custom reference object overrides the corresponding bundled distributions for that evaluation.
28. Complete golden-fixture outputs remain deterministic when evaluated against `TE_REFERENCE_V1`.

## 26.17 Deferred features and accepted Version 1 limitations

Deferred:

1. live data adapters;
2. automated reference refresh;
3. paid route/alignment/pass-blocking data;
4. opponent matchup adjustment;
5. fitted touchdown and catch models;
6. Monte Carlo distributions and quantiles;
7. scheduled return and multi-week recovery models;
8. explicit role-state transition models;
9. multi-year EFO;
10. historical replay and backtesting;
11. shared utility, scarcity, premium-format, and market layers.

Accepted Version 1 limitations:

- public route data may require a penalized snap proxy;
- competition pressure and QB environment are normalized upstream inputs;
- target-quality and touchdown constants are provisional and unfitted;
- ROS assumes one reduced active game followed by full workload;
- inactive-list players receive zero ROS output;
- fixed reference arrays require explicit version control;
- blocking role is represented by a snap-route gap, not a true blocking grade;
- no long-term fantasy-point totals are fabricated.

---

## Implementation-Readiness Summary

1. **TE-specific design choices:** route participation is the primary gate; snap-route gap represents blocking-heavy deployment; target earning is separated from target quality; red-zone/end-zone access drives touchdown expectation; TE development uses a later curve; competition and two-TE roles affect durability and volatility.
2. **Shared WR/RB conventions reused:** one public entry point, eight components, five horizons, exact mid-rank percentiles, versioned references, deterministic fallbacks, one-time penalties, `OK`/`PARTIAL`, confidence/volatility labels, conditional Weekly stats, one-time `Pactive`, recovery-aware ROS, deterministic explanation merge, fixture-driven goldens.
3. **Deferred features:** live/paid data, alignment and pass-blocking charting, fitted models, simulation, scheduled returns, multi-year EFO, scarcity, TE premium, market and trade layers.
4. **Unresolved ambiguity:** no implementation-blocking ambiguity remains. Provisional constants require later calibration but are fully specified for Version 1.
5. **Verdict:** **PASS — READY FOR TE SPECIFICATION REVIEW**

*End of `TE_VALUATION_MODEL.md` — practical hobby MVP contract.*
