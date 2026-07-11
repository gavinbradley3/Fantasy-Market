# TE MVP Test Report

Date: 2026-07-11 (verification run)
Branch: `claude/te-mvp-engine-c63eus`

## 1. Specification authority

`TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md` was the **sole** TE runtime authority. Within
it, Section 26 (Practical Hobby MVP Implementation Contract) was the sole binding
specification; Sections 1–25 were used only as context. No other TE document exists in the
repository and none was consulted, merged, or created. The frozen specification was copied
verbatim into the repository root without renaming.

**Repository context finding:** the repository contained only `README.md` at implementation
start. The WR (`src/wr-model/`) and RB (`src/rb-model/`) engines referenced by the task do
not exist here, so the TypeScript/vitest platform was scaffolded fresh and all WR/RB
regression items are vacuously satisfied (nothing existed to change or weaken). This is
recorded in `docs/TE_MVP_IMPLEMENTATION_DECISIONS.md`.

## 2. Build summary

**Files created**

- Platform: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`
- Spec copy: `TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md`
- Engine (`src/te-model/`): `index.ts`, `types.ts`, `errors.ts`, `constants.ts`,
  `validation.ts`, `references.ts`, `percentiles.ts`, `priors.ts`, `fallbacks.ts`,
  `shrinkage.ts`, `trends.ts`, `components.ts`, `composites.ts`, `projections.ts`,
  `confidence.ts`, `volatility.ts`, `explanations.ts`, `serialization.ts`, `engine.ts`
- Fixtures: 13 inputs under `fixtures/te/`, 13 goldens under `fixtures/te/expected/`
- Tests: 16 suites under `tests/te-model/` plus `helpers.ts`
- Tooling: `scripts/generate-te-goldens.ts`
- Docs: `TE_MVP_IMPLEMENTATION_PLAN.md`, `TE_MVP_IMPLEMENTATION_DECISIONS.md`, this report

**Files modified:** none (repository previously contained only `README.md`, untouched).

**Public API:** `evaluateTightEnd(input, options?)` — the single public engine entry point,
exported from `src/te-model/index.ts` with its types, error classes, and the bundled
reference constant. Internal formula modules are not exported as alternative APIs.

**Model version:** `te-mvp-1.0` (default; schema_version `te-mvp-1.0`).
**Reference version:** `TE_REFERENCE_V1` — all 16 arrays copied literally, deep-frozen,
validated at engine start; documented as provisional implementation constants, not
empirically calibrated league truth.

**Shared helpers used:** none pre-existed. Position-neutral helpers written here
(`pct`, `clamp`, `roundTo`, `referenceMedian`) are candidates for a future shared module.
**TE-specific modules:** everything else — route/target chain, blocking gate, TD chain,
TE age curve, TE priors, TE fallback table.

## 3. Test summary

| Command | Result |
|---|---|
| `npx vitest run tests/te-model` (TE suite) | **220 passed, 0 failed, 0 skipped** (16 files) |
| `npx vitest run src/te-model` | no test files (repo convention keeps tests in `tests/`) |
| `npx vitest run src/wr-model` | no test files — WR engine does not exist in this repository |
| `npx vitest run src/rb-model` | no test files — RB engine does not exist in this repository |
| `npm test` (full repository) | **220 passed, 0 failed, 0 skipped** |
| `npm run typecheck` (`tsc --noEmit`, strict) | **pass** |
| `npm run build` (`tsc -p tsconfig.build.json`) | **pass** (emits `dist/`) |
| Golden regeneration (`npm run generate:te-goldens` ×2, `sha256sum` diff) | **byte-identical hashes** |

Lint: the repository has no lint configuration; none was added or altered (per task §18).

Coverage highlights: all Section 26.16.1 formula/invariant tests, 26.16.2 TE-specific tests,
26.16.3 fallback tests (every row, order, uniqueness, one-time penalties), 26.16.4
explanation tests, 26.16.5 validation rejections, 26.16.7 paired equal-snap invariant with
the exact 1.50 ratios at 1e-9 relative tolerance, and all 28 implementation-equivalence
tests of 26.16.10 that apply to a TypeScript build.

## 4. Fixture table

Component order: RR / TE / TQ / RE / TC / RD / AD / AV. WKLY/DYN are the Weekly and Dynasty
composites. FB = fallback count.

| Fixture | Weekly EFO | ROS EFO | RR | TE | TQ | RE | TC | RD | AD | AV | WKLY | DYN | Conf | Vol | Status | FB | Strongest positive | Strongest negative |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|---|--:|---|---|
| elite-receiving-focal-point | 18.0 | 144.0 | 87.2 | 80.8 | 82.0 | 64.2 | 81.7 | 81.7 | 68 | 98 | 84.5 | 77.6 | 100 HIGH | 13.9 LOW | OK | 0 | Runs routes on most team dropbacks. | — |
| full-time-balanced | 7.6 | 60.8 | 67.4 | 51.2 | 68.3 | 50.0 | 54.3 | 66.2 | 73 | 98 | 66.5 | 65.4 | 100 HIGH | 19.7 LOW | OK | 0 | Current availability supports the weekly outlook. | — |
| blocking-heavy-starter | 2.3 | 18.2 | 36.1 | 21.9 | 53.8 | 32.5 | 38.7 | 53.9 | 63 | 98 | 46.9 | 48.9 | 100 HIGH | 29.7 LOW | OK | 0 | Current availability supports the weekly outlook. | A blocking-heavy role limits receiving volume. |
| red-zone-specialist | 6.2 | 49.3 | 49.4 | 40.7 | 86.3 | 37.2 | 72.8 | 59.9 | 57 | 98 | 62.8 | 56.8 | 100 HIGH | 26.0 LOW | OK | 0 | Red-zone usage supports touchdown opportunity. | Target earning is below the TE reference group. |
| low-route-high-tprr | 7.3 | 58.5 | 39.1 | 72.5 | 71.4 | 61.1 | 59.5 | 75.5 | 88 | 98 | 66.4 | 74.1 | 100 HIGH | 38.2 MEDIUM | OK | 0 | Earns targets at a strong rate when in a route. | Limited route usage constrains the outlook. |
| young-breakout | 8.4 | 75.4 | 60.4 | 66.7 | 66.0 | 46.4 | 62.7 | 87.3 | 95 | 98 | 70.4 | 78.4 | 79 MEDIUM | 38.3 MEDIUM | PARTIAL | 1 | Current availability supports the weekly outlook. | — |
| committee-tight-end | 5.2 | 41.2 | 49.6 | 43.2 | 63.8 | 43.3 | 46.1 | 38.5 | 73 | 98 | 57.0 | 54.4 | 94 HIGH | 35.4 MEDIUM | OK | 0 | Current availability supports the weekly outlook. | Another receiving option creates meaningful route and target competition. |
| aging-veteran | 11.5 | 92.2 | 75.0 | 66.4 | 78.2 | 55.0 | 70.7 | 66.5 | 31 | 98 | 74.4 | 58.9 | 100 HIGH | 15.4 LOW | OK | 0 | Runs routes on most team dropbacks. | — |
| injury-return | 4.8 | 36.4 | 64.7 | 63.6 | 74.1 | 55.0 | 61.6 | 75.0 | 68 | 68 | 65.6 | 67.9 | 100 HIGH | 28.2 LOW | OK | 0 | Current route usage supports the outlook. | — |
| out-player | 0.0 | 0.0 | 60.1 | 53.6 | 67.7 | 46.4 | 49.9 | 69.2 | 81 | 0 | 48.0 | 63.6 | 96 HIGH | 18.0 LOW | PARTIAL | 1 | Current route usage supports the outlook. | Current availability materially lowers the weekly outlook. |
| missing-data | 2.7 | 25.8 | 44.4 | 39.0 | 61.2 | 45.4 | 50.0 | 43.0 | 84 | 72 | 51.2 | 56.4 | 0 LOW | 54.1 MEDIUM | PARTIAL | 20 | Current availability supports the weekly outlook. | Target earning is below the TE reference group. |
| equal-snaps-low-routes | 6.2 | 49.4 | 47.9 | 58.3 | 68.1 | 50.0 | 55.6 | 65.2 | 73 | 98 | 63.3 | 64.6 | 100 HIGH | 24.4 LOW | OK | 0 | Current availability supports the weekly outlook. | A blocking-heavy role limits receiving volume. |
| equal-snaps-high-routes | 9.3 | 74.1 | 67.3 | 58.3 | 68.1 | 50.0 | 55.6 | 71.2 | 73 | 98 | 68.4 | 67.8 | 100 HIGH | 17.6 LOW | OK | 0 | Runs routes on most team dropbacks. | — |

Notes on the two `PARTIAL`s outside missing-data: young-breakout carries the intended
missing `catchable_target_rate` fallback; out-player supplies a null workload ramp, so the
status/practice lookup logs the documented `WORKLOAD_RAMP_FACTOR` fallback (Section 26.5.5).
The equal-snaps invariant holds: 9.3 / 6.2 serialized, exact 1.50 pre-serialization ratios
verified at 1e-9 relative tolerance; the low-route twin also correctly trips the blocking
gate (Snap4 0.82, RP4 0.52 → gap 0.30).

## 5. TE-specific verification

- **Snap share vs route participation:** distinct inputs, distinct reference arrays; the
  equal-snap pair proves identical snaps with different routes produce materially different
  RR, routes, targets, and EFO.
- **Blocking snaps never create receiving volume:** the blocking-heavy starter holds 0.92
  snap share and produces 2.3 Weekly EFO; the blocking gate caps RR at 65 and never touches
  the projection chain (asserted by invariant test 26.16.2 #12).
- **Routes constrain targets:** low-route/high-TPRR shows TE (72.5) > RR (39.1) with target
  volume capped by routes; the full-route twin comparison confirms the constraint.
- **Touchdowns are opportunity-driven:** the TD chain uses only base rate × red-zone ×
  end-zone × team-scoring factors with the [0.015, 0.095] caps; realized touchdowns are not
  an input (tested — an injected extra field cannot change output).
- **Competition pressure** is consumed exactly four times: TC's 10% term, RD's −22 term,
  volatility's +16 term, and the competition explanation trigger (formula tests verify the
  exact deltas).
- **TE age curve is independent:** the exact Section 26.8.8 discrete table is implemented
  and tested age-by-age; no WR/RB values exist in the repository.
- **Scarcity is absent:** no replacement value, positional scarcity, TE premium,
  startability, or market inputs anywhere (source-scan test enforces this).

## 6. Platform compatibility

- WR formulas unchanged / RB formulas unchanged: **vacuously true** — no WR/RB code exists
  in this repository; none was created or modified.
- WR/RB tests pass: **not applicable** (none exist); the full repository suite passes.
- No circular imports (build succeeds; module graph is a DAG rooted at `engine.ts`).
- No improper football-formula sharing (source-scan test verifies no `wr-model`/`rb-model`
  imports).
- Platform conventions the task attributes to WR/RB are honored: one entry point, eight
  components, five horizons, mid-rank percentiles, versioned frozen references, deterministic
  fallback log with one-time penalties, `OK`/`PARTIAL`, confidence/volatility labels,
  conditional weekly stats with one-time `Pactive`, recovery-aware ROS, fixture-driven
  goldens.

## 7. Scope compliance

No live data, no network access, no databases, no UI, no market layer, no simulation, no
Monte Carlo, no Bayesian/ML libraries, no proprietary feeds, no backtesting infrastructure,
no automated reference recalibration, no opponent adjustments, no One-Year/Three-Year/
Dynasty EFO, no AI-generated explanations, and no scientific-calibration claim for
`TE_REFERENCE_V1`. No formula was tuned to make fixture results "look" intuitive.

## 8. Limitations (genuine Version 1 limitations)

1. `TE_REFERENCE_V1` arrays are provisional implementation constants, not calibrated
   empirical NFL distributions.
2. Route data may arrive as a penalized snap proxy; the 0.72 factor is a provisional
   discount.
3. Competition pressure and QB environment are normalized upstream inputs the engine trusts.
4. ROS recovery assumes one reduced active game then full workload; no multi-week curve.
5. Inactive-list players receive zero ROS output (no scheduled-return inference).
6. Touchdown and target-quality constants are unfitted provisional values.
7. Blocking role is represented by the snap-route gap, not a true blocking grade.
8. The WR/RB engines the platform is designed around do not exist in this repository yet;
   shared-helper extraction is deferred until a second engine lands.

Deferred features (live adapters, market/scarcity layers, multi-year EFO, etc.) are
intentional deferrals, not defects.

## 9. Verdict

**PASS — TE MVP IMPLEMENTATION COMPLETE**

All required tests pass (220/220), typecheck and production build pass, golden outputs
regenerate byte-identically, and the frozen Section 26 contract was implemented without
scope expansion.
