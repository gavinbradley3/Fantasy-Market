# RB MVP Implementation Plan

Deterministic Running Back valuation engine built from **Section 26** of
`RB_VALUATION_MODEL_v1.1_FINAL.md`. Section 26 is the sole binding authority; Sections 1–25 are
non-binding rationale. Where §26 differs from earlier sections, §26 controls without exception.

This engine reuses the **platform standard** established by the completed WR MVP (`src/wr-model/`):
strict typing, validation style, the deterministic public-engine shape, the percentile helper
behavior, the fallback-log shape, confidence/volatility label derivation, horizon enum names,
metadata conventions, serialization rules, the golden-fixture workflow, and the testing style. It
does **not** reuse WR football formulas — RB opportunity, efficiency, durability, and EFO math are
position-specific and live in a separate `src/rb-model/` module. No universal football model is
created.

## 1. Public API (§26.1)

```ts
function evaluateRunningBack(
  input: RBMVPInput,
  options?: {
    selected_horizon?: "WEEKLY" | "ROS" | "ONE_YEAR" | "THREE_YEAR" | "DYNASTY";
    reference_distributions?: RBReferenceDistributions;
    model_version?: string;
  }
): RBMVPOutput
```

Defaults: `selected_horizon = "WEEKLY"`, `reference_distributions = bundled rb-reference-1.0`,
`model_version = "rb-mvp-1.0"`. The selected horizon controls **explanation-driver weighting only**;
all five composites are always returned. One entry point — no per-horizon entry points.

The engine returns (§26.1): eight component scores 0–100; five internal horizon composites;
conditional-on-active Weekly rushing + receiving statistics; unconditional Weekly EFO; recovery-aware
ROS EFO; confidence score/label/penalties; volatility score/label/dependence measures; up to three
positive and three negative explanations; fallback log + status; schema/model/reference/timestamp
metadata.

## 2. Module layout (mirrors `src/wr-model/`)

```
src/rb-model/
  types.ts               // RBMVPInput, RBMVPOutput, RBReferenceDistributions (§26.3, §26.4, §26.15)
  constants.ts           // every numeric constant, tagged to its §26 rule
  math.ts                // clamp, median, isFiniteNumber  (shared-behavior utilities)
  rounding.ts            // round(value, decimals) + PRECISION map (§26.2.4)
  validation.ts          // RBValidationError; §26.2.2 rejects
  percentiles.ts         // percentileRank + pct(onMissingReference) + referenceMedian (§26.4)
  fallbacks.ts           // §26.5 table, in order, one log + one penalty per canonical field
  shrinkage.ts           // §26.6 six shrinkage rules
  trends.ts              // §26.7 snap/carry/route trend + workload_trend_score
  components.ts          // §26.8 WRK, OQ, RE, RU, TC, RD, AD, AV + shared derived values
  composites.ts          // §26.9 five horizon composites
  projections.ts         // §26.10 active-game function, Weekly EFO, ROS recovery-aware EFO
  confidence.ts          // §26.11 confidence + label
  volatility.ts          // §26.12 volatility + dependence measures + label
  explanations.ts        // §26.13 direct + component-driver merge/order for selected horizon
  engine.ts              // §26.14 calc order; rounds output; labels from rounded score
  index.ts               // public surface
  referenceDistributions.ts   // freezes config/rb-reference-distributions.json
  config/rb-reference-distributions.json   // bundled rb-reference-1.0
  fixtures/rb/*.json + fixtures/rb/expected/*.expected.json   // 10 golden fixtures
  testutil.ts            // fs-based loadFixture/loadExpected + PRIMARY_FIXTURES
  *.test.ts              // §26.16 co-located tests (repo convention)
scripts/generate-rb-snapshots.mts   // golden generator; run only after formula tests pass
docs/RB_MVP_IMPLEMENTATION_PLAN.md / _DECISIONS.md / _TEST_REPORT.md
```

Shared utilities (`clamp`, `median`, `isFiniteNumber`, mid-rank `percentileRank`, the `round` helper)
are behaviorally identical to WR, but are re-declared inside `rb-model` to keep the module
self-contained and independently versioned — the prompt permits shared utilities "only where behavior
is genuinely identical," and these are copied rather than imported to avoid coupling the two engines'
release cadence. All RB formulas and data structures are separate.

## 3. Calculation order (§26.14 — implemented verbatim in `engine.ts`)

1. Validate `RBMVPInput`, options, scoring, reference configuration.
2. Capture original nullable input values for fallback resolution.
3. Apply each canonical field fallback once → de-duplicated fallback log.
4. Resolve default scoring and model/reference metadata.
5. Compute draft-round TPRR prior and contract-security mapping.
6. Apply shrinkage (TPRR, YPC, success rate, explosive rate, catch rate, rec yds/reception).
7. Compute neutral-or-observed trend scores.
8. Compute pre-component base expected carries, routes, targets, OQ touches.
9. Compute all named percentiles with the §26.4 estimator.
10. Compute WRK, OQ, RE, RU, TC, RD, AD, AV.
11. Compute all five horizon composites.
12. Compute current-ramp and full-workload active-game statistics.
13. Compute unconditional Weekly EFO and recovery-aware ROS EFO.
14. Compute unique confidence penalties and rounded confidence label.
15. Compute volatility, dependence values, rounding, label.
16. Generate explanations using the selected horizon.
17. Set `status` from fallback usage.
18. Serialize with required rounding.
19. Validate every output is finite and within its declared range.
20. Return `RBMVPOutput`.

No simulation, hidden smoothing, return-date inference, fitted transitions, or market data.

## 4. Key position-specific rules

- **Percentile estimator (§26.4):** `pct(x) = 100 × (count(<x) + 0.5·count(==x)) / N`, clamp [0,100],
  no interpolation. Missing/empty/all-non-finite distribution → percentile 50, one fallback-log
  entry, one −5 confidence penalty, status PARTIAL. `expected_targets_per_game` is a distinct
  reference array (not TPRR or target-share).
- **Fallbacks (§26.5):** resolved against the **original** input record; mutual Snap4↔Snap8 uses
  original values; one penalty and one log entry per canonical field; any fallback → PARTIAL.
  Booleans have no fallback rows (normalization layer must supply them).
- **Shrinkage (§26.6):** six rules with `w = n/(n+k)`; non-overlapping career priors used only when
  the layer confirms exclusion of the current season, else neutral priors (YPC 4.20, catch 0.78,
  RYPR 7.50).
- **Components (§26.8):** WRK, OQ, RE, RU, TC, RD, AD, AV. OQ low-touch cap uses `projected_touches_for_OQ`
  (base carries + base targets, **before** QB adjustment and ramp). RE has an explosive-band clamp
  (±8 around `RE_base + 7.5`) then a sample-size clamp by career carries. AV drives Pactive.
- **EFO (§26.10):** `calculate_active_game(ramp)` builds all conditional stats. QB rush pressure
  reduces carries (`1 − 0.20·pressure`) and rush TDs (`qb_goal_line_factor = 1 − 0.30·pressure`).
  Weekly stats include ramp but are **not** multiplied by Pactive; `weekly.expected_fantasy_points =
  Pactive × current_active_game_fp` (Pactive applied exactly once). ROS applies the reduced ramp to
  only the first expected active game; later games use full workload. OUT/IR/PUP/SUSPENDED → all
  zeros.
- **Confidence (§26.11):** start 100, subtract unique fallback + missing-reference penalties, then
  career-touch tiers and the listed situational deductions. Never changes EFO/components/composites.
- **Volatility (§26.12):** uses current active-game outputs (not Pactive-weighted) for TD dependence
  and receiving dependence; `prior_weight = 120/(120 + career_routes + career_carries)`.
- **Serialization (§26.2.4):** full precision internally; components, composites, projections,
  confidence, volatility, TD/receiving dependence → 1 decimal; `probability_active` and
  `workload_ramp_factor` → 3 decimals; **confidence/volatility labels derived from the rounded score.**

## 5. Golden-fixture workflow (§26.16.11)

Ten fictional fixtures: elite three-down bell cow, goal-line TD specialist, receiving specialist,
committee back, explosive rookie, aging veteran, injury-return player, out player, missing-data
player, mobile-QB pressure comparison (a matched pair used to prove the QB-pressure invariant).

Workflow: implement formulas → write formula/invariant assertions → run and fix at source → write
fixture tests → inspect outputs → generate golden JSON via `scripts/generate-rb-snapshots.mts` →
save → rerun → confirm reproducibility. Golden outputs are generated **only after** formula-level
tests pass and are **never** hand-edited. Future code must reproduce them unless `model_version` or
`reference_version` changes.

## 6. Determinism & scope guarantees

No randomness, no clock reads (`as_of_timestamp` comes from input), no network, no hidden state, no
mutable config. Not built: live APIs, real data, DB, auth, UI, Monte Carlo, Bayesian, transition
matrices, opponent matchup, backtesting, market/trade/ADP/ranks, One/Three/Dynasty fantasy-point
projections (composites only for long horizons), AI explanations, RB-to-WR comparisons.

## 7. Verification gates

`npx vitest run src/rb-model`, `npx vitest run src/wr-model` (must remain green — WR engine
unchanged), `npm test`, `npm run typecheck`, `npm run build`. No existing test is deleted or weakened.
