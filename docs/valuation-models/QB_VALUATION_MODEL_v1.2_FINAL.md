# QB VALUATION MODEL — VERSION 1.2 FINAL

**File:** `QB_VALUATION_MODEL_v1.2_FINAL.md`  
**Position:** Quarterback (QB)  
**Platform:** PlayerTicker  
**Specification status:** Final Version 1.2 implementation contract  
**Model version:** `qb-mvp-1.2`  
**Schema version:** `qb-mvp-input-1.0` / `qb-mvp-output-1.0`  
**Reference version:** `QB_REFERENCE_V1`  

---

# 1. Purpose and Authority

This document defines the Quarterback valuation model for PlayerTicker.

The model belongs to the same platform architecture established by `MARKET_MODEL_FOUNDATION_V2.md` and follows the implementation discipline established by the completed WR, RB, and TE position specifications. Those documents establish precedent for deterministic evaluation, explicit fallbacks, confidence, volatility, explanations, reference distributions, golden fixtures, serialization, and testing.

They do **not** determine QB football logic.

The QB model is position-specific. It is designed around the fact that quarterback fantasy value can arise from materially different pathways:

- elite passing quality;
- high passing volume;
- elite rushing;
- designed rushing and goal-line usage;
- stable long-term starting control;
- developmental upside;
- favorable offensive environment;
- or combinations of those factors.

The model must preserve the distinction between:

1. passing quality;
2. fantasy opportunity;
3. rushing value;
4. starting-role security;
5. availability;
6. production sustainability;
7. long-term age and developmental value.

This is a specification, not an implementation.

---

# 2. Foundation Compatibility

The QB model follows the PlayerTicker Foundation rules:

- intrinsic football evaluation is isolated from market price, ADP, trade calculators, consensus ranks, and platform popularity;
- confidence measures evidence reliability, not player quality;
- volatility measures plausible value instability, not simply lack of confidence;
- all five horizons are evaluated separately;
- explanations describe model drivers and must not claim unsupported causality;
- missing data is explicit;
- point-in-time inputs must not use future information;
- deterministic Version 1 behavior is preferred over opaque sophistication;
- provisional constants must be versioned and replaceable;
- current fantasy output is not itself the complete definition of intrinsic value.

The QB engine produces a **fundamental position utility estimate**. Market-price construction and mispricing classification remain downstream platform concerns.

---

# 3. Version 1 Scope

Version 1 must be:

- deterministic;
- transparent;
- fixture-driven;
- practical for a hobby MVP;
- implementable from normalized public or derivable football data;
- usable before live API integration;
- stable enough for golden testing.

Version 1 does **not** require:

- proprietary tracking data;
- manual scouting grades;
- machine learning;
- opponent-specific matchup modeling;
- pressure-by-pressure charting;
- film grades;
- contract-value databases;
- market price;
- ADP;
- trade value;
- consensus rankings;
- Monte Carlo simulation;
- multi-year fantasy-point simulation;
- automatic play-by-play ingestion.

Where a useful signal is difficult to obtain reliably, Version 1 uses a documented proxy or excludes it.

---

# 4. QB Value Thesis

A quarterback's fantasy value is modeled as the interaction of eight independent but related dimensions:

1. **Passing Opportunity — PO**  
   How much legitimate passing workload the quarterback controls.

2. **Passing Quality — PQ**  
   How effectively and sustainably the quarterback converts passing opportunities.

3. **Rushing Value — RV**  
   The quarterback's fantasy-relevant rushing floor and ceiling, distinguishing designed use, scrambling, and goal-line use.

4. **Scoring Environment — SE**  
   The offensive environment that supports passing and total touchdown production.

5. **Role Security — RS**  
   The probability and durability of retaining a starting job, with horizon-specific consequences.

6. **Availability — AV**  
   Current probability of playing and broader availability risk.

7. **Age & Development — AD**  
   QB-specific career-stage value, developmental runway, draft investment, and long-horizon aging.

8. **Sustainability — SU**  
   The degree to which current production is supported by stable passing, turnover, sack, and sample evidence rather than fragile rates.

These components are not interchangeable.

A quarterback may score highly in RV and poorly in PQ.  
A quarterback may score highly in PQ and only moderately in RV.  
A temporary starter may score well in PO for the current week and poorly in RS.  
A rookie may score modestly in current production while retaining meaningful AD.  
A veteran may remain elite in PQ while declining in AD.

No component may be silently substituted for another.

---

# 5. QB Archetype Requirements

The model must behave sensibly for:

1. elite dual-threat quarterback;
2. elite pocket passer;
3. high-volume inefficient starter;
4. low-volume game manager;
5. rushing-dependent quarterback;
6. volatile young starter;
7. young breakout candidate;
8. rookie with little or no NFL sample;
9. veteran in decline;
10. bridge quarterback;
11. temporary injury-replacement starter;
12. quarterback facing legitimate competition or benching risk;
13. injury-return quarterback;
14. backup with little current starting value.

The model must not require all valuable QBs to score highly through the same component path.

---

# 6. Signal Selection and Anti-Double-Counting Rules

## 6.1 Passing volume

Passing volume is represented primarily by:

- expected active-game pass attempts;
- team dropback share;
- recent start rate.

Passing attempts are not also used as a direct Passing Quality input.

## 6.2 Passing quality

Passing Quality uses:

- adjusted yards per attempt;
- completion percentage over expectation when available, otherwise completion rate with an explicit fallback;
- explosive pass rate.

Touchdown rate is excluded from PQ to avoid duplicating the scoring signal used in EFO and Sustainability.

## 6.3 Turnovers and sacks

Interception rate and sack rate are used in Sustainability, not Passing Quality. This prevents the same efficiency weakness from being repeatedly penalized.

## 6.4 Rushing

Rushing Value distinguishes:

- designed rush attempts;
- scrambles;
- rushing yards;
- rushing touchdowns;
- goal-line rush attempts.

Designed rushing receives greater stability weight than scrambling. Goal-line rushing receives explicit ceiling weight. Rushing touchdowns affect EFO directly and are not separately added to RV as raw fantasy points.

## 6.5 Role security

Role Security affects horizon composites. It does **not** multiply EFO.

Weekly EFO uses `probability_active` and active-game workload. A temporary starter therefore can have legitimate current-week EFO without receiving artificial long-term security.

## 6.6 Availability

Availability affects:

- Weekly EFO through `probability_active`;
- ROS EFO through the defined recovery-aware availability schedule;
- horizon composites through AV.

The same probability is never multiplied into a horizon composite.

## 6.7 Age

Age affects AD only. Age is not separately subtracted from other components or EFO.

---

# 7. Practical Data Philosophy

The canonical input interface is normalized. The engine does not care which public source supplied a field.

Realistic Version 1 source classes include:

- box scores;
- play-by-play-derived passing and rushing splits;
- public depth charts;
- injury designations;
- draft round;
- age;
- team-level offensive rates;
- manually maintained but objective role-status flags.

The following are optional:

- CPOE;
- pressure rate;
- designed-rush classification;
- goal-line rush classification.

Every optional field has a deterministic fallback.

---

# 8. Sample-Size Shrinkage Philosophy

Small samples must not be treated as stable truth.

For any shrinkable metric:

`shrunk = w * observed + (1 - w) * prior`

where:

`w = sample / (sample + k)`

The sample and `k` are metric-specific.

Priors are QB-specific and deterministic.

Shrinkage is applied before percentile conversion.

Rookies and low-sample players may still receive high values when priors, role investment, and athletic/rushing evidence support them, but their confidence remains lower.

---

# 9. Age and Career-Stage Philosophy

Quarterback aging differs materially from RB, WR, and TE aging.

Version 1 reflects:

- meaningful development during early career stages;
- high uncertainty before NFL evidence accumulates;
- broad prime stability through the late 20s and early 30s;
- gradual rather than abrupt veteran decline;
- increased long-horizon availability and role fragility in the late 30s;
- preservation of elite current production regardless of age.

Age does not directly suppress Weekly or ROS passing production. Its primary effect is through AD and long-horizon weights.

---

# 10. Horizon Philosophy

## Weekly

Prioritizes:

- current opportunity;
- current active probability;
- current passing ability;
- rushing floor and ceiling;
- immediate scoring environment.

Role security matters only modestly because a temporary starter can still be useful this week.

## Rest of Season

Increases:

- role security;
- sustainability;
- availability;
- stable opportunity.

## One-Year

Balances:

- current ability;
- role control;
- sustainability;
- development;
- offensive environment.

## Three-Year

Increases:

- age and development;
- durable starting-role value;
- sustainable passing quality.

## Dynasty

Places the greatest weight on:

- age and development;
- durable role security;
- sustainable passing quality;
- transferable rushing value.

---

# 11. Expected Fantasy Output Philosophy

Expected Fantasy Output (EFO) is separate from the component composite.

Components answer:

> How strong is the quarterback's underlying position-specific utility?

EFO answers:

> How many fantasy points should this quarterback be expected to score under the specified scoring rules and availability assumptions?

EFO is calculated from expected statistics, never from component scores.

Version 1 returns:

- conditional-on-active Weekly expected statistics;
- unconditional Weekly EFO;
- recovery-aware ROS EFO.

It does not return One-Year, Three-Year, or Dynasty fantasy-point totals.

---

# 12. Confidence Philosophy

Confidence is evidence reliability.

It is based on:

- career pass attempts;
- career starts;
- recent pass attempts;
- rushing sample;
- missing-data fallbacks;
- role uncertainty;
- rookie status;
- team/system change;
- injury-return uncertainty.

Confidence does not reward good players.

---

# 13. Volatility Philosophy

Volatility measures instability of expected value.

It may rise because of:

- unstable role;
- competition;
- temporary-starter status;
- small sample;
- rushing dependence;
- interception risk;
- unstable passing efficiency;
- injury uncertainty;
- major role or system changes;
- young-QB uncertainty.

Volatility is not `100 - confidence`.

---

# 14. Explanation Philosophy

Explanations must be deterministic and tied to actual model calculations.

They may describe:

- strong or weak components;
- material role-security effects;
- availability effects on EFO;
- major rushing dependence;
- fallback-heavy uncertainty.

They must not claim:

- causal medical conclusions;
- hidden team intent;
- certainty about benching;
- certainty about future development;
- market mispricing.

---

# 15. Version 1 Limitations

Version 1 intentionally does not model:

- opponent matchup;
- weather;
- play-caller quality as a subjective grade;
- individual receiver grades;
- offensive-line player grades;
- pressure performance splits;
- EPA as a required input;
- air yards as a required input;
- contract guarantees;
- proprietary charting.

`offensive_environment_score` and `protection_context_score` are normalized upstream context inputs with exact fallback behavior.

---

# 16. Validation Priorities

The model should later be evaluated against:

- next-week fantasy points;
- rest-of-season fantasy points per active game;
- future start retention;
- multi-year starter persistence;
- archetype consistency;
- calibration of role-security bands;
- stability under small input perturbations.

Version 1 constants are engineering priors, not scientifically fitted coefficients.

---

# 17. Failure Modes and Mitigations

| Failure mode | Mitigation |
|---|---|
| Recent fantasy points dominate | Separate components from EFO |
| Rushing QB unfairly penalized for nontraditional production | Explicit RV component and rushing EFO |
| Rushing hides unusable passing | PQ, SU, and RS remain independent |
| Temporary starter gets dynasty value from one start | Horizon-specific RS weight |
| Rookie tiny sample treated as truth | Shrinkage plus QB prior |
| Old elite QB automatically collapsed | Age isolated mainly to long horizons |
| TD spike treated as permanent skill | TD regression in EFO and SU |
| Injury counted twice | AV in composites; probability active only in EFO |
| Role security counted twice | RS in composites only |
| Missing optional metric becomes zero | Explicit fallback log |
| Confidence becomes player rating | Formula uses evidence and uncertainty only |
| Volatility becomes inverse confidence | Separate causal inputs |

---

# 18. Research-to-MVP Boundary

Sections 1–25 describe the model rationale. Section 26 is the complete and sole binding Version 1 implementation contract.

If any earlier statement conflicts with Section 26, **Section 26 governs**.

---

# 19. Future Calibration Path

After sufficient historical data exists:

1. preserve Version 1 outputs and fixtures;
2. evaluate each component and horizon against declared estimands;
3. calibrate one parameter family at a time;
4. require ablation evidence;
5. version all changed reference distributions;
6. never silently replace historical constants.

---

# 20. Update Cadence

Recommended upstream refresh:

- injury and active probability: daily and game-day;
- depth-chart and role status: when new information is available;
- recent performance windows: weekly;
- age and draft investment: static or annual;
- team context: weekly;
- reference distributions: frozen for Version 1.

The evaluator itself is stateless.

---

# 21. Point-in-Time Discipline

Every input must represent information available at `as_of`.

Historical evaluation must not use:

- later depth charts;
- later injury outcomes;
- future starts;
- future team changes;
- end-of-season statistics unavailable at the evaluation date.

---

# 22. Output Use

The QB engine output may feed:

- intrinsic-value normalization;
- PlayerTicker price construction;
- market comparison;
- explanation UI;
- confidence UI;
- volatility UI.

Those downstream systems must not feed market information back into this engine.

---

# 23. Acceptance Standard

The QB specification is acceptable only if:

- all inputs have units and validation;
- every optional input has a fallback;
- all percentile metrics have literal reference arrays;
- all formulas are deterministic;
- all horizon weights sum to 1.00;
- EFO does not duplicate AV or RS;
- confidence and volatility remain distinct;
- calculation order is explicit;
- output serialization is explicit;
- golden fixtures are reachable under the formulas;
- no implementation judgment is required.

---

# 24. Deferred Enhancements

Potential later upgrades:

- opponent-adjusted Weekly projection;
- calibrated expected completion model;
- play-action and pressure splits;
- receiver-separation context;
- offensive-line injury aggregation;
- drive-level scoring simulation;
- calibrated starter-survival model;
- contract and option-year context;
- multi-year EFO simulation.

None are required for Version 1.

---

# 25. Final Design Review

The Version 1 design intentionally uses eight components.

The architecture separates:

- volume from quality;
- rushing from passing;
- environment from player skill;
- role security from availability;
- current production from sustainability;
- age/development from current-week usefulness.

The most important QB-specific design choice is that **Role Security is a first-class component with sharply increasing long-horizon weight**, while a temporary starter can still retain legitimate Weekly EFO.

The second is that **rushing is explicitly decomposed into designed rushing, scrambling, and goal-line usage**, rather than represented only by rushing yards.

The third is that **touchdown production is regressed for EFO and Sustainability instead of being allowed to dominate Passing Quality**.

---

# 26. PRACTICAL HOBBY MVP IMPLEMENTATION CONTRACT

## 26.0 Authority and implementation boundary

This section is the complete and sole binding Version 1 specification for the first coded QB MVP.

If Sections 1–25 conflict with Section 26, **Section 26 governs**.

A developer must be able to implement Version 1 using only this section.

The engine is deterministic, transparent, fixture-driven, free of market inputs, and compatible with the shared PlayerTicker position-model architecture.

Version 1 does **not** require live data, proprietary tracking data, opponent modeling, Monte Carlo, machine learning, market price, ADP, trade value, or multi-year fantasy-point simulation.

---

## 26.1 Public engine API and exact deliverables

```ts
type QBHorizon = "WEEKLY" | "ROS" | "ONE_YEAR" | "THREE_YEAR" | "DYNASTY";

interface QBEvaluatorOptions {
  selected_horizon?: QBHorizon;
  scoring?: Partial<QBScoring>;
  reference_distributions?: QBReferenceDistributions;
  model_version?: string;
  generated_at?: string;
}

function evaluateQuarterback(
  input: QBMVPInput,
  options?: QBEvaluatorOptions
): QBMVPOutput
```

Defaults:

```text
selected_horizon = WEEKLY
scoring = QB_DEFAULT_SCORING
reference_distributions = QB_MVP_V1_REFERENCE_DISTRIBUTIONS
model_version = "qb-mvp-1.2"
generated_at = current UTC time from the production clock
```

Runtime option validation is mandatory:

- `options`, when supplied, must be a non-null object and not an array;
- unknown top-level option keys are rejected;
- `selected_horizon`, when supplied, must exactly equal one declared `QBHorizon`; invalid supplied values are rejected and never defaulted;
- `model_version`, when supplied, must be a string whose value after trimming has length at least `1`; the trimmed value is emitted; arbitrary non-empty version strings are permitted for controlled forks;
- `generated_at`, when supplied, must satisfy the timestamp contract in §26.2.3 and is canonicalized to UTC;
- `scoring`, when supplied, must be a non-null object and not an array; unknown scoring keys are rejected;
- `reference_distributions`, when supplied, is validated by §26.4.3 and causes output `reference_version = "CUSTOM"` solely because the option was supplied.

The selected horizon controls explanation weighting only. All five composites are always returned.

The engine returns:

1. eight component scores from `0` to `100`;
2. five horizon composites;
3. conditional-on-active Weekly passing and rushing expectations;
4. unconditional Weekly EFO;
5. recovery-aware ROS EFO;
6. confidence score, label, and penalty codes;
7. volatility score, label, and dependence metrics;
8. up to three positive and three negative explanations;
9. de-duplicated fallback log and status;
10. schema, model, reference, player, scoring, and timestamp metadata.

---

## 26.2 Canonical units, validation, scoring, and serialization

### 26.2.1 Canonical units

- Rates, shares, and probabilities are decimals from `0.00` to `1.00`.
- Components, composites, confidence, volatility, and normalized context scores are `0` to `100`.
- Counts, yards, touchdowns, and fantasy points may be fractional expectations.
- `expected_games_remaining` and `expected_games_limited` are fractional expected counts and are not integer metadata.
- `age` is years.
- `career_pass_attempts`, `career_starts`, and sample counts are non-negative counts.
- `expected_games_remaining` includes the selected upcoming game when applicable.
- Keep full precision internally.
- Never silently convert missing numeric values to zero.
- Clamp only where this contract explicitly requires it.
- EFO is never derived from a component or composite.

### 26.2.2 Utility functions

```text
clamp(x, lo, hi) = min(max(x, lo), hi)

weightedMean(values, weights) =
  sum(values[i] * weights[i]) / sum(weights[i])

round1(x) =
  round half away from zero to one decimal place

round3(x) =
  round half away from zero to three decimal places
```

All comparisons for labels and explanations use **unrounded** values.

### 26.2.3 Input and timestamp validation

Reject the input with an error if any of the following is true:

- required field is missing;
- an unknown input property is supplied;
- any provided numeric field is `NaN`, infinite, or not a number;
- `player_id`, `player_name`, or `as_of` is not a string, or `player_id`/`player_name` is empty after trimming;
- `team` is neither `null` nor a string;
- `as_of` is not a valid ISO-8601 timestamp containing explicit timezone information (`Z` or a numeric UTC offset);
- `age < 20` or `age > 50`;
- `nfl_seasons_completed < 0`;
- `draft_round` is not `1..7` or `null`;
- any count is negative;
- any rate/share/probability is outside `[0,1]`;
- any `0..100` score is outside `[0,100]`;
- `career_starts > career_games_played`;
- `recent_starts > recent_games`;
- `recent_completions > recent_pass_attempts`;
- `recent_passing_tds > recent_pass_attempts`;
- `recent_interceptions > recent_pass_attempts`;
- `recent_passing_tds + recent_interceptions > recent_pass_attempts`;
- `goal_line_rush_attempts != null` and `goal_line_rush_attempts > recent_rush_attempts`;
- `designed_rush_attempts != null` and `designed_rush_attempts > recent_rush_attempts`;
- `scrambles != null` and `scrambles > recent_rush_attempts`;
- both `designed_rush_attempts` and `scrambles` are supplied and their sum exceeds `recent_rush_attempts`;
- `expected_active_game_goal_line_rush_attempts != null`, both expected designed rushes and expected scrambles are supplied, and goal-line attempts exceed their sum;
- `recent_pass_attempts > 1000`;
- `expected_games_remaining < 0` or `> 21`;
- `expected_games_limited != null` and `expected_games_limited > expected_games_remaining`;
- `depth_chart_status`, `role_status`, or `injury_status` is outside its enum;
- `team_change`, `major_system_change`, or `recent_role_change` is not boolean;
- `injury_status` is `OUT`, `IR`, or `PUP` while supplied `probability_active > 0`.

Negative passing yards and negative rushing yards are permitted because a valid real-game or short-window sample can be negative. All denominators and rate calculations remain governed by the explicit formulas and clamps in this contract.

Timestamp normalization:

```text
canonicalTimestamp(value) = new Date(value).toISOString()
```

The evaluator emits `player.as_of = canonicalTimestamp(input.as_of)`. It does not echo the original lexical form. Invalid or timezone-free timestamps are rejected before calculation.

Do not silently clamp invalid raw input.

### 26.2.4 Default scoring

```ts
interface QBScoring {
  points_per_completion: number;
  points_per_passing_yard: number;
  points_per_passing_td: number;
  points_per_interception: number;
  points_per_rushing_yard: number;
  points_per_rushing_td: number;
}

const QB_DEFAULT_SCORING: QBScoring = {
  points_per_completion: 0,
  points_per_passing_yard: 0.04,
  points_per_passing_td: 4,
  points_per_interception: -2,
  points_per_rushing_yard: 0.1,
  points_per_rushing_td: 6
};
```

Scoring overrides:

- may override any subset;
- must be a plain non-null object;
- reject unknown keys;
- missing keys use defaults;
- all values must be finite;
- `points_per_completion` must be in `[0,1]`;
- `points_per_passing_yard` must be in `[0,0.2]`;
- `points_per_passing_td` must be in `[0,10]`;
- `points_per_interception` must be in `[-10,0]`;
- `points_per_rushing_yard` must be in `[0,0.5]`;
- `points_per_rushing_td` must be in `[0,10]`.

### 26.2.5 Canonical JSON serialization and labels

The authoritative golden representation is the UTF-8 text returned by `canonicalSerializeQBOutput(output)` below. Output values remain JSON numbers; numeric strings are prohibited.

Canonical rules:

- construct the output object in exactly the key order declared in §26.15, including every required property;
- nested object key order is the order declared in §26.15 and `QBScoring` in §26.2.4;
- unknown output properties are rejected before serialization;
- arrays preserve their contract-defined order; fallback and penalty arrays are de-duplicated then lexically sorted, while explanation arrays preserve ranked order;
- round each numeric output to its declared precision before serialization using `round1` or `round3`;
- normalize negative zero to positive zero after rounding;
- trailing zeros are not significant and are not preserved (`70.0` serializes as `70`);
- `null` and booleans use standard JSON tokens;
- strings use standard `JSON.stringify` escaping;
- timestamps are canonical ISO-8601 UTC strings equivalent to `Date.toISOString()`;
- `NaN`, positive infinity, negative infinity, `undefined`, functions, symbols, and bigint values are prohibited;
- exponent notation is prohibited. This model's bounded outputs do not require exponent notation; the serializer must reject a number whose JSON token contains `e` or `E`;
- no insignificant whitespace is emitted.

Authoritative TypeScript reference:

```ts
function normalizeNumber(value: number, decimals: 1 | 3): number {
  if (!Number.isFinite(value)) throw new Error("NON_FINITE_OUTPUT");
  const rounded = decimals === 1 ? round1(value) : round3(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonicalSerializeQBOutput(output: QBMVPOutput): string {
  assertExactQBOutputShape(output);

  const canonical = {
    schema_version: output.schema_version,
    model_version: output.model_version,
    reference_version: output.reference_version,
    generated_at: canonicalTimestamp(output.generated_at),
    player: {
      player_id: output.player.player_id,
      player_name: output.player.player_name,
      team: output.player.team,
      as_of: canonicalTimestamp(output.player.as_of)
    },
    scoring: {
      points_per_completion: normalizeNumber(output.scoring.points_per_completion, 3),
      points_per_passing_yard: normalizeNumber(output.scoring.points_per_passing_yard, 3),
      points_per_passing_td: normalizeNumber(output.scoring.points_per_passing_td, 3),
      points_per_interception: normalizeNumber(output.scoring.points_per_interception, 3),
      points_per_rushing_yard: normalizeNumber(output.scoring.points_per_rushing_yard, 3),
      points_per_rushing_td: normalizeNumber(output.scoring.points_per_rushing_td, 3)
    },
    status: output.status,
    fallback_log: lexicalSort(unique(output.fallback_log)),
    components: {
      passing_opportunity: normalizeNumber(output.components.passing_opportunity, 1),
      passing_quality: normalizeNumber(output.components.passing_quality, 1),
      rushing_value: normalizeNumber(output.components.rushing_value, 1),
      scoring_environment: normalizeNumber(output.components.scoring_environment, 1),
      role_security: normalizeNumber(output.components.role_security, 1),
      availability: normalizeNumber(output.components.availability, 1),
      age_development: normalizeNumber(output.components.age_development, 1),
      sustainability: normalizeNumber(output.components.sustainability, 1)
    },
    composites: {
      weekly: normalizeNumber(output.composites.weekly, 1),
      ros: normalizeNumber(output.composites.ros, 1),
      one_year: normalizeNumber(output.composites.one_year, 1),
      three_year: normalizeNumber(output.composites.three_year, 1),
      dynasty: normalizeNumber(output.composites.dynasty, 1)
    },
    expected_fantasy_output: {
      conditional_on_active: {
        pass_attempts: normalizeNumber(output.expected_fantasy_output.conditional_on_active.pass_attempts, 1),
        completions: normalizeNumber(output.expected_fantasy_output.conditional_on_active.completions, 1),
        completion_rate: normalizeNumber(output.expected_fantasy_output.conditional_on_active.completion_rate, 3),
        passing_yards: normalizeNumber(output.expected_fantasy_output.conditional_on_active.passing_yards, 1),
        passing_tds: normalizeNumber(output.expected_fantasy_output.conditional_on_active.passing_tds, 1),
        interceptions: normalizeNumber(output.expected_fantasy_output.conditional_on_active.interceptions, 1),
        designed_rush_attempts: normalizeNumber(output.expected_fantasy_output.conditional_on_active.designed_rush_attempts, 1),
        scrambles: normalizeNumber(output.expected_fantasy_output.conditional_on_active.scrambles, 1),
        total_rush_attempts: normalizeNumber(output.expected_fantasy_output.conditional_on_active.total_rush_attempts, 1),
        rushing_yards: normalizeNumber(output.expected_fantasy_output.conditional_on_active.rushing_yards, 1),
        rushing_tds: normalizeNumber(output.expected_fantasy_output.conditional_on_active.rushing_tds, 1),
        fantasy_points: normalizeNumber(output.expected_fantasy_output.conditional_on_active.fantasy_points, 1)
      },
      probability_active: normalizeNumber(output.expected_fantasy_output.probability_active, 1),
      weekly_fantasy_points: normalizeNumber(output.expected_fantasy_output.weekly_fantasy_points, 1),
      ros_fantasy_points: normalizeNumber(output.expected_fantasy_output.ros_fantasy_points, 1),
      expected_games_remaining: normalizeNumber(output.expected_fantasy_output.expected_games_remaining, 1),
      expected_games_limited: normalizeNumber(output.expected_fantasy_output.expected_games_limited, 1)
    },
    confidence: {
      score: normalizeNumber(output.confidence.score, 1),
      label: output.confidence.label,
      penalty_codes: lexicalSort(unique(output.confidence.penalty_codes))
    },
    volatility: {
      score: normalizeNumber(output.volatility.score, 1),
      label: output.volatility.label,
      rushing_dependence: normalizeNumber(output.volatility.rushing_dependence, 1),
      turnover_risk: normalizeNumber(output.volatility.turnover_risk, 1),
      role_instability: normalizeNumber(output.volatility.role_instability, 1)
    },
    explanations: {
      positive: [...output.explanations.positive],
      negative: [...output.explanations.negative]
    }
  } satisfies QBMVPOutput;

  const json = JSON.stringify(canonical);
  if (/(^|[\[,:])-?\d+(?:\.\d+)?[eE][+-]?\d+/.test(json)) {
    throw new Error("EXPONENT_NOTATION_PROHIBITED");
  }
  return json;
}
```

`assertExactQBOutputShape` must recursively reject missing or unknown properties and prohibited values. Key order is determined exclusively by construction of the fresh `canonical` object shown above; the caller's insertion order is irrelevant.

Precision assignment:

- components, composites, confidence, volatility, dependence metrics, probability active, fantasy outputs, and expected counting statistics: one decimal place before JSON serialization;
- rates in expected-stat output and all six serialized scoring values: three decimal places before JSON serialization;
- `expected_games_remaining` and `expected_games_limited` are serialized to one decimal-place precision because they are expected counts;
- no integer metadata count is present in `QBMVPOutput`; if one is added in a later schema, its precision must be specified explicitly;
- calculations use full precision until canonical-object construction inside `canonicalSerializeQBOutput`.

Labels:

```text
confidence:
  [0,40)   = "LOW"
  [40,70)  = "MEDIUM"
  [70,100] = "HIGH"

volatility:
  [0,35)   = "LOW"
  [35,65)  = "MEDIUM"
  [65,100] = "HIGH"
```

---

## 26.3 Exact input interface and definitions

```ts
type QBDepthChartStatus =
  | "STARTER"
  | "CO_STARTER"
  | "BACKUP"
  | "PRACTICE_SQUAD"
  | "FREE_AGENT";

type QBRoleStatus =
  | "ESTABLISHED_STARTER"
  | "YOUNG_COMMITTED_STARTER"
  | "ROOKIE_EXPECTED_STARTER"
  | "BRIDGE_STARTER"
  | "TEMPORARY_INJURY_REPLACEMENT"
  | "COMPETITION"
  | "RECENTLY_BENCHED"
  | "BACKUP";

type QBInjuryStatus =
  | "HEALTHY"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "PUP";

interface QBMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  as_of: string;

  age: number;
  nfl_seasons_completed: number;
  draft_round: 1|2|3|4|5|6|7|null;

  career_games_played: number;
  career_starts: number;
  career_pass_attempts: number;
  career_rush_attempts: number;

  recent_games: number;
  recent_starts: number;
  recent_pass_attempts: number;
  recent_completions: number;
  recent_passing_yards: number;
  recent_passing_tds: number;
  recent_interceptions: number;
  recent_sacks: number;

  recent_rush_attempts: number;
  recent_rushing_yards: number;
  recent_rushing_tds: number;

  designed_rush_attempts: number | null;
  scrambles: number | null;
  goal_line_rush_attempts: number | null;

  adjusted_yards_per_attempt: number | null;
  completion_percentage_over_expected: number | null;
  explosive_pass_rate: number | null;

  team_dropback_share: number | null;
  expected_active_game_pass_attempts: number | null;
  expected_active_game_designed_rush_attempts: number | null;
  expected_active_game_scrambles: number | null;
  expected_active_game_goal_line_rush_attempts: number | null;

  offensive_environment_score: number | null;
  protection_context_score: number | null;

  depth_chart_status: QBDepthChartStatus;
  role_status: QBRoleStatus;
  competition_pressure: number | null;
  organizational_commitment: number | null;

  probability_active: number | null;
  injury_status: QBInjuryStatus;
  expected_games_remaining: number;
  expected_games_limited: number | null;

  team_change: boolean;
  major_system_change: boolean;
  recent_role_change: boolean;

  prior_recent_pass_attempts: number | null;
  prior_adjusted_yards_per_attempt: number | null;
  prior_interception_rate: number | null;
  prior_rush_attempts_per_start: number | null;
}
```

### 26.3.1 Field definitions

| Field | Unit | Definition |
|---|---:|---|
| `career_games_played` | games | NFL regular-season games appeared |
| `career_starts` | starts | NFL regular-season starts |
| `career_pass_attempts` | attempts | career regular-season pass attempts |
| `career_rush_attempts` | attempts | career official QB rush attempts |
| `recent_games` | games | most recent contiguous evaluation window, maximum 8 games |
| `recent_starts` | starts | starts inside `recent_games` |
| `recent_pass_attempts` | attempts | pass attempts in the same recent window |
| `recent_completions` | completions | completions in the same window |
| `recent_passing_yards` | yards | passing yards in the same window |
| `recent_passing_tds` | TD | passing TDs in the same window |
| `recent_interceptions` | INT | interceptions in the same window |
| `recent_sacks` | sacks | sacks taken in the same window |
| `recent_rush_attempts` | attempts | official QB rush attempts in the same window |
| `recent_rushing_yards` | yards | official rushing yards in the same window |
| `recent_rushing_tds` | TD | rushing TDs in the same window |
| `designed_rush_attempts` | attempts | recent-window QB rushes classified as designed, excluding kneels |
| `scrambles` | attempts | recent-window pass plays converted to QB scrambles |
| `goal_line_rush_attempts` | attempts | recent-window QB rushes from opponent 5-yard line or closer |
| `adjusted_yards_per_attempt` | yards/attempt | `(passYds + 20*passTD - 45*INT) / passAttempts` over recent window or supplied stabilized window |
| `completion_percentage_over_expected` | decimal | completion rate minus expected completion rate; `0.03` means +3 percentage points |
| `explosive_pass_rate` | decimal | completions gaining at least 20 passing yards divided by pass attempts |
| `team_dropback_share` | decimal | player's dropbacks divided by team QB dropbacks while available in recent window |
| `expected_active_game_pass_attempts` | attempts/game | expected attempts if active |
| `expected_active_game_designed_rush_attempts` | attempts/game | expected designed QB rushes if active |
| `expected_active_game_scrambles` | attempts/game | expected scrambles if active |
| `expected_active_game_goal_line_rush_attempts` | attempts/game | expected goal-line QB rushes if active |
| `offensive_environment_score` | 0–100 | upstream objective composite of team scoring and passing environment |
| `protection_context_score` | 0–100 | upstream objective protection context; 50 is neutral |
| `competition_pressure` | 0–1 | objective normalized current competition/benching pressure |
| `organizational_commitment` | 0–1 | normalized commitment based on draft investment and declared role status |
| `probability_active` | 0–1 | probability player is active and available for meaningful QB snaps in next game |
| `expected_games_limited` | games | expected games in ROS window with material workload limitation |
| `prior_*` | declared unit | immediately preceding non-overlapping window matching the current recent-window length where possible |

### 26.3.2 Window rules

- `recent_games` must be `0..8`.
- All `recent_*` box-score fields use exactly the same window.
- If fewer than 8 games exist, use all available games.
- Prior-window fields must not overlap the recent window.
- If a prior window does not exist, the prior field is `null`.
- Kneel-down removal is preferred for designed/scramble derivation. If unavailable, use the exact fallbacks below.

---

## 26.4 Required reference distributions and exact percentile estimator

### 26.4.1 Percentile estimator

For sorted array `A` of length `n` and value `x`:

```text
if x <= A[0]: percentile = 0
else if x >= A[n-1]: percentile = 100
else:
  find i such that A[i] <= x <= A[i+1]
  if A[i+1] == A[i]:
    percentile = 100 * i / (n - 1)
  else:
    fraction = (x - A[i]) / (A[i+1] - A[i])
    percentile = 100 * (i + fraction) / (n - 1)
```

The result is clamped to `[0,100]`.

For inverse-risk metrics, use:

`inversePercentile(x, A) = 100 - percentile(x, A)`

### 26.4.2 Binding Version 1 reference object

These arrays are provisional fixture-grade Version 1 constants. They are not claimed to be scientifically calibrated.

```ts
interface QBReferenceDistributions {
  active_game_pass_attempts: readonly number[];
  team_dropback_share: readonly number[];
  adjusted_yards_per_attempt: readonly number[];
  cpoe: readonly number[];
  completion_rate: readonly number[];
  explosive_pass_rate: readonly number[];
  designed_rush_attempts_per_start: readonly number[];
  scrambles_per_start: readonly number[];
  rushing_yards_per_start: readonly number[];
  goal_line_rush_attempts_per_start: readonly number[];
  offensive_environment_score: readonly number[];
  protection_context_score: readonly number[];
  interception_rate: readonly number[];
  sack_rate: readonly number[];
  passing_td_rate: readonly number[];
  recent_start_rate: readonly number[];
}

const QB_MVP_V1_REFERENCE_DISTRIBUTIONS: QBReferenceDistributions = Object.freeze({
  active_game_pass_attempts: Object.freeze([
    20, 23, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40, 42, 45
  ]),
  team_dropback_share: Object.freeze([
    0.45, 0.55, 0.64, 0.72, 0.78, 0.83, 0.87, 0.90, 0.92,
    0.94, 0.95, 0.96, 0.97, 0.98, 0.985, 0.99, 0.995, 1.00
  ]),
  adjusted_yards_per_attempt: Object.freeze([
    4.0, 4.7, 5.2, 5.6, 5.9, 6.2, 6.5, 6.8, 7.0,
    7.2, 7.4, 7.7, 8.0, 8.3, 8.7, 9.2, 9.8, 10.6
  ]),
  cpoe: Object.freeze([
    -0.100, -0.075, -0.055, -0.040, -0.030, -0.020, -0.010, -0.005, 0.000,
     0.005,  0.010,  0.018,  0.025,  0.033,  0.042,  0.055,  0.070, 0.095
  ]),
  completion_rate: Object.freeze([
    0.500, 0.535, 0.560, 0.580, 0.595, 0.610, 0.620, 0.630, 0.640,
    0.650, 0.660, 0.670, 0.680, 0.690, 0.705, 0.720, 0.740, 0.770
  ]),
  explosive_pass_rate: Object.freeze([
    0.045, 0.055, 0.065, 0.073, 0.080, 0.087, 0.094, 0.100, 0.106,
    0.112, 0.118, 0.125, 0.132, 0.140, 0.150, 0.162, 0.178, 0.200
  ]),
  designed_rush_attempts_per_start: Object.freeze([
    0.0, 0.2, 0.4, 0.7, 1.0, 1.3, 1.7, 2.1, 2.5,
    3.0, 3.5, 4.1, 4.8, 5.6, 6.5, 7.5, 8.8, 10.5
  ]),
  scrambles_per_start: Object.freeze([
    0.0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4,
    2.7, 3.0, 3.4, 3.8, 4.3, 4.9, 5.6, 6.5, 7.8
  ]),
  rushing_yards_per_start: Object.freeze([
    0, 3, 6, 9, 12, 15, 18, 22, 26, 30, 35, 40, 46, 53, 61, 70, 82, 98
  ]),
  goal_line_rush_attempts_per_start: Object.freeze([
    0.00, 0.03, 0.06, 0.10, 0.14, 0.18, 0.22, 0.27, 0.32,
    0.38, 0.45, 0.53, 0.62, 0.73, 0.86, 1.02, 1.22, 1.50
  ]),
  offensive_environment_score: Object.freeze([
    20, 28, 34, 39, 43, 47, 50, 53, 56, 59, 62, 66, 70, 74, 79, 84, 90, 96
  ]),
  protection_context_score: Object.freeze([
    20, 28, 34, 39, 43, 47, 50, 53, 56, 59, 62, 66, 70, 74, 79, 84, 90, 96
  ]),
  interception_rate: Object.freeze([
    0.005, 0.008, 0.011, 0.014, 0.017, 0.019, 0.021, 0.023, 0.025,
    0.027, 0.029, 0.032, 0.035, 0.038, 0.042, 0.047, 0.055, 0.070
  ]),
  sack_rate: Object.freeze([
    0.025, 0.035, 0.042, 0.048, 0.054, 0.060, 0.066, 0.072, 0.078,
    0.084, 0.091, 0.099, 0.108, 0.118, 0.130, 0.145, 0.165, 0.200
  ]),
  passing_td_rate: Object.freeze([
    0.015, 0.022, 0.028, 0.033, 0.037, 0.041, 0.045, 0.049, 0.053,
    0.057, 0.061, 0.066, 0.071, 0.077, 0.084, 0.092, 0.103, 0.120
  ]),
  recent_start_rate: Object.freeze([
    0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.78,
    0.84, 0.89, 0.93, 0.96, 0.98, 0.99, 1.00, 1.00, 1.00
  ])
});
```

### 26.4.3 Runtime reference validation

Before evaluation:

- the custom reference value must be a plain non-null object;
- every required array key must exist;
- unknown object keys are rejected;
- every array must contain at least 2 finite numbers;
- every custom array must be strictly increasing (`A[i] < A[i+1]` for every valid `i`);
- no array may contain `NaN` or infinity.

The frozen default `QB_MVP_V1_REFERENCE_DISTRIBUTIONS` is validated as part of the mandatory test suite and may contain repeated terminal values where the percentile boundary rules make the result unambiguous. Custom arrays may not contain duplicates.

Invalid custom reference objects cause an error. They do not fall back silently.

Reference version:

```text
QB_REFERENCE_V1
```

Custom reference arrays must set output `reference_version = "CUSTOM"`.

---

## 26.5 Exact fallback table, dependency order, penalties, and status

### 26.5.1 Fallback semantics

For each nullable field:

1. use supplied valid value;
2. otherwise apply the exact fallback below;
3. append the exact fallback code;
4. apply confidence penalties only where listed in §26.11;
5. never append the same fallback code twice.

Fallbacks are computed in the dependency order in §26.5.3.

### 26.5.2 Binding fallback table

| Missing field | Exact fallback | Fallback code |
|---|---|---|
| `designed_rush_attempts` | `max(0, recent_rush_attempts - scrambles_fallback_or_value)` | `DESIGNED_RUSH_FROM_TOTAL_MINUS_SCRAMBLES` |
| `scrambles` | `0.45 * recent_rush_attempts` | `SCRAMBLES_FROM_RUSH_SHARE` |
| `goal_line_rush_attempts` | `0.10 * recent_rush_attempts` | `GOAL_LINE_RUSH_FROM_TOTAL` |
| `adjusted_yards_per_attempt` | derive from recent passing totals if attempts > 0; else prior `6.8` | `AYPA_DERIVED` or `AYPA_PRIOR` |
| `completion_percentage_over_expected` | use completion-rate pathway | `CPOE_TO_COMPLETION_RATE` |
| `explosive_pass_rate` | `0.10` | `EXPLOSIVE_PASS_RATE_PRIOR` |
| `team_dropback_share` | depth-chart mapping below | `DROPBACK_SHARE_FROM_DEPTH_CHART` |
| `expected_active_game_pass_attempts` | recent attempts per start if starts > 0; else role mapping below | `PASS_ATTEMPTS_FROM_RECENT_STARTS` or `PASS_ATTEMPTS_FROM_ROLE` |
| `expected_active_game_designed_rush_attempts` | designed rushes per recent start if starts > 0; else `1.5` | `EXPECTED_DESIGNED_RUSH_FALLBACK` |
| `expected_active_game_scrambles` | scrambles per recent start if starts > 0; else `1.8` | `EXPECTED_SCRAMBLES_FALLBACK` |
| `expected_active_game_goal_line_rush_attempts` | goal-line rushes per recent start if starts > 0; else `0.25` | `EXPECTED_GOAL_LINE_RUSH_FALLBACK` |
| `offensive_environment_score` | `50` | `OFFENSIVE_ENVIRONMENT_NEUTRAL` |
| `protection_context_score` | `50` | `PROTECTION_CONTEXT_NEUTRAL` |
| `competition_pressure` | role-status mapping below | `COMPETITION_FROM_ROLE` |
| `organizational_commitment` | role/draft mapping below | `COMMITMENT_FROM_ROLE_DRAFT` |
| `probability_active` | injury-status mapping below | `ACTIVE_PROBABILITY_FROM_INJURY` |
| `expected_games_limited` | injury-status mapping below | `LIMITED_GAMES_FROM_INJURY` |

### 26.5.3 Binding fallback dependency order

Resolve in this exact order:

1. `scrambles`;
2. `designed_rush_attempts`;
3. `goal_line_rush_attempts`;
4. `adjusted_yards_per_attempt`;
5. `completion_percentage_over_expected` pathway flag;
6. `explosive_pass_rate`;
7. `team_dropback_share`;
8. `expected_active_game_pass_attempts`;
9. `expected_active_game_designed_rush_attempts`;
10. `expected_active_game_scrambles`;
11. `expected_active_game_goal_line_rush_attempts`;
12. `offensive_environment_score`;
13. `protection_context_score`;
14. `competition_pressure`;
15. `organizational_commitment`;
16. `probability_active`;
17. `expected_games_limited`.

### 26.5.4 Depth-chart dropback-share mapping

```text
STARTER        = 0.96
CO_STARTER     = 0.70
BACKUP         = 0.15
PRACTICE_SQUAD = 0.03
FREE_AGENT     = 0.00
```

### 26.5.5 Role-based expected pass-attempt mapping

```text
ESTABLISHED_STARTER             = 34
YOUNG_COMMITTED_STARTER         = 33
ROOKIE_EXPECTED_STARTER         = 31
BRIDGE_STARTER                  = 31
TEMPORARY_INJURY_REPLACEMENT    = 30
COMPETITION                     = 27
RECENTLY_BENCHED                = 18
BACKUP                          = 8
```

### 26.5.6 Competition-pressure mapping

```text
ESTABLISHED_STARTER             = 0.05
YOUNG_COMMITTED_STARTER         = 0.10
ROOKIE_EXPECTED_STARTER         = 0.15
BRIDGE_STARTER                  = 0.45
TEMPORARY_INJURY_REPLACEMENT    = 0.70
COMPETITION                     = 0.75
RECENTLY_BENCHED                = 0.90
BACKUP                          = 0.85
```

### 26.5.7 Organizational-commitment mapping

First compute `draft_commitment`:

```text
round 1 = 0.90
round 2 = 0.72
round 3 = 0.58
round 4 = 0.45
round 5 = 0.35
round 6 = 0.28
round 7 = 0.22
undrafted/null = 0.18
```

Compute `role_commitment`:

```text
ESTABLISHED_STARTER             = 0.92
YOUNG_COMMITTED_STARTER         = 0.95
ROOKIE_EXPECTED_STARTER         = 0.88
BRIDGE_STARTER                  = 0.45
TEMPORARY_INJURY_REPLACEMENT    = 0.25
COMPETITION                     = 0.48
RECENTLY_BENCHED                = 0.25
BACKUP                          = 0.20
```

Then:

`organizational_commitment = 0.65 * role_commitment + 0.35 * draft_commitment`

### 26.5.8 Active-probability mapping

```text
HEALTHY      = 0.99
QUESTIONABLE = 0.75
DOUBTFUL     = 0.20
OUT          = 0.00
IR           = 0.00
PUP          = 0.00
```

If `injury_status` is `OUT`, `IR`, or `PUP`, a supplied `probability_active > 0` is invalid and must be rejected.

### 26.5.9 Expected-limited-games mapping

```text
HEALTHY      = 0
QUESTIONABLE = min(2, expected_games_remaining)
DOUBTFUL     = min(3, expected_games_remaining)
OUT          = min(2, expected_games_remaining)
IR           = min(4, expected_games_remaining)
PUP          = min(4, expected_games_remaining)
```

### 26.5.10 Fallback status

```text
fallback_count = number of unique fallback codes

status:
  fallback_count == 0  -> "COMPLETE"
  fallback_count 1..4  -> "PARTIAL"
  fallback_count >= 5  -> "FALLBACK_HEAVY"
```

---

## 26.6 Exact shrinkage formulas and priors

### 26.6.1 Generic formula

```text
shrink(observed, sample, prior, k) =
  (sample / (sample + k)) * observed
  + (k / (sample + k)) * prior
```

If `sample = 0`, return `prior`.

### 26.6.2 QB prior family

Compute `qb_prior_strength` from draft round:

```text
round 1 = 0.70
round 2 = 0.60
round 3 = 0.54
round 4 = 0.49
round 5 = 0.46
round 6 = 0.44
round 7 = 0.42
null    = 0.40
```

This is used only to adjust rookie/low-sample priors, never as a direct current-performance score.

### 26.6.3 Adjusted yards per attempt

```text
aypa_prior = 6.2 + 1.2 * qb_prior_strength
aypa_shrunk = shrink(resolved_aypa, recent_pass_attempts, aypa_prior, 250)
```

### 26.6.3A Ordinary passing yards per attempt for yardage projection

AY/A remains the Passing Quality metric. It must never be treated as literal passing yards per attempt.

```text
observed_passing_yards_per_attempt =
  recent_pass_attempts > 0
    ? recent_passing_yards / recent_pass_attempts
    : 6.9

passing_ypa_prior = 6.5 + 0.8 * qb_prior_strength

passing_yards_per_attempt_shrunk =
  shrink(
    observed_passing_yards_per_attempt,
    recent_pass_attempts,
    passing_ypa_prior,
    250
  )
```

Negative observed passing YPA is permitted. The projection clamp in §26.10.2 prevents an invalid expected-yardage output. This metric does not enter percentile scoring and therefore requires no reference distribution.

### 26.6.4 Completion pathway

If CPOE is supplied:

```text
cpoe_prior = -0.010 + 0.020 * qb_prior_strength
completion_quality_value =
  shrink(completion_percentage_over_expected, recent_pass_attempts, cpoe_prior, 250)

completion_quality_percentile =
  percentile(completion_quality_value, reference.cpoe)
```

If CPOE is missing:

```text
observed_completion_rate =
  recent_pass_attempts > 0
    ? recent_completions / recent_pass_attempts
    : 0.64

completion_rate_prior = 0.60 + 0.07 * qb_prior_strength

completion_rate_shrunk =
  shrink(observed_completion_rate, recent_pass_attempts, completion_rate_prior, 250)

completion_quality_percentile =
  percentile(completion_rate_shrunk, reference.completion_rate)
```

Do not convert completion rate into pseudo-CPOE.

### 26.6.5 Explosive pass rate

```text
explosive_prior = 0.085 + 0.030 * qb_prior_strength

explosive_pass_rate_shrunk =
  shrink(resolved_explosive_pass_rate, recent_pass_attempts, explosive_prior, 200)
```

### 26.6.6 Interception rate

```text
observed_interception_rate =
  recent_pass_attempts > 0
    ? recent_interceptions / recent_pass_attempts
    : 0.025

interception_prior = 0.030 - 0.010 * qb_prior_strength

interception_rate_shrunk =
  shrink(observed_interception_rate, recent_pass_attempts, interception_prior, 300)
```

### 26.6.7 Sack rate

```text
dropbacks_for_sack_rate = recent_pass_attempts + recent_sacks

observed_sack_rate =
  dropbacks_for_sack_rate > 0
    ? recent_sacks / dropbacks_for_sack_rate
    : 0.075

sack_rate_shrunk =
  shrink(observed_sack_rate, dropbacks_for_sack_rate, 0.075, 250)
```

### 26.6.8 Passing touchdown rate

```text
observed_passing_td_rate =
  recent_pass_attempts > 0
    ? recent_passing_tds / recent_pass_attempts
    : 0.045

passing_td_prior = 0.040 + 0.015 * qb_prior_strength

passing_td_rate_shrunk =
  shrink(observed_passing_td_rate, recent_pass_attempts, passing_td_prior, 300)
```

### 26.6.9 Rushing rates

```text
starts_denominator = max(recent_starts, 1)

designed_rushes_per_start_observed =
  resolved_designed_rush_attempts / starts_denominator

scrambles_per_start_observed =
  resolved_scrambles / starts_denominator

rushing_yards_per_start_observed =
  recent_rushing_yards / starts_denominator

goal_line_rushes_per_start_observed =
  resolved_goal_line_rush_attempts / starts_denominator
```

Shrink each using `recent_starts`:

```text
designed_rushes_per_start =
  shrink(designed_rushes_per_start_observed, recent_starts, 1.5, 4)

scrambles_per_start =
  shrink(scrambles_per_start_observed, recent_starts, 1.8, 4)

rushing_yards_per_start =
  shrink(rushing_yards_per_start_observed, recent_starts, 18.0, 4)

goal_line_rushes_per_start =
  shrink(goal_line_rushes_per_start_observed, recent_starts, 0.25, 6)
```

### 26.6.10 Start rate

```text
recent_start_rate =
  recent_games > 0 ? recent_starts / recent_games : 0
```

No shrinkage is applied. Role Security separately incorporates declared role state.

---

## 26.7 Exact trend formulas

Trend is used only in Sustainability and volatility. It is not a ninth component.

### 26.7.1 Passing-efficiency trend

If `prior_adjusted_yards_per_attempt == null` or `prior_recent_pass_attempts == null`:

```text
passing_efficiency_trend = 50
```

Otherwise:

```text
current_trend_aypa =
  shrink(resolved_aypa, recent_pass_attempts, aypa_prior, 150)

prior_trend_aypa =
  shrink(prior_adjusted_yards_per_attempt, prior_recent_pass_attempts, aypa_prior, 150)

aypa_delta = current_trend_aypa - prior_trend_aypa

passing_efficiency_trend =
  clamp(50 + 12 * aypa_delta, 0, 100)
```

### 26.7.2 Turnover trend

If `prior_interception_rate == null` or `prior_recent_pass_attempts == null`:

```text
turnover_trend = 50
```

Otherwise:

```text
current_int =
  shrink(observed_interception_rate, recent_pass_attempts, interception_prior, 150)

prior_int =
  shrink(prior_interception_rate, prior_recent_pass_attempts, interception_prior, 150)

turnover_trend =
  clamp(50 - 800 * (current_int - prior_int), 0, 100)
```

### 26.7.3 Rushing-role trend

If `prior_rush_attempts_per_start == null`:

```text
rushing_role_trend = 50
```

Otherwise:

```text
current_rush_attempts_per_start =
  recent_starts > 0
    ? recent_rush_attempts / recent_starts
    : 0

rushing_role_trend =
  clamp(
    50 + 8 * (current_rush_attempts_per_start - prior_rush_attempts_per_start),
    0,
    100
  )
```

---

## 26.8 Exact derived values and eight component formulas

All component outputs are clamped to `[0,100]`.

### 26.8.1 Shared percentile values

```text
P_pass_volume =
  percentile(resolved_expected_active_game_pass_attempts,
             reference.active_game_pass_attempts)

P_dropback_share =
  percentile(resolved_team_dropback_share,
             reference.team_dropback_share)

P_recent_start_rate =
  percentile(recent_start_rate,
             reference.recent_start_rate)

P_aypa =
  percentile(aypa_shrunk,
             reference.adjusted_yards_per_attempt)

P_completion_quality =
  completion_quality_percentile

P_explosive =
  percentile(explosive_pass_rate_shrunk,
             reference.explosive_pass_rate)

P_designed =
  percentile(designed_rushes_per_start,
             reference.designed_rush_attempts_per_start)

P_scramble =
  percentile(scrambles_per_start,
             reference.scrambles_per_start)

P_rush_yards =
  percentile(rushing_yards_per_start,
             reference.rushing_yards_per_start)

P_goal_line =
  percentile(goal_line_rushes_per_start,
             reference.goal_line_rush_attempts_per_start)

P_environment =
  percentile(resolved_offensive_environment_score,
             reference.offensive_environment_score)

P_protection =
  percentile(resolved_protection_context_score,
             reference.protection_context_score)

P_int_safety =
  inversePercentile(interception_rate_shrunk,
                    reference.interception_rate)

P_sack_resilience =
  inversePercentile(sack_rate_shrunk,
                    reference.sack_rate)

P_td_rate =
  percentile(passing_td_rate_shrunk,
             reference.passing_td_rate)
```

### 26.8.2 Passing Opportunity — PO

```text
PO =
  clamp(
    0.55 * P_pass_volume
    + 0.25 * P_dropback_share
    + 0.20 * P_recent_start_rate,
    0,
    100
  )
```

Interpretation:

- expected active-game attempts are primary;
- dropback share captures control of the team QB workload;
- recent start rate prevents a tiny temporary workload sample from being treated identically to an established full-time role.

### 26.8.3 Passing Quality — PQ

```text
PQ =
  clamp(
    0.45 * P_aypa
    + 0.30 * P_completion_quality
    + 0.25 * P_explosive,
    0,
    100
  )
```

No touchdown rate, interception rate, or sack rate appears in PQ.

### 26.8.4 Rushing Value — RV

```text
RV =
  clamp(
    0.35 * P_designed
    + 0.20 * P_scramble
    + 0.30 * P_rush_yards
    + 0.15 * P_goal_line,
    0,
    100
  )
```

Designed rushing receives more weight than scrambling because it reflects intentional offensive usage. Goal-line rushing is material but cannot dominate the component.

### 26.8.5 Scoring Environment — SE

```text
SE =
  clamp(
    0.65 * P_environment
    + 0.20 * P_protection
    + 0.15 * P_td_rate,
    0,
    100
  )
```

The passing TD-rate term is intentionally small because current TD production is also regressed in EFO.

### 26.8.6 Role Security — RS

First map `depth_chart_status`:

```text
STARTER        = 95
CO_STARTER     = 62
BACKUP         = 22
PRACTICE_SQUAD = 5
FREE_AGENT     = 0
```

Map `role_status`:

```text
ESTABLISHED_STARTER             = 95
YOUNG_COMMITTED_STARTER         = 92
ROOKIE_EXPECTED_STARTER         = 82
BRIDGE_STARTER                  = 55
TEMPORARY_INJURY_REPLACEMENT    = 38
COMPETITION                     = 42
RECENTLY_BENCHED                = 18
BACKUP                          = 12
```

Then:

```text
RS =
  clamp(
    0.30 * depth_chart_score
    + 0.30 * role_status_score
    + 0.25 * (100 * resolved_organizational_commitment)
    + 0.15 * (100 * (1 - resolved_competition_pressure)),
    0,
    100
  )
```

No separate horizon multiplier is applied. Horizon differentiation occurs through the composite weights in §26.9.

### 26.8.7 Availability — AV

Map injury status to `injury_status_score`:

```text
HEALTHY      = 100
QUESTIONABLE = 70
DOUBTFUL     = 25
OUT          = 0
IR           = 0
PUP          = 0
```

Compute:

```text
career_start_availability =
  career_games_played > 0
    ? clamp(100 * career_starts / career_games_played, 0, 100)
    : 50

AV =
  clamp(
    0.70 * (100 * resolved_probability_active)
    + 0.20 * injury_status_score
    + 0.10 * career_start_availability,
    0,
    100
  )
```

`career_start_availability` is only a weak availability-history proxy. It must not be interpreted as talent.

### 26.8.8 Age & Development — AD

#### Age score

```text
age <= 21: 82
age 22: 88
age 23: 94
age 24: 98
age 25: 100
age 26: 100
age 27: 100
age 28: 100
age 29: 99
age 30: 98
age 31: 97
age 32: 95
age 33: 92
age 34: 88
age 35: 83
age 36: 77
age 37: 70
age 38: 62
age 39: 54
age 40: 46
age 41: 38
age 42: 30
age >= 43: 22
```

For non-integer age, linearly interpolate between adjacent integer scores.

#### Experience-development score

```text
nfl_seasons_completed = 0 -> 78
1 -> 88
2 -> 96
3 -> 100
4 -> 100
5 -> 98
6 -> 96
7 -> 94
8 -> 92
9 -> 90
10+ -> 88
```

#### Draft-investment score

```text
round 1 = 100
round 2 = 82
round 3 = 68
round 4 = 55
round 5 = 45
round 6 = 38
round 7 = 32
null    = 28
```

#### Developmental role score

```text
YOUNG_COMMITTED_STARTER         = 100
ROOKIE_EXPECTED_STARTER         = 98
ESTABLISHED_STARTER             = 88
COMPETITION                     = 62
BRIDGE_STARTER                  = 45
TEMPORARY_INJURY_REPLACEMENT    = 38
RECENTLY_BENCHED                = 32
BACKUP                          = 35
```

Compute:

```text
if nfl_seasons_completed <= 2:
  AD =
    0.40 * age_score
    + 0.20 * experience_development_score
    + 0.25 * draft_investment_score
    + 0.15 * developmental_role_score
else:
  AD =
    0.65 * age_score
    + 0.15 * experience_development_score
    + 0.10 * draft_investment_score
    + 0.10 * developmental_role_score
```

Then clamp to `[0,100]`.

Draft investment is deliberately strongest before sufficient NFL evidence exists and decays structurally after Year 2.

### 26.8.9 Sustainability — SU

Compute:

```text
sample_support =
  clamp(
    100 * career_pass_attempts / (career_pass_attempts + 600),
    0,
    100
  )

trend_stability =
  100 - abs(passing_efficiency_trend - 50)

SU =
  clamp(
    0.25 * P_int_safety
    + 0.20 * P_sack_resilience
    + 0.15 * P_td_rate
    + 0.20 * sample_support
    + 0.10 * trend_stability
    + 0.10 * turnover_trend,
    0,
    100
  )
```

`P_td_rate` is limited to 15%. The component therefore rewards supported scoring production without allowing a short TD spike to dominate.

---

## 26.9 All five horizon weight rows

Component order:

```text
PO, PQ, RV, SE, RS, AV, AD, SU
```

Weights:

| Horizon | PO | PQ | RV | SE | RS | AV | AD | SU | Sum |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WEEKLY | 0.22 | 0.18 | 0.20 | 0.13 | 0.07 | 0.12 | 0.02 | 0.06 | 1.00 |
| ROS | 0.18 | 0.17 | 0.17 | 0.11 | 0.15 | 0.10 | 0.03 | 0.09 | 1.00 |
| ONE_YEAR | 0.13 | 0.18 | 0.15 | 0.08 | 0.20 | 0.07 | 0.09 | 0.10 | 1.00 |
| THREE_YEAR | 0.08 | 0.20 | 0.14 | 0.05 | 0.22 | 0.04 | 0.17 | 0.10 | 1.00 |
| DYNASTY | 0.07 | 0.20 | 0.15 | 0.04 | 0.21 | 0.03 | 0.21 | 0.09 | 1.00 |

For each horizon:

```text
composite =
  sum(component_i * horizon_weight_i)
```

No additional role-security, availability, age, or rookie multiplier is applied after the weighted sum.

---

## 26.10 Weekly and ROS Expected Fantasy Output

### 26.10.1 Probability active

Use `resolved_probability_active`.

No role-security factor is multiplied into EFO.

### 26.10.2 Conditional-on-active passing expectations

```text
expected_pass_attempts =
  resolved_expected_active_game_pass_attempts
```

Completion expectation:

If CPOE is supplied:

```text
baseline_completion_rate =
  recent_pass_attempts > 0
    ? recent_completions / recent_pass_attempts
    : 0.64

expected_completion_rate =
  clamp(
    0.70 * baseline_completion_rate
    + 0.30 * (0.64 + completion_quality_value),
    0.45,
    0.80
  )
```

If CPOE is missing:

```text
expected_completion_rate =
  clamp(completion_rate_shrunk, 0.45, 0.80)
```

```text
expected_completions =
  expected_pass_attempts * expected_completion_rate
```

Expected ordinary passing yards per attempt:

```text
expected_yards_per_attempt =
  clamp(
    0.70 * passing_yards_per_attempt_shrunk
    + 0.30 * 6.9,
    4.0,
    10.5
  )
```

This projection uses ordinary passing yards per attempt only. AY/A remains isolated to Passing Quality. Passing touchdowns and interceptions are projected separately below and therefore are not embedded in projected passing yards.

```text
expected_passing_yards =
  expected_pass_attempts * expected_yards_per_attempt
```

Expected passing TD rate:

```text
environment_td_modifier =
  0.80 + 0.40 * (resolved_offensive_environment_score / 100)

expected_passing_td_rate =
  clamp(
    (0.65 * passing_td_rate_shrunk + 0.35 * 0.045)
    * environment_td_modifier,
    0.015,
    0.090
  )

expected_passing_tds =
  expected_pass_attempts * expected_passing_td_rate
```

Expected interceptions:

```text
expected_interception_rate =
  clamp(
    0.75 * interception_rate_shrunk + 0.25 * 0.025,
    0.005,
    0.060
  )

expected_interceptions =
  expected_pass_attempts * expected_interception_rate
```

### 26.10.3 Conditional-on-active rushing expectations

```text
expected_designed_rush_attempts =
  resolved_expected_active_game_designed_rush_attempts

expected_scrambles =
  resolved_expected_active_game_scrambles

expected_total_rush_attempts =
  expected_designed_rush_attempts + expected_scrambles
```

Rushing yards per attempt:

```text
observed_rush_yards_per_attempt =
  recent_rush_attempts > 0
    ? recent_rushing_yards / recent_rush_attempts
    : 4.5

expected_rush_yards_per_attempt =
  clamp(
    shrink(
      observed_rush_yards_per_attempt,
      recent_rush_attempts,
      4.5,
      40
    ),
    1.5,
    8.5
  )

expected_rushing_yards =
  expected_total_rush_attempts * expected_rush_yards_per_attempt
```

Rushing TD expectation:

```text
observed_rushing_td_rate =
  recent_rush_attempts > 0
    ? recent_rushing_tds / recent_rush_attempts
    : 0.035

rushing_td_rate_shrunk =
  shrink(
    observed_rushing_td_rate,
    recent_rush_attempts,
    0.035,
    50
  )

goal_line_bonus =
  0.08 * resolved_expected_active_game_goal_line_rush_attempts

expected_rushing_tds =
  clamp(
    expected_total_rush_attempts * rushing_td_rate_shrunk
    + goal_line_bonus,
    0,
    1.5
  )
```

The goal-line term is an additive expectation. Do not also increase rushing TD rate because of goal-line usage.

### 26.10.4 Conditional-on-active fantasy points

```text
active_game_fantasy_points =
  expected_completions * scoring.points_per_completion
  + expected_passing_yards * scoring.points_per_passing_yard
  + expected_passing_tds * scoring.points_per_passing_td
  + expected_interceptions * scoring.points_per_interception
  + expected_rushing_yards * scoring.points_per_rushing_yard
  + expected_rushing_tds * scoring.points_per_rushing_td
```

### 26.10.5 Weekly EFO

```text
weekly_efo =
  resolved_probability_active * active_game_fantasy_points
```

If `injury_status` is `OUT`, `IR`, or `PUP`, Weekly EFO is exactly `0`.

### 26.10.6 ROS recovery-aware EFO

Let:

```text
G = expected_games_remaining
L = min(resolved_expected_games_limited, G)
F = max(G - L, 0)
```

Define limited-game workload factor:

```text
HEALTHY      = 1.00
QUESTIONABLE = 0.85
DOUBTFUL     = 0.70
OUT          = 0.75
IR           = 0.75
PUP          = 0.75
```

Define limited-game active probability:

```text
limited_active_probability =
  resolved_probability_active
```

Define future healthy active probability:

```text
future_healthy_active_probability =
  if role_status == "TEMPORARY_INJURY_REPLACEMENT": 0.55
  else if role_status == "COMPETITION": 0.75
  else if role_status == "RECENTLY_BENCHED": 0.35
  else if role_status == "BACKUP": 0.20
  else 0.97
```

Then:

```text
limited_game_efo =
  active_game_fantasy_points
  * limited_workload_factor
  * limited_active_probability

future_healthy_game_efo =
  active_game_fantasy_points
  * future_healthy_active_probability

ros_efo =
  L * limited_game_efo
  + F * future_healthy_game_efo
```

This is the only place where role state changes the probability of future ROS games being started. Do not multiply `RS` into ROS EFO.

If `G = 0`, `ros_efo = 0`.

---

## 26.11 Exact confidence formula

### 26.11.1 Base evidence scores

```text
pass_sample_confidence =
  clamp(100 * career_pass_attempts / 1200, 0, 100)

start_sample_confidence =
  clamp(100 * career_starts / 32, 0, 100)

recent_sample_confidence =
  clamp(100 * recent_pass_attempts / 250, 0, 100)

rush_sample_confidence =
  clamp(100 * career_rush_attempts / 180, 0, 100)
```

```text
base_confidence =
  0.35 * pass_sample_confidence
  + 0.25 * start_sample_confidence
  + 0.25 * recent_sample_confidence
  + 0.15 * rush_sample_confidence
```

### 26.11.2 Penalties

Apply all applicable penalties additively:

```text
fallback_count:
  0      -> 0
  1..2   -> -4
  3..4   -> -8
  5..7   -> -14
  8+     -> -20

nfl_seasons_completed == 0                       -> -10
role_status == COMPETITION                       -> -8
role_status == TEMPORARY_INJURY_REPLACEMENT      -> -8
role_status == RECENTLY_BENCHED                  -> -12
team_change                                      -> -5
major_system_change                              -> -5
recent_role_change                               -> -7
injury_status == QUESTIONABLE                    -> -5
injury_status in {DOUBTFUL, OUT, IR, PUP}        -> -10
```

Penalty codes:

```text
FALLBACK_1_2
FALLBACK_3_4
FALLBACK_5_7
FALLBACK_8_PLUS
ROOKIE_UNCERTAINTY
ROLE_COMPETITION
TEMPORARY_STARTER
RECENT_BENCHING
TEAM_CHANGE
SYSTEM_CHANGE
RECENT_ROLE_CHANGE
INJURY_QUESTIONABLE
INJURY_MAJOR
```

Then:

```text
confidence =
  clamp(base_confidence + sum(penalties), 0, 100)
```

A high or low component score does not directly alter confidence.

---

## 26.12 Exact volatility formula

### 26.12.1 Role instability

```text
role_instability = 100 - RS
```

### 26.12.2 Rushing dependence

Compute active-game fantasy-point contributions under the selected scoring:

```text
passing_fp =
  expected_completions * points_per_completion
  + expected_passing_yards * points_per_passing_yard
  + expected_passing_tds * points_per_passing_td
  + expected_interceptions * points_per_interception

rushing_fp =
  expected_rushing_yards * points_per_rushing_yard
  + expected_rushing_tds * points_per_rushing_td

positive_total_fp =
  max(passing_fp, 0) + max(rushing_fp, 0)

rushing_dependence =
  positive_total_fp > 0
    ? 100 * max(rushing_fp, 0) / positive_total_fp
    : 0
```

### 26.12.3 Turnover risk

```text
turnover_risk =
  percentile(interception_rate_shrunk,
             reference.interception_rate)
```

### 26.12.4 Passing instability

```text
passing_instability =
  abs(passing_efficiency_trend - 50) * 2
```

If no prior efficiency window exists, set:

```text
passing_instability = 35
```

### 26.12.5 Sample uncertainty

```text
sample_uncertainty =
  100 - clamp(
    0.60 * pass_sample_confidence
    + 0.40 * start_sample_confidence,
    0,
    100
  )
```

### 26.12.6 Injury uncertainty

```text
HEALTHY      = 5
QUESTIONABLE = 45
DOUBTFUL     = 75
OUT          = 70
IR           = 65
PUP          = 60
```

### 26.12.7 Change uncertainty

```text
change_uncertainty =
  clamp(
    (team_change ? 35 : 0)
    + (major_system_change ? 30 : 0)
    + (recent_role_change ? 40 : 0),
    0,
    100
  )
```

### 26.12.8 Final volatility

```text
volatility =
  clamp(
    0.25 * role_instability
    + 0.15 * rushing_dependence
    + 0.15 * turnover_risk
    + 0.15 * passing_instability
    + 0.15 * sample_uncertainty
    + 0.10 * injury_uncertainty
    + 0.05 * change_uncertainty,
    0,
    100
  )
```

Volatility is not derived from confidence.

---

## 26.13 Exact explanation generation and merge order

### 26.13.1 Component contribution scores

For the selected horizon:

```text
component_contribution =
  horizon_weight * (component_score - 50)
```

Positive candidates require:

```text
component_score >= 65
```

Negative candidates require:

```text
component_score <= 35
```

Rank positive component candidates by:

1. descending `component_contribution`;
2. component priority tie-break:
   `RS, PQ, RV, PO, SU, AV, AD, SE`.

Rank negative component candidates by:

1. ascending `component_contribution`;
2. same priority tie-break.

### 26.13.2 Component explanation templates

```text
PO positive: "Strong passing opportunity supports the current fantasy workload."
PO negative: "Limited passing opportunity constrains the current fantasy ceiling."

PQ positive: "Strong passing efficiency and quality support sustainable quarterback value."
PQ negative: "Weak passing efficiency limits the sustainability of current production."

RV positive: "Designed rushing, scrambling, and rushing production add a meaningful fantasy floor and ceiling."
RV negative: "Limited rushing contribution leaves the profile more dependent on passing production."

SE positive: "The offensive and scoring environment supports touchdown and passing opportunity."
SE negative: "A weak offensive environment limits scoring support."

RS positive: "Strong starting-role security supports value beyond the immediate week."
RS negative: "Unstable starting-role security materially weakens longer-horizon value."

AV positive: "Current availability supports near-term value."
AV negative: "Availability risk reduces near-term reliability."

AD positive: "Age, career stage, and organizational investment support long-term value."
AD negative: "Age or limited developmental runway reduces long-horizon value."

SU positive: "Turnover, sack, sample, and trend indicators support production sustainability."
SU negative: "Current production carries meaningful sustainability risk."
```

### 26.13.3 Direct EFO explanations

Generate these before component explanations:

1. If `resolved_probability_active < 0.75`:
   - negative:
   `"Current availability materially reduces Weekly expected fantasy output."`

2. If `role_status == "TEMPORARY_INJURY_REPLACEMENT"`:
   - negative for selected horizon other than WEEKLY:
   `"Temporary starting status sharply limits value beyond the immediate opportunity."`

3. If `role_status == "RECENTLY_BENCHED"`:
   - negative:
   `"Recent benching creates severe starting-role uncertainty."`

4. If `rushing_dependence >= 45` and `RV >= 65`:
   - positive:
   `"Rushing supplies a large share of expected fantasy production."`

5. If `fallback_count >= 5`:
   - negative:
   `"The evaluation relies on multiple fallback inputs, reducing evidence quality."`

### 26.13.4 Merge order

For positives:

1. direct rushing-dependence explanation if applicable;
2. ranked positive component explanations;
3. stop at 3.

For negatives:

1. availability direct explanation;
2. temporary-starter direct explanation;
3. recently-benched direct explanation;
4. fallback-heavy direct explanation;
5. ranked negative component explanations;
6. de-duplicate exact text;
7. stop at 3.

If fewer than 1 positive or negative explanation exists, the corresponding array may be empty.

---

## 26.14 Binding calculation order

Implement in this exact order:

1. validate raw input;
2. validate scoring overrides;
3. merge scoring with defaults;
4. validate reference distributions;
5. initialize fallback log;
6. resolve nullable inputs in §26.5.3 order;
7. de-duplicate and lexically sort fallback log;
8. derive fallback status;
9. compute QB prior strength and metric priors;
10. compute all shrinkage values, including AY/A for PQ and ordinary passing YPA for projected passing yards;
11. compute trend values;
12. compute all percentiles;
13. compute PO;
14. compute PQ;
15. compute RV;
16. compute SE;
17. compute RS;
18. compute AV;
19. compute AD;
20. compute SU;
21. compute all five horizon composites;
22. compute conditional-on-active passing expectations;
23. compute conditional-on-active rushing expectations;
24. compute active-game fantasy points;
25. compute Weekly EFO;
26. compute ROS EFO;
27. compute confidence and penalty codes;
28. compute volatility and dependence metrics;
29. generate explanations using selected-horizon weights;
30. construct output object;
31. round only for serialization.

No later step may mutate an earlier component.

---

## 26.15 Exact output interface

```ts
interface QBMVPOutput {
  schema_version: "qb-mvp-output-1.0";
  model_version: string;
  reference_version: "QB_REFERENCE_V1" | "CUSTOM";
  generated_at: string;

  player: {
    player_id: string;
    player_name: string;
    team: string | null;
    as_of: string;
  };

  scoring: QBScoring;

  status: "COMPLETE" | "PARTIAL" | "FALLBACK_HEAVY";
  fallback_log: string[];

  components: {
    passing_opportunity: number;
    passing_quality: number;
    rushing_value: number;
    scoring_environment: number;
    role_security: number;
    availability: number;
    age_development: number;
    sustainability: number;
  };

  composites: {
    weekly: number;
    ros: number;
    one_year: number;
    three_year: number;
    dynasty: number;
  };

  expected_fantasy_output: {
    conditional_on_active: {
      pass_attempts: number;
      completions: number;
      completion_rate: number;
      passing_yards: number;
      passing_tds: number;
      interceptions: number;
      designed_rush_attempts: number;
      scrambles: number;
      total_rush_attempts: number;
      rushing_yards: number;
      rushing_tds: number;
      fantasy_points: number;
    };
    probability_active: number;
    weekly_fantasy_points: number;
    ros_fantasy_points: number;
    expected_games_remaining: number;
    expected_games_limited: number;
  };

  confidence: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    penalty_codes: string[];
  };

  volatility: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    rushing_dependence: number;
    turnover_risk: number;
    role_instability: number;
  };

  explanations: {
    positive: string[];
    negative: string[];
  };
}
```

`generated_at` defaults to the current UTC production clock, but becomes deterministic when `options.generated_at` is supplied. The supplied value must contain timezone information, is validated exactly like `as_of`, and is emitted in canonical UTC form. Golden fixtures must supply a fixed literal `generated_at`; post-processing is prohibited.

---

## 26.16 Mandatory tests and golden fixtures

### 26.16.1 Formula and invariant tests

Mandatory:

1. every reference array exists;
2. every reference array is sorted ascending;
3. percentile exact minimum returns `0`;
4. percentile exact maximum returns `100`;
5. percentile interpolation is deterministic;
6. every component remains in `[0,100]`;
7. every composite remains in `[0,100]`;
8. all horizon rows sum to `1.00` within `1e-12`;
9. confidence remains in `[0,100]`;
10. volatility remains in `[0,100]`;
11. Weekly EFO is zero for `OUT`, `IR`, and `PUP`;
12. RS is never multiplied into Weekly EFO;
13. AV is never multiplied into a composite after weighting;
14. age affects no component except AD;
15. selected horizon changes explanations only;
16. scoring overrides change EFO and rushing dependence but not components;
17. identical input plus fixed timestamp produces byte-identical output;
18. no missing numeric value silently becomes zero;
19. invalid custom references throw;
20. fallback log is de-duplicated and lexically sorted.
21. projected passing yards use ordinary shrunk passing YPA and not AY/A.
22. changing recent passing TDs or interceptions while holding passing yards and attempts fixed does not directly change expected passing yards.
23. supplying custom references sets `reference_version = "CUSTOM"`; omitting them sets `QB_REFERENCE_V1`.
24. invalid selected horizons, empty model versions, unknown option keys, and invalid generated timestamps throw.

### 26.16.2 QB-specific tests

1. Increasing designed rush attempts with all else fixed must not decrease RV.
2. Increasing goal-line rush attempts with all else fixed must not decrease RV or expected rushing TDs.
3. Increasing scrambles alone must not increase PO.
4. Increasing pass attempts alone must not directly increase PQ.
5. Increasing interception rate must not directly alter PQ.
6. Increasing competition pressure must not increase RS.
7. Temporary starter status must reduce long-horizon composites more than Weekly through weights.
8. A healthy temporary starter can still have non-zero and potentially strong Weekly EFO.
9. A strong rushing QB with weak passing quality can retain high Weekly value without receiving high PQ.
10. A pocket passer can achieve elite composite value through PO, PQ, SE, RS, and SU despite low RV.
11. Draft round has greater AD influence for Years 0–2 than for veterans.
12. A 38-year-old elite QB is not directly penalized in PQ, PO, or EFO because of age.
13. Rushing dependence and confidence are not mathematical inverses.
14. A fallback-heavy player can have a high composite and low confidence.

### 26.16.3 EFO tests

1. `points_per_passing_td` override changes fantasy points exactly through expected passing TDs.
2. `points_per_completion` override changes fantasy points exactly through expected completions.
3. interception penalties are applied with their signed scoring value.
4. goal-line bonus is applied exactly once.
5. probability active is applied exactly once to Weekly EFO.
6. future healthy active probability is applied exactly once per ROS future game.
7. `expected_games_remaining = 0` produces `ros_efo = 0`.

### 26.16.4 Explanation tests

1. maximum three positive explanations;
2. maximum three negative explanations;
3. exact-text de-duplication;
4. selected-horizon weighting changes component ranking only;
5. temporary-starter direct explanation appears outside WEEKLY;
6. fallback-heavy explanation appears at five or more unique fallback codes;
7. explanations are deterministic.

### 26.16.5 Validation tests

Reject:

- negative counts;
- rates above 1;
- invalid enums;
- `career_starts > career_games_played`;
- `recent_starts > recent_games`;
- invalid scoring;
- invalid reference arrays;
- positive active probability for `OUT`, `IR`, or `PUP`.

### 26.16.6 Mandatory executable fixture registry

All fixtures use these exact evaluator options unless a fixture explicitly states otherwise:

```json
{"selected_horizon":"WEEKLY","scoring":{"points_per_completion":0,"points_per_passing_yard":0.04,"points_per_passing_td":4,"points_per_interception":-2,"points_per_rushing_yard":0.1,"points_per_rushing_td":6},"model_version":"qb-mvp-1.2","generated_at":"2026-09-10T22:00:00.000Z"}
```

`reference_distributions` is omitted, so every fixture must emit `reference_version = "QB_REFERENCE_V1"`. Every `as_of` below canonicalizes to `2026-09-10T22:00:00.000Z`. The following registry is normative and each object is a complete `QBMVPInput`; no property inheritance is permitted in the implementation repository.

```json
{
  "QB-G01": {
    "player_id": "QB-G01",
    "player_name": "Elite Dual Threat",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 96,
    "career_starts": 92,
    "career_pass_attempts": 3200,
    "career_rush_attempts": 520,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 296,
    "recent_completions": 199,
    "recent_passing_yards": 2380,
    "recent_passing_tds": 19,
    "recent_interceptions": 5,
    "recent_sacks": 16,
    "recent_rush_attempts": 72,
    "recent_rushing_yards": 510,
    "recent_rushing_tds": 6,
    "designed_rush_attempts": 44,
    "scrambles": 28,
    "goal_line_rush_attempts": 12,
    "adjusted_yards_per_attempt": 8.7,
    "completion_percentage_over_expected": 0.04,
    "explosive_pass_rate": 0.14,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 37,
    "expected_active_game_designed_rush_attempts": 5.5,
    "expected_active_game_scrambles": 3.5,
    "expected_active_game_goal_line_rush_attempts": 1.5,
    "offensive_environment_score": 78,
    "protection_context_score": 72,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G02": {
    "player_id": "QB-G02",
    "player_name": "Elite Pocket Passer",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 29,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 120,
    "career_starts": 118,
    "career_pass_attempts": 4500,
    "career_rush_attempts": 180,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 320,
    "recent_completions": 226,
    "recent_passing_yards": 2700,
    "recent_passing_tds": 23,
    "recent_interceptions": 4,
    "recent_sacks": 13,
    "recent_rush_attempts": 12,
    "recent_rushing_yards": 22,
    "recent_rushing_tds": 1,
    "designed_rush_attempts": 3,
    "scrambles": 9,
    "goal_line_rush_attempts": 1,
    "adjusted_yards_per_attempt": 9.2,
    "completion_percentage_over_expected": 0.065,
    "explosive_pass_rate": 0.155,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 40,
    "expected_active_game_designed_rush_attempts": 0.4,
    "expected_active_game_scrambles": 1.1,
    "expected_active_game_goal_line_rush_attempts": 0.1,
    "offensive_environment_score": 85,
    "protection_context_score": 82,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G03": {
    "player_id": "QB-G03",
    "player_name": "High Volume Inefficient",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 30,
    "nfl_seasons_completed": 5,
    "draft_round": 3,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 304,
    "recent_completions": 180,
    "recent_passing_yards": 1810,
    "recent_passing_tds": 10,
    "recent_interceptions": 14,
    "recent_sacks": 34,
    "recent_rush_attempts": 24,
    "recent_rushing_yards": 90,
    "recent_rushing_tds": 1,
    "designed_rush_attempts": 8,
    "scrambles": 16,
    "goal_line_rush_attempts": 2,
    "adjusted_yards_per_attempt": 4.5,
    "completion_percentage_over_expected": -0.07,
    "explosive_pass_rate": 0.065,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 38,
    "expected_active_game_designed_rush_attempts": 1,
    "expected_active_game_scrambles": 2,
    "expected_active_game_goal_line_rush_attempts": 0.25,
    "offensive_environment_score": 42,
    "protection_context_score": 30,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 6.0,
    "prior_interception_rate": 0.03,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G04": {
    "player_id": "QB-G04",
    "player_name": "Low Volume Game Manager",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 31,
    "nfl_seasons_completed": 5,
    "draft_round": 4,
    "career_games_played": 110,
    "career_starts": 102,
    "career_pass_attempts": 3300,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 216,
    "recent_completions": 145,
    "recent_passing_yards": 1540,
    "recent_passing_tds": 10,
    "recent_interceptions": 3,
    "recent_sacks": 12,
    "recent_rush_attempts": 14,
    "recent_rushing_yards": 45,
    "recent_rushing_tds": 0,
    "designed_rush_attempts": 4,
    "scrambles": 10,
    "goal_line_rush_attempts": 1,
    "adjusted_yards_per_attempt": 7.3,
    "completion_percentage_over_expected": 0.01,
    "explosive_pass_rate": 0.095,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 27,
    "expected_active_game_designed_rush_attempts": 0.5,
    "expected_active_game_scrambles": 1.25,
    "expected_active_game_goal_line_rush_attempts": 0.1,
    "offensive_environment_score": 52,
    "protection_context_score": 70,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G05": {
    "player_id": "QB-G05",
    "player_name": "Rushing Dependent Volatile",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 25,
    "nfl_seasons_completed": 3,
    "draft_round": 2,
    "career_games_played": 42,
    "career_starts": 36,
    "career_pass_attempts": 1100,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 232,
    "recent_completions": 138,
    "recent_passing_yards": 1460,
    "recent_passing_tds": 8,
    "recent_interceptions": 12,
    "recent_sacks": 28,
    "recent_rush_attempts": 88,
    "recent_rushing_yards": 610,
    "recent_rushing_tds": 7,
    "designed_rush_attempts": 52,
    "scrambles": 36,
    "goal_line_rush_attempts": 14,
    "adjusted_yards_per_attempt": 4.9,
    "completion_percentage_over_expected": -0.06,
    "explosive_pass_rate": 0.08,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 29,
    "expected_active_game_designed_rush_attempts": 6.5,
    "expected_active_game_scrambles": 4.5,
    "expected_active_game_goal_line_rush_attempts": 1.75,
    "offensive_environment_score": 55,
    "protection_context_score": 38,
    "depth_chart_status": "STARTER",
    "role_status": "COMPETITION",
    "competition_pressure": 0.55,
    "organizational_commitment": 0.68,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G06": {
    "player_id": "QB-G06",
    "player_name": "Young Breakout",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 24,
    "nfl_seasons_completed": 2,
    "draft_round": 1,
    "career_games_played": 28,
    "career_starts": 25,
    "career_pass_attempts": 820,
    "career_rush_attempts": 130,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 264,
    "recent_completions": 176,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 15,
    "recent_interceptions": 5,
    "recent_sacks": 19,
    "recent_rush_attempts": 46,
    "recent_rushing_yards": 260,
    "recent_rushing_tds": 3,
    "designed_rush_attempts": 24,
    "scrambles": 22,
    "goal_line_rush_attempts": 6,
    "adjusted_yards_per_attempt": 8.2,
    "completion_percentage_over_expected": 0.03,
    "explosive_pass_rate": 0.13,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 33,
    "expected_active_game_designed_rush_attempts": 3,
    "expected_active_game_scrambles": 2.75,
    "expected_active_game_goal_line_rush_attempts": 0.75,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "YOUNG_COMMITTED_STARTER",
    "competition_pressure": 0.08,
    "organizational_commitment": 0.95,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 220,
    "prior_adjusted_yards_per_attempt": 6.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G07": {
    "player_id": "QB-G07",
    "player_name": "Rookie Expected Starter",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 22,
    "nfl_seasons_completed": 0,
    "draft_round": 1,
    "career_games_played": 0,
    "career_starts": 0,
    "career_pass_attempts": 0,
    "career_rush_attempts": 0,
    "recent_games": 0,
    "recent_starts": 0,
    "recent_pass_attempts": 0,
    "recent_completions": 0,
    "recent_passing_yards": 0,
    "recent_passing_tds": 0,
    "recent_interceptions": 0,
    "recent_sacks": 0,
    "recent_rush_attempts": 0,
    "recent_rushing_yards": 0,
    "recent_rushing_tds": 0,
    "designed_rush_attempts": null,
    "scrambles": null,
    "goal_line_rush_attempts": null,
    "adjusted_yards_per_attempt": null,
    "completion_percentage_over_expected": null,
    "explosive_pass_rate": null,
    "team_dropback_share": null,
    "expected_active_game_pass_attempts": null,
    "expected_active_game_designed_rush_attempts": null,
    "expected_active_game_scrambles": null,
    "expected_active_game_goal_line_rush_attempts": null,
    "offensive_environment_score": null,
    "protection_context_score": null,
    "depth_chart_status": "STARTER",
    "role_status": "ROOKIE_EXPECTED_STARTER",
    "competition_pressure": null,
    "organizational_commitment": null,
    "probability_active": null,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": null,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": null,
    "prior_adjusted_yards_per_attempt": null,
    "prior_interception_rate": null,
    "prior_rush_attempts_per_start": null
  },
  "QB-G08": {
    "player_id": "QB-G08",
    "player_name": "Veteran Decline",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 38,
    "nfl_seasons_completed": 15,
    "draft_round": 1,
    "career_games_played": 240,
    "career_starts": 235,
    "career_pass_attempts": 8200,
    "career_rush_attempts": 500,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 288,
    "recent_completions": 184,
    "recent_passing_yards": 1900,
    "recent_passing_tds": 12,
    "recent_interceptions": 8,
    "recent_sacks": 20,
    "recent_rush_attempts": 16,
    "recent_rushing_yards": 35,
    "recent_rushing_tds": 1,
    "designed_rush_attempts": 4,
    "scrambles": 12,
    "goal_line_rush_attempts": 1,
    "adjusted_yards_per_attempt": 6.2,
    "completion_percentage_over_expected": -0.015,
    "explosive_pass_rate": 0.085,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 36,
    "expected_active_game_designed_rush_attempts": 0.5,
    "expected_active_game_scrambles": 1.5,
    "expected_active_game_goal_line_rush_attempts": 0.1,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 300,
    "prior_adjusted_yards_per_attempt": 7.8,
    "prior_interception_rate": 0.018,
    "prior_rush_attempts_per_start": 2.2
  },
  "QB-G09": {
    "player_id": "QB-G09",
    "player_name": "Temporary Injury Replacement",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 28,
    "nfl_seasons_completed": 5,
    "draft_round": 5,
    "career_games_played": 40,
    "career_starts": 9,
    "career_pass_attempts": 520,
    "career_rush_attempts": 55,
    "recent_games": 4,
    "recent_starts": 4,
    "recent_pass_attempts": 128,
    "recent_completions": 82,
    "recent_passing_yards": 900,
    "recent_passing_tds": 6,
    "recent_interceptions": 3,
    "recent_sacks": 9,
    "recent_rush_attempts": 18,
    "recent_rushing_yards": 85,
    "recent_rushing_tds": 1,
    "designed_rush_attempts": 7,
    "scrambles": 11,
    "goal_line_rush_attempts": 2,
    "adjusted_yards_per_attempt": 7.1,
    "completion_percentage_over_expected": 0.0,
    "explosive_pass_rate": 0.1,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 32,
    "expected_active_game_designed_rush_attempts": 1.75,
    "expected_active_game_scrambles": 2.75,
    "expected_active_game_goal_line_rush_attempts": 0.5,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "TEMPORARY_INJURY_REPLACEMENT",
    "competition_pressure": 0.7,
    "organizational_commitment": 0.25,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 40,
    "prior_adjusted_yards_per_attempt": 6.8,
    "prior_interception_rate": 0.03,
    "prior_rush_attempts_per_start": 2.0
  },
  "QB-G10": {
    "player_id": "QB-G10",
    "player_name": "Starting Role Competition",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 26,
    "nfl_seasons_completed": 3,
    "draft_round": 2,
    "career_games_played": 45,
    "career_starts": 30,
    "career_pass_attempts": 1050,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 240,
    "recent_completions": 154,
    "recent_passing_yards": 1700,
    "recent_passing_tds": 11,
    "recent_interceptions": 7,
    "recent_sacks": 21,
    "recent_rush_attempts": 34,
    "recent_rushing_yards": 170,
    "recent_rushing_tds": 2,
    "designed_rush_attempts": 16,
    "scrambles": 18,
    "goal_line_rush_attempts": 4,
    "adjusted_yards_per_attempt": 6.8,
    "completion_percentage_over_expected": -0.005,
    "explosive_pass_rate": 0.1,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 30,
    "expected_active_game_designed_rush_attempts": 2,
    "expected_active_game_scrambles": 2.25,
    "expected_active_game_goal_line_rush_attempts": 0.5,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "CO_STARTER",
    "role_status": "COMPETITION",
    "competition_pressure": 0.75,
    "organizational_commitment": 0.48,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G11": {
    "player_id": "QB-G11",
    "player_name": "Injury Return",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.7,
    "injury_status": "QUESTIONABLE",
    "expected_games_remaining": 10,
    "expected_games_limited": 2,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G12": {
    "player_id": "QB-G12",
    "player_name": "Fallback Heavy",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 24,
    "nfl_seasons_completed": 1,
    "draft_round": 3,
    "career_games_played": 8,
    "career_starts": 3,
    "career_pass_attempts": 110,
    "career_rush_attempts": 20,
    "recent_games": 4,
    "recent_starts": 2,
    "recent_pass_attempts": 62,
    "recent_completions": 37,
    "recent_passing_yards": 390,
    "recent_passing_tds": 2,
    "recent_interceptions": 3,
    "recent_sacks": 8,
    "recent_rush_attempts": 12,
    "recent_rushing_yards": 48,
    "recent_rushing_tds": 1,
    "designed_rush_attempts": null,
    "scrambles": null,
    "goal_line_rush_attempts": null,
    "adjusted_yards_per_attempt": null,
    "completion_percentage_over_expected": null,
    "explosive_pass_rate": null,
    "team_dropback_share": null,
    "expected_active_game_pass_attempts": null,
    "expected_active_game_designed_rush_attempts": null,
    "expected_active_game_scrambles": null,
    "expected_active_game_goal_line_rush_attempts": null,
    "offensive_environment_score": null,
    "protection_context_score": null,
    "depth_chart_status": "BACKUP",
    "role_status": "COMPETITION",
    "competition_pressure": null,
    "organizational_commitment": null,
    "probability_active": null,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": null,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": null,
    "prior_adjusted_yards_per_attempt": null,
    "prior_interception_rate": null,
    "prior_rush_attempts_per_start": null
  },
  "QB-E01": {
    "player_id": "QB-E01",
    "player_name": "Young Backup",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 23,
    "nfl_seasons_completed": 1,
    "draft_round": 2,
    "career_games_played": 10,
    "career_starts": 1,
    "career_pass_attempts": 70,
    "career_rush_attempts": 12,
    "recent_games": 4,
    "recent_starts": 0,
    "recent_pass_attempts": 28,
    "recent_completions": 17,
    "recent_passing_yards": 190,
    "recent_passing_tds": 1,
    "recent_interceptions": 1,
    "recent_sacks": 4,
    "recent_rush_attempts": 5,
    "recent_rushing_yards": 18,
    "recent_rushing_tds": 0,
    "designed_rush_attempts": 1,
    "scrambles": 4,
    "goal_line_rush_attempts": 0,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.15,
    "expected_active_game_pass_attempts": 8,
    "expected_active_game_designed_rush_attempts": 0.3,
    "expected_active_game_scrambles": 0.8,
    "expected_active_game_goal_line_rush_attempts": 0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "BACKUP",
    "role_status": "BACKUP",
    "competition_pressure": 0.85,
    "organizational_commitment": 0.35,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-E02": {
    "player_id": "QB-E02",
    "player_name": "Recently Benched",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.35,
    "expected_active_game_pass_attempts": 18,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "BACKUP",
    "role_status": "RECENTLY_BENCHED",
    "competition_pressure": 0.9,
    "organizational_commitment": 0.25,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": true,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-E03": {
    "player_id": "QB-E03",
    "player_name": "Out Quarterback",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0,
    "injury_status": "OUT",
    "expected_games_remaining": 10,
    "expected_games_limited": 2,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-G11-HEALTHY": {
    "player_id": "QB-G11-HEALTHY",
    "player_name": "Injury Return Healthy Pair",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-E02-BASE": {
    "player_id": "QB-E02-BASE",
    "player_name": "Recently Benched Baseline",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-E03-HEALTHY": {
    "player_id": "QB-E03-HEALTHY",
    "player_name": "Out Quarterback Healthy Pair",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I01-A": {
    "player_id": "QB-I01-A",
    "player_name": "Rushing Isolation Baseline",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 8,
    "recent_rushing_yards": 20,
    "recent_rushing_tds": 0,
    "designed_rush_attempts": 2,
    "scrambles": 6,
    "goal_line_rush_attempts": 0,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 0.25,
    "expected_active_game_scrambles": 0.75,
    "expected_active_game_goal_line_rush_attempts": 0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I01-B": {
    "player_id": "QB-I01-B",
    "player_name": "Rushing Isolation Variant",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 72,
    "recent_rushing_yards": 500,
    "recent_rushing_tds": 6,
    "designed_rush_attempts": 44,
    "scrambles": 28,
    "goal_line_rush_attempts": 12,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 5.5,
    "expected_active_game_scrambles": 3.5,
    "expected_active_game_goal_line_rush_attempts": 1.5,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I02-A": {
    "player_id": "QB-I02-A",
    "player_name": "Role Isolation Established",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I02-B": {
    "player_id": "QB-I02-B",
    "player_name": "Role Isolation Competition",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 27,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "CO_STARTER",
    "role_status": "COMPETITION",
    "competition_pressure": 0.75,
    "organizational_commitment": 0.48,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I03-A": {
    "player_id": "QB-I03-A",
    "player_name": "Age Isolation 30",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 30,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  },
  "QB-I03-B": {
    "player_id": "QB-I03-B",
    "player_name": "Age Isolation 38",
    "team": "TST",
    "as_of": "2026-09-10T16:00:00-06:00",
    "age": 38,
    "nfl_seasons_completed": 5,
    "draft_round": 1,
    "career_games_played": 80,
    "career_starts": 75,
    "career_pass_attempts": 2500,
    "career_rush_attempts": 300,
    "recent_games": 8,
    "recent_starts": 8,
    "recent_pass_attempts": 280,
    "recent_completions": 185,
    "recent_passing_yards": 2100,
    "recent_passing_tds": 16,
    "recent_interceptions": 6,
    "recent_sacks": 18,
    "recent_rush_attempts": 48,
    "recent_rushing_yards": 300,
    "recent_rushing_tds": 4,
    "designed_rush_attempts": 28,
    "scrambles": 20,
    "goal_line_rush_attempts": 8,
    "adjusted_yards_per_attempt": 8.0,
    "completion_percentage_over_expected": 0.025,
    "explosive_pass_rate": 0.12,
    "team_dropback_share": 0.96,
    "expected_active_game_pass_attempts": 35,
    "expected_active_game_designed_rush_attempts": 3.5,
    "expected_active_game_scrambles": 2.5,
    "expected_active_game_goal_line_rush_attempts": 1.0,
    "offensive_environment_score": 70,
    "protection_context_score": 65,
    "depth_chart_status": "STARTER",
    "role_status": "ESTABLISHED_STARTER",
    "competition_pressure": 0.05,
    "organizational_commitment": 0.93,
    "probability_active": 0.99,
    "injury_status": "HEALTHY",
    "expected_games_remaining": 10,
    "expected_games_limited": 0,
    "team_change": false,
    "major_system_change": false,
    "recent_role_change": false,
    "prior_recent_pass_attempts": 270,
    "prior_adjusted_yards_per_attempt": 7.7,
    "prior_interception_rate": 0.024,
    "prior_rush_attempts_per_start": 5.5
  }
}
```

Mandatory assertions are evaluated against unrounded internal values unless the assertion explicitly names canonical serialized output.

#### QB-G01

- `passing_quality >= 65.0`
- `rushing_value >= 65.0`
- `role_security >= 80.0`
- `composites.weekly >= 70.0`
- `confidence.score >= 70.0`
- `volatility.rushing_dependence >= 25.0`

#### QB-G02

- `passing_quality >= 75.0`
- `passing_opportunity >= 70.0`
- `rushing_value <= 40.0`
- `role_security >= 80.0`
- `composites.weekly >= 65.0`
- `composites.dynasty >= 55.0`

#### QB-G03

- `passing_opportunity >= 70.0`
- `passing_quality <= 40.0`
- `sustainability <= 50.0`
- `composites.weekly < composites.three_year`
- `volatility.score >= 15.0`

#### QB-G04

- `passing_opportunity <= 50.0`
- `rushing_value <= 40.0`
- `sustainability >= 50.0`
- `role_security >= 70.0`
- `composites.weekly <= QB-G01.composites.weekly - 10.0`

#### QB-G05

- `rushing_value >= 75.0`
- `passing_quality <= 45.0`
- `volatility.rushing_dependence >= 40.0`
- `volatility.score >= 30.0`

#### QB-G06

- `age_development >= 80.0`
- `role_security >= 70.0`
- `composites.dynasty >= composites.ros`
- `confidence.score < QB-G08.confidence.score`

#### QB-G07

- `age_development >= 75.0`
- `confidence.label == "LOW"`
- `status == "FALLBACK_HEAVY"`
- `composites.dynasty > composites.weekly`

#### QB-G08

- `confidence.label == "HIGH"`
- `age_development <= 75.0`
- `composites.three_year < composites.one_year`
- `composites.dynasty <= composites.one_year - 1.0`

#### QB-G09

- `expected_fantasy_output.weekly_fantasy_points > 0.0`
- `role_security <= 55.0`
- `composites.weekly < composites.dynasty`

#### QB-G10

- `role_security <= 55.0`
- `volatility.score >= 25.0`

#### QB-G11

- `expected_fantasy_output.weekly_fantasy_points == round1(0.70 * expected_fantasy_output.conditional_on_active.fantasy_points)`
- `availability < QB-G11-HEALTHY.availability`
- `confidence.penalty_codes contains "INJURY_QUESTIONABLE"`
- `volatility.score > QB-G11-HEALTHY.volatility.score`

#### QB-G12

- `status == "FALLBACK_HEAVY"`
- `confidence.penalty_codes contains "FALLBACK_8_PLUS"`
- `fallback_log == lexicalSort(unique(fallback_log))`
- `canonical output contains no non-finite number`

#### QB-E01

- `role_security <= 30.0`
- `passing_opportunity <= 30.0`
- `composites.dynasty > 0.0`
- `expected_fantasy_output.weekly_fantasy_points > 0.0`

#### QB-E02

- `role_security < QB-E02-BASE.role_security`
- `volatility.score > QB-E02-BASE.volatility.score`
- `explanations.negative contains exact recently-benched template`

#### QB-E03

- `expected_fantasy_output.weekly_fantasy_points == 0.0`
- `expected_fantasy_output.conditional_on_active.fantasy_points > 0.0`
- `availability < QB-E03-HEALTHY.availability`
- `all non-AV components equal QB-E03-HEALTHY`

#### QB-I01 — Rushing isolation pair

Baseline: `QB-I01-A`. Variant: `QB-I01-B`. Excluding identity-only fields `player_id` and `player_name`, changed model fields are exactly `recent_rush_attempts`, `recent_rushing_yards`, `recent_rushing_tds`, `designed_rush_attempts`, `scrambles`, `goal_line_rush_attempts`, `expected_active_game_designed_rush_attempts`, `expected_active_game_scrambles`, and `expected_active_game_goal_line_rush_attempts`.

- PO, PQ, SE, RS, AV, AD, SU, confidence score/label/penalty codes, status, and fallback log must be numerically or byte-identical.
- RV, Weekly/ROS EFO, rushing dependence, volatility, composites, and explanations are permitted to change.
- `QB-I01-B.rushing_value > QB-I01-A.rushing_value`.
- `QB-I01-B.expected_fantasy_output.weekly_fantasy_points > QB-I01-A.expected_fantasy_output.weekly_fantasy_points`.

#### QB-I02 — Role-security isolation pair

Baseline: `QB-I02-A`. Variant: `QB-I02-B`. Excluding identity-only fields `player_id` and `player_name`, changed model fields are exactly `depth_chart_status`, `role_status`, `competition_pressure`, and `organizational_commitment`.

- PQ, RV, SE, AV, SU, conditional active projections, Weekly EFO, status, and fallback log must be identical.
- Confidence must differ only through the explicit `ROLE_COMPETITION` penalty: `QB-I02-A.confidence.penalty_codes` must not contain `ROLE_COMPETITION`, `QB-I02-B.confidence.penalty_codes` must contain it, and the only additional penalty code in `QB-I02-B` is `ROLE_COMPETITION`; the final scores must be `QB-I02-A.confidence.score == 100.0` and `QB-I02-B.confidence.score == 92.0`; both labels remain `HIGH`.
- PO must be identical because workload inputs are unchanged.
- RS must differ and `QB-I02-B.role_security < QB-I02-A.role_security`.
- AD is permitted to differ because developmental role score uses `role_status`.
- composites, ROS EFO, volatility, and explanations are permitted to differ.

#### QB-I03 — Age isolation pair

Baseline: `QB-I03-A`. Variant: `QB-I03-B`. Excluding identity-only fields `player_id` and `player_name`, the only changed model input field is `age`.

- only AD, composites, and explanations may differ;
- PO, PQ, RV, SE, RS, AV, SU, all EFO values, confidence, volatility, status, and fallback metadata must be identical;
- `QB-I03-B.age_development < QB-I03-A.age_development`;
- `QB-I03-B.composites.three_year < QB-I03-A.composites.three_year`;
- `QB-I03-B.composites.dynasty < QB-I03-A.composites.dynasty`.

### 26.16.7 Golden-output policy

For every fixture object above:

1. invoke the evaluator with the exact options above;
2. validate every mandatory assertion;
3. store the complete canonical output string returned by `canonicalSerializeQBOutput`;
4. compare that string byte-for-byte on every conforming test run.

The fixed `generated_at` must be passed into the evaluator. Replacing timestamps after evaluation is prohibited. Any intentional canonical-output change requires model-version review, fixture regeneration, and a documented reason.

The relational assertions above are mandatory in addition to snapshots. Explanatory observations not written as assertions are non-binding.

### 26.16.8 Version 1.2 fixture-correction record

Version 1.2 preserves every model formula and corrects only the executable verification contract. The corrected assertions were checked against full-precision Section 26 calculations. The following full-precision spot-check values anchor the corrected thresholds:

- `QB-G01.rushing_value = 69.0812...`;
- `QB-G02.passing_quality = 76.3742...`;
- `QB-G03.sustainability = 48.9250...`, `weekly = 53.3966...`, `three_year = 61.2507...`, and `volatility = 18.2407...`;
- `QB-G04.passing_opportunity = 45.8824...`;
- `QB-G05.rushing_value = 75.7276...` and `volatility = 34.9311...`;
- `QB-G08.age_development = 72.3000...`, `one_year = 63.6587...`, `three_year = 63.2047...`, and `dynasty = 62.3734...`;
- `QB-G09.weekly = 57.3741...` and `dynasty = 58.3953...`;
- `QB-G10.volatility = 28.0882...`;
- `QB-I02-A.confidence = 100.0` and `QB-I02-B.confidence = 92.0` because the variant receives the explicit `ROLE_COMPETITION` penalty.

These values are audit anchors, not serialized golden snapshots. Implementations must still generate and store the complete canonical output strings under §26.16.7.

## 26.17 Binding cold-session completeness assertions

A cold-session implementer must not need to invent:

- a field name;
- a unit;
- a validation rule;
- a fallback;
- a fallback order;
- a prior;
- a shrinkage constant;
- a reference array;
- a percentile method;
- a component formula;
- a horizon weight;
- a scoring default;
- an EFO formula;
- an availability rule;
- a role-security rule;
- a confidence penalty;
- a volatility weight;
- an explanation priority;
- a rounding rule;
- a serialization rule;
- a test expectation.

If implementation reveals such a gap, the specification must be patched before the engine is considered conformant.

---

## 26.18 Implementation-equivalence tests

Two independent implementations are materially equivalent only if, for the same normalized input, scoring, references, model version, and fixed timestamp, they produce:

1. identical fallback codes;
2. component values equal before serialization within `1e-10`;
3. composite values equal before serialization within `1e-10`;
4. EFO values equal before serialization within `1e-10`;
5. confidence and volatility equal within `1e-10`;
6. identical labels;
7. identical explanation text and order;
8. byte-identical serialized golden output after defined rounding.

---

## 26.19 Accepted Version 1 limitations

Version 1 accepts that:

- reference arrays are provisional;
- CPOE may be unavailable and completion rate is a weaker fallback;
- designed-rush and scramble classification may require upstream derivation;
- team environment and protection context depend on upstream normalized composites;
- AY/A remains a practical Passing Quality metric; ordinary shrunk passing YPA is used separately for passing-yard projection;
- role-status inputs require objective maintenance;
- ROS return timing is approximate;
- no opponent adjustment exists;
- no multi-year EFO exists;
- no market information enters the intrinsic QB engine.

These limitations are explicit and do not create implementation ambiguity.

---

# IMPLEMENTATION-READINESS SUMMARY

The binding implementation contract defines:

- one public evaluator;
- exact input and output interfaces;
- units and validation;
- default and override scoring;
- literal QB reference distributions;
- percentile behavior;
- fallback dependency order;
- fallback codes and status;
- QB-specific priors and shrinkage;
- trend formulas;
- eight QB components;
- five horizon composites with weights summing to `1.00`;
- Weekly and ROS EFO;
- explicit availability and future-start treatment;
- confidence;
- volatility;
- explanation generation;
- calculation order;
- serialization;
- golden fixtures;
- invariant fixtures;
- implementation-equivalence tests.

No placeholders or TODOs are permitted in Version 1.

**Specification status:** Hardened and ready for independent implementation.


# PATCH SUMMARY

- **Sections changed:** document metadata; §§26.1, 26.2.3–26.2.5, 26.6.3A, 26.6.9, 26.10.2, 26.14–26.16, 26.19, and directly conflicting version/limitation text.
- **Issues resolved:** executable literal fixtures; objective assertions; AY/A/YPA projection separation; deterministic canonical JSON; `as_of` normalization; injectable `generated_at`; runtime option/scoring validation; deterministic `CUSTOM` reference metadata; relational input validation; explicit rushing shrinkage variables.
- **Fixture expectations minimally corrected:** subjective “materially” and exception-based language was replaced by exact inequalities or equality rules; paired injury, role, rushing, and age cases were frozen as complete literal inputs.
- **Final version:** document `v1.2`; default model version `qb-mvp-1.2`; schema versions unchanged; reference version remains `QB_REFERENCE_V1`.

---

# 27. §26.6.3-CA — Career anchor (methodology revision)

**Status:** revision to §26.6.3 and §26.6.9. Additive and backwards compatible: a caller that
supplies neither career input reproduces the pre-revision output byte for byte, which is why
every golden fixture in `tests/qb-model/` is unchanged.

## 27.1 Why

§26.6.3 regressed an eight-game window toward a prior built from draft round, and nothing else.
A quarterback's career was therefore invisible to Passing Quality: 1,680 career attempts counted
for exactly as much as 94. On the live board a career backup with one strong eight-game stretch
(94 career attempts, 12.8 AY/A) out-scored an established starter having a poor season (1,680
career attempts, 6.5 AY/A) and ranked QB1.

The principle this restores is the ordinary dynasty one: **career performance establishes the
baseline; recent performance adjusts it.**

## 27.2 Inputs

Two OPTIONAL nullable inputs. Omitted or null, the anchor degrades to the §26.6.2 draft prior.

```text
career_adjusted_yards_per_attempt   career AY/A on the §26.6.3 definition
career_rushing_yards_per_start      career rushing yards ÷ career starts
```

## 27.3 Formula

```text
n_anchor = max(0, career_sample − recent_sample)        // independent career evidence only
anchor   = shrink(career_rate, n_anchor, draft_prior, k_career)
k        = k_recent · (1 + n_anchor / k_career)
value    = shrink(recent_rate, recent_sample, anchor, k)
```

Applied to AY/A with `career_sample = career_pass_attempts`, `k_career = 500`, `k_recent = 250`;
and to rushing yards per start with `career_sample = career_starts`, `k_career = 16`,
`k_recent = 4`. When `career_rate` is null, `n_anchor = 0` and both stages collapse to §26.6.3.

## 27.4 Why the anchor excludes the recent window

The recent games are part of the career, so counting them on both sides would let a player whose
career *is* his recent window have that window twice — 74 of 94 career attempts would "anchor" a
quarterback to the same eight games then used to adjust him. Subtracting the recent sample leaves
the anchor holding only independent career evidence: 20 attempts for that backup, ~3,700 for an
established starter. The career *rate* still spans the whole career; only its weight is reduced,
which is the conservative direction.

## 27.5 Properties

- **Sample-size-aware throughout.** No player-specific term, no reputation, no multiplier.
- **Recent form is damped, never removed.** It keeps its own sample-size weight; an established
  record raises the bar for overturning it rather than closing the door.
- **Emerging quarterbacks stay responsive.** One full starting season (~550 attempts) produces an
  anchor already mostly the player's own, so a young riser moves quickly.
- Deterministic, and covered by `tests/qb-model/careerAnchor.test.ts`.

## 27.6 Career fields mean a career

`career_*` fields previously spanned only the ingested valuation window, so a decade-long starter
showed barely 46 career starts and silently failed the §3.4 48-start `ESTABLISHED_STARTER`
threshold. A refresh may now acquire extra seasons of **game stats only** (`careerSeasons` in the
source plan). Those seasons deepen the career of players the valuation window already selects;
they never add players, and no other position reads them.
