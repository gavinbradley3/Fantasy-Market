# WR MVP Implementation Plan

**Binding authority:** Section 26 of `WR_VALUATION_MODEL_v1.2_FINAL.md` — the *sole* implementation
contract. Sections 1–25 are research rationale only. Where §26 simplifies an earlier section, §26
controls without exception.

**Scope:** an isolated, deterministic WR valuation engine that maps one `WRMVPInput` → one
`WRMVPOutput`. No Monte Carlo, no transition matrices, no live APIs, no market/trade/mispricing, no
multi-year EFO simulation. It lives beside — and shares nothing with — the existing PlayerTicker
market app.

**Path adaptation (repo fit):** the repo is a Vite + Vitest project whose tests are co-located and
picked up by `include: ['src/**/*.test.{ts,tsx}']`. To keep the separation of concerns the prompt
asks for while fitting this convention, the engine, its JSON config, and its fixtures live under
`src/wr-model/`, tests are co-located as `src/wr-model/**/*.test.ts`, and the three docs live under
`docs/`. This is the only structural deviation from the prompt's preferred top-level layout.

---

## 1. Binding input schema (§26.3)

`WRMVPInput` exactly as printed in §26.3 — 30 fields incl. optional `scoring` vector and
`as_of_timestamp`. Stored verbatim in `types.ts`. No field added.

## 2. Binding output schema (§26.15)

`WRMVPOutput` exactly as printed in §26.15: `schema_version:"wr-mvp-1.0"`, `model_version`,
identity + `as_of_timestamp`, `components{RR,TE,TQ,EF,TC,RD,AD,AV}`,
`composites{WEEKLY,ROS,ONE_YEAR,THREE_YEAR,DYNASTY}`, `weekly{...7 fields}`, `ros{...2}`,
`confidence{score,label,penalties[]}`, `volatility{score,label}`,
`explanations{positive_drivers[],negative_drivers[]}`, `fallback_log[]`, `status`.

## 3. Calculation sequence (§26.14 — implemented in exactly this order)

1. Validate required schema (§26 §5 rules).
2. Apply field fallbacks (§26.5), building the fallback log + penalty tally.
3. Apply TPRR and efficiency shrinkage (§26.6).
4. Compute route + TPRR trend scores (§26.7).
5. Convert required signals to percentiles (§26.4).
6. Compute RR, TE, TQ, EF, TC, RD, AD, AV (§26.8).
7. Compute all five horizon composites (§26.9).
8. Compute Weekly + ROS expected stats and fantasy points (§26.10).
9. Compute confidence + volatility (§26.11, §26.12).
10. Generate explanation drivers for the selected horizon (§26.13).
11. Range-validate and return the record (§26.15).

## 4. Fallback table (§26.5) — applied in the printed order, penalties summed for confidence

| Field | Primary | First fallback | Final fallback | Penalty |
|---|---|---|---|--:|
| RP4 | `route_participation_last4` | RP8 | `0.50` | 8 |
| RP8 | `route_participation_last8` | RP4 | `0.50` | 8 |
| TPRR | `targets_per_route_run` | `career_targets_per_route_run` | `0.18` | 10 |
| Target share | `target_share` | `RP4 × TPRR` capped `0.35` | `0.12` | 6 |
| xFP/target | `expected_fantasy_points_per_target` | `career_expected_fantasy_points_per_target` | ref median | 8 |
| CROE | `catch_rate_over_expected` | — | `0.00` | 5 |
| Depth-adj Y/T | `depth_adjusted_yards_per_target` | — | ref median | 5 |
| aDOT | `average_depth_of_target` | — | `10.0` | 3 |
| xTD/target | `expected_td_rate_per_target` | — | `0.05` | 5 |
| Team dropbacks | `projected_team_dropbacks` | ref median | `34.0` | 5 |
| QB env | `qb_environment_score` | neutral | `50` | 8 |
| Points/drive | `team_points_per_drive` | ref median | `1.90` | 5 |
| Contract security | `contract_security` | draft-round map | `0.40` | 4 |
| Competition pressure | `competition_pressure` | neutral | `0.50` | 4 |

Draft-round security map: R1 1.00 · R2 0.80 · R3 0.65 · R4–5 0.45 · R6–7 0.25 · UDFA/unknown 0.20.
Every fallback is logged once; the penalty is applied once. Any fallback ⇒ `status = "PARTIAL"`.
`previous_route_participation` / `previous_targets_per_route_run` are **not** §26.5 fields — their
absence is handled by the §26.7 neutral-50 trend rule with no penalty and no log entry (Decision 3).

## 5. Shrinkage formulas (§26.6)

TPRR: `sample_weight = career_routes/(career_routes+150)`; `prior_weight = 1 − sample_weight`;
`shrunk_TPRR = sample_weight·TPRR + prior_weight·prior`. Prior by round: R1 .21 · R2 .20 · R3 .19 ·
R4–5 .18 · R6–7/UDFA/unknown .17. (No extra prospect blend at ≥300 routes; the formula already
converges.)

Efficiency (CROE, depth-adj Y/T): `sample_weight = career_routes/(career_routes+250)`;
`shrunk = sample_weight·observed + (1−sample_weight)·neutral`. Neutral: CROE `0.00`; depth-adj Y/T =
reference-distribution median. No other signal is shrunk.

## 6. Component formulas (§26.8) — all clamped [0,100]

- **RR** = 0.60·pct(RP4) + 0.25·pct(RP8) + 0.15·route_trend_score
- **TE** = 0.75·pct(shrunk_TPRR) + 0.15·pct(target_share) + 0.10·tprr_trend_score
- **TQ**: `TQ_raw = pct(xFP/target)`; deep-target cap → `TQ = min(TQ_raw,65)` iff `aDOT≥15 ∧
  shrunk_TPRR<0.18 ∧ CROE<0`, else `TQ_raw`.
- **EF** = 0.55·pct(shrunk_CROE) + 0.45·pct(shrunk_depth_adj_Y/T); clamp `[20,80]` if
  `career_routes<200`, else `[0,100]`.
- **TC** = 0.45·pct(dropbacks) + 0.35·qb_environment_score + 0.20·pct(points/drive). (QBenv is
  already 0–100; not percentiled.)
- **RD** = clamp(50 + 20·contract_security − 20·competition_pressure + role_change_adj +
  age_security_adj). role_change: +12 PROMOTED / −12 DEMOTED / 0 else. age_security: +5 (≤25) /
  0 (26–28) / −5 (29–30) / −10 (≥31).
- **AD**: base by age band [21–22 78 · 23 74 · 24–26 68 · 27–28 58 · 29–30 45 · 31–32 30 · 33+ 18];
  +5 when `nfl_seasons_completed ∈ {1,2}`; clamp.
- **AV**: HEALTHY 98 · QUESTIONABLE{FULL 85, LIMITED 70, DNP/UNKNOWN 45} · DOUBTFUL 15 ·
  OUT/IR/PUP/SUSPENDED 0 · UNKNOWN 75. (Injury status is primary; practice refines QUESTIONABLE only.)

## 7. Horizon weights (§26.9) — component order RR,TE,TQ,EF,TC,RD,AD,AV; each row sums to 1.00

| Horizon | RR | TE | TQ | EF | TC | RD | AD | AV |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Weekly | .22 | .22 | .10 | .06 | .15 | .05 | .02 | .18 |
| ROS | .20 | .22 | .10 | .08 | .12 | .13 | .05 | .10 |
| One Year | .17 | .22 | .10 | .09 | .10 | .18 | .10 | .04 |
| Three Years | .13 | .20 | .09 | .09 | .06 | .21 | .18 | .04 |
| Dynasty | .10 | .18 | .08 | .08 | .04 | .23 | .25 | .04 |

`composite[h] = Σ_c component_c · weight_{h,c}` (full-precision components).

## 8. EFO formulas (§26.10) — deterministic expected values

```
Pactive = AV/100
expected_routes = projected_team_dropbacks × RP4
expected_targets = expected_routes × shrunk_TPRR
base_catch_rate = 0.68 − 0.012 × max(aDOT − 8, 0)
expected_catch_rate = clamp(base_catch_rate + shrunk_CROE, 0.35, 0.85)
expected_yards_per_reception = clamp(7.0 + 0.55×aDOT + shrunk_depth_adj_Y/T, 6.0, 22.0)
expected_receptions = expected_targets × expected_catch_rate
expected_receiving_yards = expected_receptions × expected_yards_per_reception
expected_receiving_tds = expected_targets × expected_td_rate_per_target
active_game_fantasy_points = rec×ppr + yards×ppy + tds×pptd
weekly_EFO = Pactive × active_game_fantasy_points
expected_active_games_remaining = expected_games_remaining × Pactive
ROS_EFO = expected_active_games_remaining × active_game_fantasy_points
```
`expected_routes` uses **RP4** (post-fallback), not shrunk RP. Stat expectations are
active-game-conditional (no Pactive factor); only `weekly_EFO`/`ROS_EFO` and
`expected_active_games` carry Pactive. One-Year/Three-Year/Dynasty EFO are deferred — composites only.

## 9. Confidence rules (§26.11)

Start 100; subtract summed §26.5 fallback penalties; then subtract 15 (`career_routes<100`) **or**
8 (`100–299`) [mutually exclusive tiers]; 10 (`injury_status==UNKNOWN`); 10
(`route_role_change==UNKNOWN`); 5 (`team==null`). Also −5 per §26.4 missing-reference event (none in
MVP fixtures). `score = clamp(100−penalties,0,100)`. Labels: HIGH 80–100 · MEDIUM 60–79.999 · LOW
0–59.999. Confidence never affects components or EFO.

## 10. Volatility rules (§26.12)

```
20×(1−RP4) + 20×min(aDOT/20,1) + 20×min(prior_weight,1)
+ 15 if injury_status ∈ {QUESTIONABLE, UNKNOWN}
+ 15 if route_role_change ∈ {PROMOTED, DEMOTED, UNKNOWN}
+ 10 if career_routes < 200
```
`prior_weight` is the TPRR shrinkage prior weight. clamp[0,100]. Labels: LOW 0–32.999 ·
MEDIUM 33–65.999 · HIGH 66–100.

## 11. Explanation rules (§26.13)

Per component: `deviation = score − 50`; `weighted = deviation × horizon_weight[selected]`. Positive
drivers sorted by largest positive `weighted`; negative by most negative; ≤3 each; omit
`|weighted| < 1.0`. Plain-language template per component (positive/negative variants); never claims
proof of future performance. Weekly and Dynasty differ because weights differ.

## 12. Public API (§11 of prompt)

```ts
evaluateWideReceiver(input, { selected_horizon?="WEEKLY", reference_distributions?=bundled,
  model_version?="wr-mvp-1.0" }): WRMVPOutput
```
Selected horizon controls explanation weighting only; all five composites always returned.

## 13. File structure

```
src/wr-model/
  index.ts            public exports (evaluateWideReceiver + types)
  types.ts            WRMVPInput, WRMVPOutput, enums, WRReferenceDistributions
  constants.ts        every numeric constant, each tagged to a §26 rule
  config/wr-reference-distributions.json   the §26.4 reference table (version wr-reference-1.0)
  referenceDistributions.ts   typed loader for the bundled table
  validation.ts       schema + range validation (§5 of prompt), ValidationError
  percentiles.ts      empirical mid-rank pct (Decision 1)
  fallbacks.ts        §26.5 resolution + fallback log + penalty tally
  shrinkage.ts        §26.6 TPRR + efficiency shrinkage
  trends.ts           §26.7 route + TPRR trend scores
  components.ts       §26.8 RR..AV
  composites.ts       §26.9 five composites
  projections.ts      §26.10 weekly + ROS EFO
  confidence.ts       §26.11
  volatility.ts       §26.12
  explanations.ts     §26.13
  engine.ts           orchestrates §26.14 order; rounds output for serialization
  rounding.ts         per-field serialization rounding (stable snapshots)
  fixtures/wr/*.json + fixtures/wr/expected/*.expected.json
  *.test.ts           co-located unit/invariant/fixture tests
docs/  WR_MVP_IMPLEMENTATION_PLAN.md · WR_MVP_IMPLEMENTATION_DECISIONS.md · WR_MVP_TEST_REPORT.md
```

## 14. Test strategy

Pure-function unit tests (validation, percentiles, shrinkage, trends, components, composites,
projections, confidence, volatility, explanations) assert §26 math at full precision with tolerance.
Invariant tests assert the §9 formula/monotonicity properties. Fallback/shrinkage/gate/confidence/
volatility tests cover every §26.5 row and each gate condition. Fixture tests assert the §7–8
behavioral expectations that the faithful §26 implementation satisfies. **Only after** all formula
tests pass are the five golden snapshots generated from the approved implementation and locked; a
snapshot test then reproduces them exactly. Snapshots are never hand-edited.

## 15. Blocking contradictions found in §26

None that prevent implementation. §26 is internally complete and consistent. One **non-blocking**
conflict between a prompt fixture *expectation* and a §26 *formula* is recorded in
`WR_MVP_IMPLEMENTATION_DECISIONS.md` (Decision 2, deep-threat volatility): §26.12 controls, so the
faithful output is LOW volatility for that fixture and the conflicting expectation is not asserted.
