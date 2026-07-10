# RB MVP Test Report

Deterministic Running Back valuation engine (`src/rb-model/`), implemented from **Section 26** of
`RB_VALUATION_MODEL_v1.1_FINAL.md`. Section 26 is the sole binding authority.

## Verdict

**PASS — RB MVP COMPLETE.**

- **RB engine tests:** 146 passed (14 files).
- **WR engine tests:** 124 passed — unchanged (no WR formula was edited; shared behavior was copied,
  not coupled).
- **Full repository:** 375 passed / 0 failed (36 files).
- **Typecheck:** `tsc -b --noEmit` clean. **Build:** `vite build` success.
- **Golden snapshots:** 11 files, regenerated and byte-identical (sha256 stable) — reproducible.

## Commands

```
npx vitest run src/rb-model     # 146 passed
npx vitest run src/wr-model     # 124 passed (unchanged)
npm test                        # 375 passed
npm run typecheck               # clean
npm run build                   # success
```

## Golden fixture results (default full-PPR, WEEKLY horizon)

| Fixture | WRK | OQ | RE | RU | TC | RD | AD | AV | Wk EFO | ROS | Confidence | Volatility | Status |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|---|
| Elite bell cow | 86.2 | 74.6 | 71.8 | 74.2 | 72.5 | 73.1 | 69 | 98 | 26.5 | 265.0 | 100 HIGH | 15.2 LOW | OK |
| Goal-line specialist | 24.5 | 59.0 | 31.6 | 17.9 | 55.3 | 42.8 | 43 | 98 | 4.3 | 43.5 | 100 HIGH | 35.6 MEDIUM | OK |
| Receiving specialist | 49.0 | 35.1 | 42.0 | 82.5 | 55.9 | 56.4 | 62 | 98 | 12.7 | 126.5 | 100 HIGH | 25.2 LOW | OK |
| Committee back | 47.8 | 39.7 | 56.4 | 45.0 | 54.1 | 50.6 | 53 | 98 | 9.9 | 98.7 | 100 HIGH | 29.3 LOW | OK |
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
| .2 Percentile (mid-rank, unsorted, below/above, missing→50) | `percentiles.test.ts` | pass |
| .3 Status (OK / PARTIAL / trend-neutral) | `fallbacks.test.ts` | pass |
| .4 Penalty (route 15, reuse once, mutual Snap, no double-log, Snap+carry) | `fallbacks.test.ts` | pass |
| .5 ROS ramp (healthy flat, reduced first game, later full, inactive zero, ≤0 zero) | `projections.test.ts` | pass |
| .6 Conditional stats (Pactive-invariant, EFO scales, ramp changes, once, equals active-game) | `projections.test.ts` | pass |
| .7 Rounding & labels (32.97→33.0 MEDIUM, 79.96→80.0 HIGH, from rounded score) | `volatility`, `confidence` | pass |
| .8 Explanations (order, ≤3, dedupe, both-side ban, committee neg, receiving pos, long-term age, no certainty) | `explanations.test.ts` | pass |
| .9 Scoring (stats preserved, points change, comp/composite/conf fixed, volatility via dependence) | `scoring.test.ts` | pass |
| .10 Input definitions (rejections; touches = carries+receptions; overlap→neutral prior) | `validation`, `shrinkage` | pass |
| .11 Ten golden fixtures | `fixtures.test.ts` + `snapshot.test.ts` | pass |

Plus the prompt's §10 grouped suites (architecture, validation, fallback, shrinkage, component,
projection, scoring, confidence, volatility, explanation) — all green.

## Determinism & scope

- No randomness, no clock reads (`as_of_timestamp` comes from input), no network, no hidden mutable
  state — verified by a source scan in `invariants.test.ts` and by identical repeat evaluations.
- RB modules import no WR model, market data, service, hook, or store code. Shared low-level helpers
  (`clamp`, `median`, mid-rank `percentileRank`, the `round` map) are re-declared, not imported, so
  the two engines version independently.
- No schema field accepts ADP, ranking, market price, consensus, or trade value; extra market-like
  input keys are ignored (byte-identical output). One/Three/Dynasty return composites only — never
  fabricated fantasy points.

## Known formula-vs-fixture deviations (Decision 7)

Three §9 fixture "required behavior" bullets are not literally reproducible from the verbatim inputs
under the binding §26 formulas; the formulas govern (§26.0) and the golden outputs record what they
produce:

- **Committee back** volatility is **29.3 LOW** (§9.4 suggested MEDIUM/HIGH). Competition still lifts
  it above a low-competition baseline, and the committee negative explanation fires.
- **Injury-return** volatility is **30.5 LOW** (still +10 above the healthy equivalent) and no
  availability-negative explanation fires because §26.13.1 rule 7 triggers only at `AV < 60` while a
  QUESTIONABLE+LIMITED back scores `AV = 68`. The ramp/EFO behaviors are fully met.

These are documented in `docs/RB_MVP_IMPLEMENTATION_DECISIONS.md` (Decision 7); no binding formula was
altered to hit a label.
