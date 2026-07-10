# WR MVP Implementation Decisions

Material decisions not fully explicit in Section 26. Ordinary coding choices (names, folders) are
excluded per the prompt's §13. Section 26 governs; each decision below takes the narrowest reading
consistent with surrounding §26 language.

---

## Decision 1 — Percentile convention

**Decision:** `pct(x)` uses the empirical **mid-rank** formula against the reference array `V` of
size `N`:

```
pct(x) = 100 × ( count(v < x) + 0.5 × count(v == x) ) / N     clamped to [0,100]
```

**Why a decision was required:** §26.4 mandates "empirical percentile rank with average-rank tie
handling," clamped to `[0,100]`, and the prompt permits either interpolation *or* "a clearly
documented empirical rank convention," so long as it is consistent and documented.

**Interpretation chosen:** the count-below-plus-half-equal mid-rank estimator. It is the textbook
"empirical percentile rank," implements average-rank tie handling exactly (each tied value receives
its mean rank), returns `0` for values below the minimum and `100` for values above the maximum, and
is fully deterministic. Applied identically to every distribution.

**Alternative rejected:** piecewise-linear interpolation between reference points. It is strictly
monotonic but adds an arbitrary plotting-position choice and is *not* what "average-rank tie
handling" names; §26.4's wording matches the mid-rank estimator more directly. No required test
depends on strict monotonicity of `pct` (all monotonicity tests act on raw inputs inside the
projection/RD formulas, not on percentiles).

**Output impact:** component scores are quantized in steps of `100/N` (~5 pts). Directionally
identical to interpolation on all fixtures; every §26.16 and §7–8 behavior that the formula can
satisfy is satisfied.

---

## Decision 2 — Deep-threat fixture: volatility conflict (non-blocking)

**Decision:** implement §26.12 verbatim; do **not** assert the prompt's §7.5 expectation
"Volatility should be at least MEDIUM" for the deep-threat fixture.

**Why a decision was required:** the §26.12 volatility formula, evaluated on the deep-threat fixture
(RP4 0.78, aDOT 16.8, career_routes 780, HEALTHY, STABLE), yields
`20×0.22 + 20×0.84 + 20×0.161 + 0 + 0 + 0 = 24.4` → **LOW**. The prompt's fixture expectation asks
for ≥ MEDIUM (≥33). The two cannot both hold.

**Interpretation chosen:** §26.0 states §26 "controls without exception" and the prompt names §26 the
sole binding authority. The formula is binding; the fixture bullet is a derived expectation. I follow
the formula, so the golden output records volatility LOW (~24.4), and the fixture test asserts only
the §7.5 behaviors the formula *does* satisfy (deep-target gate triggers, TQ ≤ 65, EF weak, expected
catch rate below the elite fixture, no fallback, status OK).

**Alternative rejected:** tuning the volatility formula (e.g., adding an aDOT or low-target term) to
force MEDIUM. That would edit a binding §26 formula to satisfy a non-binding expectation — exactly
the "invention" the prompt forbids.

**Output impact:** deep-threat volatility label = LOW in the golden snapshot. All other deep-threat
expectations are met. No other fixture is affected (low-route → MEDIUM 41.9, rookie → near-top MEDIUM
62.3, both satisfy their bullets).

---

## Decision 3 — Fallback-log scope excludes §26.7 trend-history fields

**Decision:** missing `previous_route_participation` / `previous_targets_per_route_run` are resolved
by the §26.7 neutral-`50` trend rule with **no** fallback-log entry, **no** confidence penalty, and
they do **not** by themselves set `status = "PARTIAL"`. Only the fourteen fields in the §26.5 table
produce log entries, penalties, and PARTIAL status.

**Why a decision was required:** the prompt's rookie fixture says "missing trend history must produce
neutral trend scores, not zero," and the missing-data fixture says "every fallback appears once in the
log." §26.5 (the fallback table) does not list the two `previous_*` fields; §26.7 (trend scores)
handles their absence separately with a fixed `50`.

**Interpretation chosen:** treat §26.5 as the exhaustive definition of "a fallback" for logging,
penalties, and status; treat §26.7's neutral-50 as an ordinary formula default, not a fallback.

**Alternative rejected:** logging trend defaults as fallbacks. That would attach penalties §26.5 never
authorizes and could flip an otherwise-clean player to PARTIAL, contradicting §26.5's closed table.

**Output impact:** the rookie fixture's fallback log contains exactly RP8 and contract_security (its
two §26.5 fallbacks); its PARTIAL status and 37-pt confidence deduction derive only from §26.5 +
§26.11 rules. Trend defaults are silent.

---

## Decision 4 — Mutual RP4/RP8 fallback resolves against original inputs

**Decision:** RP4 and RP8 fallbacks are each evaluated against the **original** input values. If
RP4 is null, its first fallback is the original RP8; if that is also null, the final `0.50` is used.
RP8 is resolved symmetrically and independently. Each logs its own penalty at most once; there is no
chained re-resolution and no infinite loop.

**Why a decision was required:** §26.5 lists RP4's first fallback as RP8 and RP8's first fallback as
RP4. Read naively as sequential mutation, a both-null case is circular.

**Interpretation chosen:** independent resolution against the pre-fallback snapshot, then the printed
final constant. This is the only reading that terminates and keeps each penalty single.

**Output impact:** when both RP windows are null, both resolve to `0.50` and both penalties (8+8)
apply once each — matching the §26.5 table read literally.

---

## Decision 5 — Serialization rounding (stable snapshots)

**Decision:** all computation runs at full IEEE-754 precision; only the **returned** `WRMVPOutput`
is rounded, per a fixed per-field precision map: components 1 dp (§26.2); composites 4 dp;
`probability_active` 4 dp; expected routes/targets/receptions/tds 2 dp; expected yards 1 dp; weekly
& ROS fantasy points 1 dp (§26.2); ROS active games 2 dp; confidence 1 dp; volatility 1 dp.

**Why a decision was required:** §26.2 fixes 1-dp display only for component scores and fantasy
outputs; §5.3 of the prompt permits rounding "serialized or displayed values," and the golden
snapshots (§10) must "reproduce exactly." Un-rounded floats risk last-bit drift across platforms.

**Interpretation chosen:** round once at the serialization boundary (`rounding.ts`), leaving all
intermediate math exact (composites are computed from full-precision components, not the rounded
ones). Pure-function unit tests assert internal values with a small tolerance; snapshot tests assert
the rounded output exactly.

**Alternative rejected:** returning full-precision floats. Fragile snapshots and noisy diffs, with no
§26 benefit.

**Output impact:** deterministic, stable golden files; component/fantasy display precision matches
§26.2. Rounding is coarse enough to never mask a monotonicity delta in the invariant tests (those
also assert on internal pure functions).

**Refinement (label/score consistency):** the reported confidence and volatility *labels* are
derived from the **rounded** score, not the raw score, so the two never contradict at a boundary.
Example: the declining-veteran volatility is a raw `32.9714` (LOW by the §26.12 range), but it
displays as `33.0`; labeling off the raw value would print "33.0 · LOW", which reads as mislabeled
against the "MEDIUM = 33–65.999" boundary. Labeling off the rounded `33.0` yields the consistent
"33.0 · MEDIUM". Confidence scores are always integers, so this refinement never changes a confidence
label. The pure `volatilityLabel`/`confidenceLabel` boundary functions (tested at 33/66 and 60/80)
are unchanged.
