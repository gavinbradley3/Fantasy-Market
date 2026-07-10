# WR MVP Test Report

## Build summary

**Files created (engine):** `src/wr-model/` — `index.ts`, `types.ts`, `constants.ts`, `math.ts`,
`referenceDistributions.ts`, `config/wr-reference-distributions.json`, `validation.ts`,
`percentiles.ts`, `fallbacks.ts`, `shrinkage.ts`, `trends.ts`, `components.ts`, `composites.ts`,
`projections.ts`, `confidence.ts`, `volatility.ts`, `explanations.ts`, `rounding.ts`, `engine.ts`,
`testutil.ts`.

**Files created (fixtures):** `src/wr-model/fixtures/wr/` — 8 input fixtures (`elite-full-time`,
`low-route-high-tprr`, `round-one-rookie`, `declining-veteran`, `deep-threat-low-efficiency`,
`missing-data`, `out-player`, `scoring-format`) + `expected/` 5 golden snapshots.

**Files created (tests):** `src/wr-model/*.test.ts` — `validation`, `percentiles`, `shrinkage`,
`fallbacks`, `components`, `composites`, `projections`, `confidence`, `volatility`, `explanations`,
`fixtures`, `invariants`, `snapshot`.

**Files created (scripts/docs):** `scripts/generate-wr-snapshots.mts`;
`docs/WR_MVP_IMPLEMENTATION_PLAN.md`, `docs/WR_MVP_IMPLEMENTATION_DECISIONS.md`,
`docs/WR_MVP_TEST_REPORT.md`.

**Files modified:** `tsconfig.app.json` (added `resolveJsonModule: true` for the reference-table
import). No application source was changed; the WR engine shares nothing with the PlayerTicker app.

**Public API:** `evaluateWideReceiver(input: WRMVPInput, options?): WRMVPOutput` (single entry point).
Defaults: `selected_horizon="WEEKLY"`, bundled `wr-reference-1.0` distributions, `model_version="wr-mvp-1.0"`.

**Configuration version:** `wr-reference-1.0`. **Model version:** `wr-mvp-1.0`. **Schema:** `wr-mvp-1.0`.

## Test summary

- **Command:** `npx vitest run src/wr-model`  (full repo: `npm test`)
- **WR model:** 124 passed, 0 failed, 0 skipped (13 files).
- **Full repository:** 213 passed, 0 failed, 0 skipped (20 files) — the WR work broke none of the
  existing 89 app/live-data tests.
- **Typecheck:** `npx tsc -b --noEmit` → clean. **Build:** `npx vite build` → success.

## Fixture summary (from the golden snapshots)

| Metric | Elite | Low-route/high-TPRR | R1 rookie | Declining vet | Deep threat |
|---|--:|--:|--:|--:|--:|
| Weekly EFO | 21.9 | 7.6 | 6.2 | 11.0 | 7.7 |
| ROS EFO | 218.6 | 76.1 | 61.6 | 110.4 | 77.5 |
| RR | 83.1 | 33.4 | 34.3 | 40.5 | 56.9 |
| TE | 87.2 | 78.8 | 48.9 | 68.0 | 37.5 |
| TQ | 75.0 | 65.0 | 45.0 | 65.0 | 65.0 |
| EF | 75.0 | 60.0 | 50.0 | 72.3 | 29.5 |
| TC | 80.1 | 56.6 | 49.7 | 69.8 | 57.0 |
| RD | 64.0 | 65.4 | 64.0 | 23.6 | 54.2 |
| AD | 68.0 | 73.0 | 78.0 | 30.0 | 68.0 |
| AV | 98.0 | 98.0 | 98.0 | 98.0 | 98.0 |
| Weekly composite | 83.69 | 65.64 | 55.67 | 64.61 | 59.29 |
| Dynasty composite | 74.85 | 67.00 | 59.96 | 46.92 | 55.66 |
| Confidence | 100 HIGH | 100 HIGH | 63 MEDIUM | 100 HIGH | 100 HIGH |
| Volatility | 13.3 LOW | 41.9 MEDIUM | 62.3 MEDIUM | 33.0 MEDIUM | 24.4 LOW |
| Fallbacks | none | none | RP8, Contract security | none | none |
| Status | OK | OK | PARTIAL | OK | OK |
| Strongest + driver | Availability | Availability | Availability | Availability | Availability |
| Strongest − driver | — | Route participation | Route participation | Route participation | Target earning |

(Composite values above are the internal 4-dp snapshot figures.)

## Compliance checklist

- **Used only Section 26 as binding authority:** yes. §1–25 informed context only; §26 formulas are
  reproduced verbatim in `constants.ts` + the formula modules.
- **Avoided Monte Carlo:** yes — deterministic expected values only (§26.10).
- **Avoided live APIs:** yes — the engine has no network access; it runs from fixtures.
- **Avoided market inputs:** yes — no price, trade value, or mispricing anywhere in `src/wr-model`.
- **Avoided multi-year EFO simulation:** yes — One/Three/Dynasty EFO deferred; composites only.
- **Logged every fallback:** yes — each §26.5 fallback produces exactly one `fallback_log` entry with
  its penalty; a present primary logs nothing (tested).
- **Preserved deterministic behaviour:** yes — no `Math.random`, no clock reads in calculations
  (`as_of_timestamp` comes from the input); identical input ⇒ identical output (tested).
- **Kept confidence separate from valuation:** yes — confidence/volatility never feed components or
  EFO (tested); they only communicate reliability/instability.

## Remaining limitations (deferred features, not defects — §26.17)

- One-Year / Three-Year / Dynasty EFO distributions are not produced; only their horizon composites
  are returned, exactly as §26.10 specifies for the first MVP.
- The reference distributions are the provisional `wr-reference-1.0` fixture table; no automatic
  percentile-universe refresh (deferred).
- No fitted priors/shrinkage constants, no backtesting, no Monte Carlo quantiles, no role-state
  probabilities, no live/paid data adapters, no market/mispricing layer — all explicitly deferred.
- **Deep-threat volatility (Decision 2):** the §26.12 formula yields LOW (~24.4) for that fixture; the
  prompt's "≥ MEDIUM" expectation conflicts with the binding formula, which controls. Recorded in the
  decisions log; the fixture test asserts the faithful LOW result.

## Final verdict

**PASS — WR MVP IMPLEMENTATION COMPLETE.**

All eight components, five horizon composites, Weekly/ROS expected statistics and fantasy points,
confidence, volatility, explanation drivers, fallback log, and status are produced per Section 26;
all required formula, invariant, fallback, shrinkage, gate, confidence, volatility, and explanation
tests pass; the five golden snapshots were generated only after the formula tests passed and are
reproduced exactly; identical input yields identical output; no live API, no deferred feature, and no
market data enter the engine.
