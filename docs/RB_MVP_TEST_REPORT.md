# RB MVP Test Report

Deterministic Running Back valuation engine (`src/rb-model/`), implemented from **Section 26** of
`RB_VALUATION_MODEL_v1.1_FINAL.md`. Section 26 is the sole binding authority.

## Verdict

**PASS — RB MVP COMPLETE** (including the 2026-07-11 conformance correction patch; see the
"Conformance correction patch" section below).

- **RB engine tests:** 167 passed (15 files).
- **WR engine tests:** 124 passed — unchanged (no WR formula was edited; shared behavior was copied,
  not coupled).
- **TE engine tests:** 220 passed — unchanged.
- **Full repository:** 642 passed / 0 failed (55 files).
- **Typecheck:** `tsc -b --noEmit && tsc -p tsconfig.te.json` clean. **Build:** `vite build` success.
  **TE build:** `tsc -p tsconfig.build.json` success.
- **Golden snapshots:** 11 files, regenerated twice and byte-identical (sha256 stable) —
  reproducible. Only `committee-back.expected.json` changed, and only because its fixture inputs
  were re-authored (see below); the other ten goldens are byte-identical to the previous set.

## Commands

```
npx vitest run src/rb-model     # 167 passed
npx vitest run src/wr-model     # 124 passed (unchanged)
npx vitest run tests/te-model   # 220 passed (unchanged)
npm test                        # 642 passed
npm run typecheck               # clean
npm run build                   # success
npm run build:te-model          # success
```

## Golden fixture results (default full-PPR, WEEKLY horizon)

| Fixture | WRK | OQ | RE | RU | TC | RD | AD | AV | Wk EFO | ROS | Confidence | Volatility | Status |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|---|
| Elite bell cow | 86.2 | 74.6 | 71.8 | 74.2 | 72.5 | 73.1 | 69 | 98 | 26.5 | 265.0 | 100 HIGH | 15.2 LOW | OK |
| Goal-line specialist | 24.5 | 59.0 | 31.6 | 17.9 | 55.3 | 42.8 | 43 | 98 | 4.3 | 43.5 | 100 HIGH | 35.6 MEDIUM | OK |
| Receiving specialist | 49.0 | 35.1 | 42.0 | 82.5 | 55.9 | 56.4 | 62 | 98 | 12.7 | 126.5 | 100 HIGH | 25.2 LOW | OK |
| Committee back | 41.5 | 44.3 | 56.4 | 45.0 | 54.1 | 47.8 | 53 | 98 | 9.5 | 94.9 | 100 HIGH | 34.1 MEDIUM | OK |
| Explosive rookie | 42.8 | 33.1 | 61.1 | 42.5 | 54.2 | 69.4 | 84 | 98 | 7.9 | 79.4 | 68 MEDIUM | 45.6 MEDIUM | PARTIAL |
| Aging veteran | 73.4 | 64.7 | 54.2 | 56.6 | 65.7 | 33.5 | 8 | 98 | 18.7 | 186.8 | 100 HIGH | 20.4 LOW | OK |
| Injury-return | 66.0 | 56.5 | 61.8 | 55.4 | 61.8 | 61.4 | 62 | 68 | 7.8 | 103.8 | 100 HIGH | 30.5 LOW | OK |
| Out player | 86.2 | 74.6 | 71.8 | 74.2 | 72.5 | 73.1 | 69 | 0 | 0.0 | 0.0 | 96 HIGH | 7.2 LOW | PARTIAL |
| Missing-data | 45.2 | 42.8 | 46.9 | 34.8 | 51.5 | 43.2 | 67 | 72 | 4.9 | 59.1 | 0 LOW | 55.0 MEDIUM | PARTIAL |
| Mobile-QB low pressure | 69.0 | 57.2 | 55.8 | 54.5 | 60.6 | 61.5 | 62 | 98 | 16.2 | 162.3 | 100 HIGH | 20.0 LOW | OK |
| Mobile-QB high pressure | 69.0 | 57.2 | 55.8 | 54.5 | 54.6 | 61.5 | 62 | 98 | 13.7 | 137.1 | 100 HIGH | 19.3 LOW | OK |

Observations:
- **Elite** dominates workload/opportunity/receiving and posts the top Weekly (26.5) / ROS (265) EFO;
  no fallback; HIGH confidence; LOW volatility.
- **Goal-line specialist** trips the OQ low-touch gate (base projected touches < 6), keeps WRK/RU low,
  carries high TD dependence (0.5), and lands far below elite Weekly output.
- **Explosive rookie** is held by the RE small-sample clamp (career carries 30 → RE ∈ [25,75]; final
  61.1, not an "elite" unrestricted score) despite a 6.8 observed YPC; Snap8 + contract fallbacks →
  PARTIAL, MEDIUM confidence.
- **Aging veteran** keeps a strong current profile (WRK 73.4) but AD collapses to 8 and RD to 33.5,
  so the Dynasty composite (39.9) sits far below the Weekly composite (69.5).
- **Injury-return** shows nonzero Pactive (0.68), a reduced first ROS game, and elevated volatility
  from the QUESTIONABLE term.
- **Out player** zeros every workload stat and both EFOs; workload-ramp fallback logged; availability
  is the top negative explanation.
- **Missing-data** exercises all 21 fallback rows once each, lands at 0 LOW confidence, PARTIAL, with
  every output finite and no silent zero (expected carries stay positive via the role fallbacks).
- **Mobile-QB pair** isolates QB rush pressure: the high-pressure back has fewer carries (13.3 vs
  15.2), lower Weekly EFO (13.7 vs 16.2), fewer rushing TDs, and lower TC, with all seven
  pressure-neutral components identical.

## Mandatory §26.16 test coverage

| §26.16 group | Where | Result |
|---|---|---|
| .1 Formula & architecture (1–12) | `components`, `projections`, `composites`, `invariants` | pass |
| .2 Percentile (mid-rank, unsorted, below/above, missing→50 incl. engine-level log entry + PARTIAL + −5) | `percentiles.test.ts`, `fallbacks.test.ts` | pass |
| .3 Status (OK / PARTIAL / trend-neutral, incl. §26.16.3.3) | `fallbacks.test.ts`, `trends.test.ts` | pass |
| .4 Penalty (route 15, reuse once, mutual Snap, no double-log, Snap+carry) | `fallbacks.test.ts` | pass |
| .5 ROS ramp (healthy flat, reduced first game, later full, inactive zero, ≤0 zero) | `projections.test.ts` | pass |
| .6 Conditional stats (Pactive-invariant, EFO scales, ramp changes, once, equals active-game) | `projections.test.ts` | pass |
| .7 Rounding & labels (32.97→33.0 MEDIUM, 79.96→80.0 HIGH, from rounded score, unrounded intermediates) | `volatility`, `confidence`, `composites.test.ts` | pass |
| .8 Explanations (order, ≤3, dedupe, both-side ban, committee neg, receiving pos, long-term age, no certainty) | `explanations.test.ts` | pass |
| .9 Scoring (stats preserved, points change, comp/composite/conf fixed, volatility via dependence) | `scoring.test.ts` | pass |
| .10 Input definitions (rejections; touches = carries+receptions; overlap→neutral prior) | `validation`, `shrinkage` | pass |
| .11 Ten golden fixtures | `fixtures.test.ts` + `snapshot.test.ts` | pass |

Plus the prompt's §10 grouped suites (architecture, validation, fallback, shrinkage, component,
projection, scoring, confidence, volatility, explanation) — all green. The conformance patch added
direct §26.7 trend-formula tests (`trends.test.ts`), the §26.13.1 rule-6 teammate-return explanation
test, §26.16.1.3/.4 Weekly-EFO monotonicity assertions, §26.4 reference-configuration rejection
tests, and §26.14 step-19 output-validation tests.

## Determinism & scope

- No randomness, no clock reads (`as_of_timestamp` comes from input), no network, no hidden mutable
  state — verified by a source scan in `invariants.test.ts` and by identical repeat evaluations.
- RB modules import no WR model, market data, service, hook, or store code. Shared low-level helpers
  (`clamp`, `median`, mid-rank `percentileRank`, the `round` map) are re-declared, not imported, so
  the two engines version independently.
- No schema field accepts ADP, ranking, market price, consensus, or trade value; extra market-like
  input keys are ignored (byte-identical output). One/Three/Dynasty return composites only — never
  fabricated fantasy points.

## Conformance correction patch (2026-07-11)

An audit against the recovered `RB_VALUATION_MODEL_v1.1_FINAL.md` produced a small correction patch.
**No core valuation formula, weight, threshold, or model-design element changed.** The corrections:

1. **§26.4 missing-reference log entry** — a missing/empty reference distribution now writes one
   fallback-log entry (`Reference distribution <key>` → `neutral percentile 50`, penalty 5) in
   addition to the pre-existing −5 confidence penalty and PARTIAL status (Decision 9).
2. **§26.4 reference rejection** — a caller-supplied non-empty reference array containing a
   non-finite member is rejected at configuration validation instead of being silently filtered
   (Decision 9).
3. **§26.16.11.4 committee fixture** — the committee-back fixture inputs were re-authored
   (snap 0.38/0.40, competition 0.88, smaller career sample) so the golden satisfies the binding
   "medium/high volatility" requirement: volatility moved from **29.3 LOW** to **34.1 MEDIUM** with
   the §26.12 formula untouched. Its golden was regenerated; the other ten goldens are byte-identical
   (Decision 7, revised).
4. **§26.14 step 19** — the engine now validates every returned numeric output is finite and within
   its declared range before returning.
5. **Decision 8** — `age` and the three career counts must be integers; this closes the fractional-age
   AD/RD band gaps and the fractional-touch confidence-tier straddle. The §26.11 touch tiers use the
   literal `< 50 / < 150 / < 300` comparisons.
6. **New tests** — direct §26.7 trend tests, §26.16.3.3 trend-status test, engine-level
   §26.16.2.5 missing-distribution test, §26.13.1 rule-6 teammate-return explanation test,
   §26.16.7.3 unrounded-intermediates tests, and §26.16.1.3/.4 EFO monotonicity assertions
   (RB suite: 146 → 167 tests).

## Remaining formula-governed fixture behaviors (Decision 7, revised)

- **Injury-return** volatility is **30.5 LOW** (still +10 above the healthy equivalent) and no
  availability-negative explanation fires because §26.13.1 rule 7 triggers only at `AV < 60` while a
  QUESTIONABLE+LIMITED back scores `AV = 68`. Neither behavior is required by the binding
  §26.16.11.7 fixture description (nonzero Pactive, ramp below one, reduced first active game, later
  games at full workload — all met). No binding formula was altered to hit a label.
