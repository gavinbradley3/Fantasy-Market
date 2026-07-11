# TE MVP Implementation Plan

## 1. Canonical specification authority

The sole TE runtime authority is `TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md` (copied verbatim
into the repository root). Within it, **Section 26 — Practical Hobby MVP Implementation
Contract** is the sole binding runtime specification. Sections 1–25 are explanatory and are
used only where Section 26 explicitly incorporates them. No other TE document exists in the
repository; none was consulted.

**Repository context finding:** at implementation start the repository contained only
`README.md`. The WR (`src/wr-model/`) and RB (`src/rb-model/`) engines referenced by the task
do not exist in this repository. The TypeScript/vitest platform is therefore scaffolded fresh
here, following the conventions the task attributes to the WR/RB platform (strict TypeScript,
deterministic engine API, fixture-driven goldens, `OK`/`PARTIAL` semantics). Platform
regression on WR/RB is vacuously satisfied and is reported honestly as such in the test
report. No WR/RB formula reuse is possible or performed.

## 2. Public API

```ts
function evaluateTightEnd(
  input: TEMVPInput,
  options?: {
    selected_horizon?: "WEEKLY" | "ROS" | "ONE_YEAR" | "THREE_YEAR" | "DYNASTY";
    reference_distributions?: TEReferenceDistributions;
    model_version?: string;
  }
): TEMVPOutput
```

Defaults: `selected_horizon = "WEEKLY"`, `reference_distributions = TE_MVP_V1_REFERENCE_DISTRIBUTIONS`
(`reference_version = "TE_REFERENCE_V1"`), `model_version = "te-mvp-1.0"`.

The selected horizon controls explanation weighting only. All five composites are always
returned. `evaluateTightEnd` (plus its input/output/reference types, error classes, and the
bundled reference constant) is the only public surface exported from `src/te-model/index.ts`.
Internal formula modules are not exported as alternative entry points.

## 3. Input and output interfaces

`TEMVPInput` and `TEMVPOutput` are copied field-for-field from Section 26.3 and Section 26.15
into `src/te-model/types.ts`. `schema_version` is the literal `"te-mvp-1.0"`.

## 4. Calculation order (binding, from Section 26.14)

1. Validate input, scoring object, options, and any explicitly supplied runtime reference
   object (reject on any Section 26.2.2 rule; bundled-reference failure is a fatal
   configuration error).
2. Trim and normalize identity/version strings.
3. Preserve all original nullable input values.
4. Resolve scoring defaults, selected-horizon default, model-version default, and the
   applicable reference object (custom object replaces the bundle per-evaluation; its missing
   named distributions are handled per Section 26.4, they do not merge with the bundle).
5. Compute draft-round and prospect-type priors required by fallback rules.
6. Resolve canonical RP4 and RP8 from original values (Section 26.5.2.1 mutual rule).
7. Resolve canonical Snap4.
8. Resolve canonical TPRR.
9. Compute `shrunk_TPRR`.
10. Resolve canonical target share using `shrunk_TPRR` (never unshrunk TPRR).
11. Resolve canonical QB environment.
12. Resolve canonical catchable-target rate (QB mapping uses canonical QB score).
13. Resolve all remaining canonical fallbacks (aDOT, RZ/EZ rates, catch rate, YPT, YPR, YAC,
    team dropbacks, points/drive, red-zone trips, competition, contract security, workload
    ramp).
14. Apply all remaining shrinkage formulas (catch rate, YPT, YPR, YAC, RZ rate, EZ rate).
15. Compute route trend, TPRR trend, and route consistency (missing history → neutral 50,
    no fallback entry).
16. Compute shared role/opportunity values (`blocking_gap`, `blocking_heavy_role`,
    `base_expected_routes`, `base_expected_targets`).
17. Compute every required percentile (shared mid-rank estimator; missing runtime
    distribution → percentile 50).
18. Compute all eight components with their gates, floors, and caps.
19. Compute all five horizon composites.
20. Compute availability (AV) and `Pactive = AV / 100`, with the inactive-list override.
21. Compute the current-ramp conditional active-game projection.
22. Compute the full-workload (ramp = 1.00) conditional active-game projection.
23. Compute Weekly EFO (`Pactive ×` current active-game fantasy points, applied once).
24. Compute recovery-aware ROS EFO (current ramp first expected active game only).
25. Compute confidence (100 minus unique ordered penalties).
26. Compute volatility and dependence ratios (from current active-game values).
27. Generate and order explanations using the selected horizon.
28. Determine `OK`/`PARTIAL`.
29. Round and serialize per Section 26.2.4.
30. Derive categorical labels from rounded scores.
31. Validate every serialized numeric output is finite and within its declared range.

This resolves the target-share/shrunk-TPRR cold-session dependency: target share is the only
fallback deferred until after `shrunk_TPRR` exists (steps 8–10), exactly as Section 26.5.3
directs. A focused regression test covers it.

## 5. Reference object and median

- `TE_MVP_V1_REFERENCE_DISTRIBUTIONS` is copied literally (all 16 arrays) into
  `src/te-model/references.ts` and deep-frozen (`Object.freeze` on the object and on every
  array). It lives in source, not in a JSON config file, so evaluation has no file-system
  dependency; the constant itself is the versioned configuration.
- Bundled validation (all arrays present, non-empty, finite, ascending, in-domain) runs at
  engine start; failure throws `TEConfigurationError` (fatal, never degrades to percentile 50).
- Reference median: reject non-finite values, sort a copy ascending, odd N → middle value,
  even N → mean of the two central values. Never mutates the input array.
- Runtime (caller-supplied) reference objects may be partial. Per named distribution: exists,
  is an array, contains ≥1 finite value → use its finite values; otherwise treat as missing →
  percentile 50 wherever consumed, one `REFERENCE_DISTRIBUTION:<name>` log entry with
  `fallback_used = "PERCENTILE_50"`, one 5-point penalty, `PARTIAL`.
- A custom object's `reference_version` must be non-empty after trimming or the evaluation is
  rejected.

## 6. Percentile standard

Shared mid-rank estimator for every percentile call:
`pct(x) = 100 × (count(strictly below) + 0.5 × count(exactly equal)) / N`, strict numeric
equality, no interpolation, clamp to [0,100]. One implementation in
`src/te-model/percentiles.ts`; no TE-specific variant.

## 7. Fallbacks (Section 26.5)

Full 20-row table implemented in `src/te-model/fallbacks.ts` with the exact `field` and
`fallback_used` closed enums of Section 26.5.8, one log entry and one penalty per canonical
field, serialized in canonical table order followed by missing reference distributions in
interface order. Mutual RP4/RP8 resolution uses only original inputs. The snap-share route
proxy is `clamp(original Snap4 × 0.72, 0, 0.85)` with the 15/12-point penalties and no extra
generic proxy penalty. Workload-ramp clamping of a supplied value is not a fallback. Missing
`previous_*` history is neutral, never logged.

## 8. Priors and shrinkage

- TPRR prior: draft-round base (0.205/0.195/0.185/0.175/0.165/0.160) + prospect adjustment
  (+0.015 RECEIVING, −0.015 BLOCKING_FIRST), clamped to [0.145, 0.225].
- Contract-security mapping: 1.00/0.82/0.65/0.45/0.26/0.20.
- Shrinkage (`n/(n+k)`): TPRR k=140 on career routes; catch rate k=120, YPT k=180, YPR k=160,
  YAC k=180, RZ rate k=120, EZ rate k=160 on career targets, with the exact neutral priors
  (0.68, 7.20, 10.60, 4.60, 0.18, 0.08) when the non-overlapping career value is null.
  No other signal is shrunk.

## 9. Trends

`route_trend = clamp(50 + 220 × (RP4 − previous_RP), 0, 100)`;
`tprr_trend = clamp(50 + 300 × (shrunk_TPRR − previous_TPRR), 0, 100)`;
`route_consistency = clamp(100 − 250 × |RP4 − RP8|, 0, 100)`; null history → 50.

## 10. Components, gates, caps

Exact Section 26.8 formulas: RR (with the single blocking gate `min(RR, 65)` when
`blocking_gap ≥ 0.25 and RP4 < 0.65`), TE (low-route cap `min(TE, 82)` when `RP4 < 0.45`),
TQ (volume gate `min(TQ_raw, 72)` when `base_expected_targets < 2.0`), RE (sample caps
[25,75] / [15,85] / [0,100] by career targets), TC, RD, AD (discrete age table), AV (status
lookup). Competition pressure is consumed only by TC, RD, volatility, and explanations.

## 11. Horizon weights

The exact Section 26.9 table, component order `RR, TE, TQ, RE, TC, RD, AD, AV`; every row
sums to 1.00; `composite = Σ(component × weight)`. Composites never feed EFO.

## 12. Weekly and ROS projections

`calculate_active_game(ramp)` exactly as Section 26.10.2 (catch-rate blend with depth and QB
adjustments clamped [0.42, 0.88]; YPR blend with depth and YAC terms and the YPT consistency
cap, clamped [6.0, 18.0]; TD chain `0.040 × rz_factor × ez_factor × team_scoring_factor`
clamped [0.015, 0.095]). Weekly conditional stats use the effective ramp and exclude
`Pactive`; `weekly.expected_fantasy_points = Pactive × current_active_game.fp`. ROS:
`expected_active_games = expected_games_remaining × Pactive`; first expected active game at
current ramp, remainder at full workload. OUT/IR/PUP/SUSPENDED: AV=0, Pactive=0,
effective ramp=0, Weekly EFO=0, expected active games=0, ROS EFO=0.

## 13. Confidence

Start 100; subtract unique fallback penalties, missing-reference penalties (5 each), and the
non-fallback penalties (career-route tiers 15/10/6 mutually exclusive; UNKNOWN enums;
new-team 8; another-receiving-TE 6; missing team 5). Codes `FALLBACK:<field>`,
`MISSING_REFERENCE:<name>`, and the ten fixed codes, serialized in the binding order.
Confidence never changes any model output.

## 14. Volatility

Exact Section 26.12 formula using current active-game values (not Pactive-weighted),
`td_dependence`, `explosive_dependence`, `prior_weight = 140/(career_routes+140)`, flag
terms; clamp [0,100]; dependence ratios serialized to one decimal.

## 15. Explanations

Direct rules 1–10 evaluated in order, then component drivers
(`(score − 50) × horizon_weight`, candidates at |1.0|). Direct before component; topics
claimed in direct rule order first, then by component candidates in descending
|weighted_driver| (exact tie prefers negative); one topic never appears in both arrays;
max three per side; fixed templates only.

## 16. Serialization and validation

Full precision internally; one-decimal rounding for components, composites, projections,
confidence, volatility, dependence; three decimals for `weekly.probability_active` and
`weekly.workload_ramp_factor`; labels derived from rounded values; final finiteness/range
check on every serialized numeric.

## 17. File layout

```
src/te-model/{index,types,errors,constants,validation,references,percentiles,priors,
              fallbacks,shrinkage,trends,components,composites,projections,confidence,
              volatility,explanations,serialization,engine}.ts
fixtures/te/*.json + fixtures/te/expected/*.json
tests/te-model/*.test.ts
scripts/generate-te-goldens.ts
docs/{TE_MVP_IMPLEMENTATION_PLAN,TE_MVP_IMPLEMENTATION_DECISIONS,TE_MVP_TEST_REPORT}.md
```

## 18. Fixture plan (13 inputs, all fictional)

elite-receiving-focal-point, full-time-balanced, blocking-heavy-starter,
red-zone-specialist, low-route-high-tprr, young-breakout, committee-tight-end,
aging-veteran, injury-return, out-player, missing-data, equal-snaps-low-routes,
equal-snaps-high-routes — each matching the directional expectations in the task and
Section 26.16.6/26.16.7. Golden outputs are generated by the approved implementation after
formula tests pass, never hand-edited.

## 19. Test plan

One test file per module plus fixtures, invariants, and platform-compatibility suites,
covering every mandatory test in Sections 26.16.1–26.16.5 and 26.16.10, the paired
equal-snap invariant (26.16.7), the target-share/shrunk-TPRR dependency regression, fallback
ordering/uniqueness, confidence code ordering, explanation rules, determinism
(byte-equivalent repeat evaluation), and golden comparison of every serialized field.

## 20. Shared utilities vs TE-specific modules

No position-neutral shared helpers exist yet in the repository (no WR/RB code), so all
modules live under `src/te-model/`. The percentile estimator, median, clamp, and rounding
helpers are written position-neutrally and could be lifted to a shared location when a second
engine lands. All football logic (route/target chain, blocking gate, TD chain, TE age curve)
is TE-specific.

## 21. Out of scope

Live NFL data, Sleeper/nflverse adapters, network access, databases, auth, UI, real players,
market prices/trade values/ADP/rankings, scarcity or TE-premium logic, over/under-valued
classification, Monte Carlo, Bayesian libraries, ML, proprietary route/blocking feeds,
backtesting, automated reference recalibration, opponent adjustments, One-Year/Three-Year/
Dynasty EFO, AI-generated explanations, formula tuning to make fixtures "look" intuitive.
