# RB MVP Implementation Decisions

Material decisions not fully explicit in Section 26. Ordinary coding choices (names, folders) are
excluded. Section 26 governs; each decision below takes the narrowest reading consistent with the
surrounding §26 language. Section 26.0 states the formulas "control without exception," so where a
§9 fixture *expectation* and a binding §26 *formula* disagree on the verbatim fixture input, the
formula wins and the deviation is recorded here rather than engineered away.

---

## Decision 1 — Age & Development band below age 20

**Decision:** the youngest AD base band (`84`) applies to any valid age at or below 21, including
ages 18–19.

**Why required:** §26.8.8's table starts at "20–21 → 84", but §26.2.2 accepts any `age >= 18`. Ages
18–19 are valid inputs with no explicit AD base.

**Interpretation chosen:** extend the lowest published band downward (`age <= 21 → 84`). A back
younger than the youngest tabulated age is at least as "developmental" as a 20–21-year-old.

**Alternative rejected:** returning the fallback last-band value (`14`) for an unmatched young age —
that would score an 18-year-old like a 30-year-old, which inverts the table's intent.

**Output impact:** only affects fixtures with age < 20 (none of the ten mandatory fixtures; the
rookie is 21, already inside the published band).

---

## Decision 2 — Non-overlapping career prior: overlap detection

**Decision:** a career efficiency prior (YPC, catch rate, receiving yds/reception) is treated as
valid non-overlapping evidence when it is finite **and** either the current-season input is missing
or differs from it. A career value exactly equal to the current-season value is read as an
overlapping/self-blended sample and the neutral prior is used instead.

**Why required:** §26.6.2/§26.6.5/§26.6.6 and §26.3.1 say to use the career value "only when the
normalization layer confirms it excludes the current-season sample," and §26.16.10.7 requires that
"overlapping current and career efficiency samples use neutral priors rather than self-blending." No
explicit boolean "is-non-overlapping" flag exists in `RBMVPInput`, so overlap must be inferred
deterministically.

**Interpretation chosen:** exact equality of the current and career value is the overlap signal.
Distinct values are, by the schema's own labelling ("Optional non-overlapping history"), independent
evidence and are used as the prior.

**Alternative rejected:** always trusting the career field as non-overlapping — that would permit
self-blending when a data layer copies the current sample into the career slot, violating
§26.16.10.7.

**Output impact:** deterministic and testable; drives the §26.16.10.7 test. In the mandatory
fixtures the career values differ from current, so the career prior is used as intended.

---

## Decision 3 — Serialization precision of projection outputs

**Decision:** every projection stat output (`expected_carries`, `expected_rushing_yards`,
`expected_rushing_touchdowns`, `expected_routes`, `expected_targets`, `expected_receptions`,
`expected_receiving_yards`, `expected_receiving_touchdowns`, `expected_fantasy_points`,
`ros.expected_active_games`, `ros.expected_fantasy_points`) serializes to **one decimal place**;
`weekly.probability_active` and `weekly.workload_ramp_factor` serialize to **three**.

**Why required:** §26.2.4 lists "projection outputs" among the values rounded "to one decimal place,"
then separately permits three decimals for probability_active and workload_ramp_factor only.

**Interpretation chosen:** the literal contract — all projection outputs at 1 dp, the two named
availability fields at 3 dp. Full precision is retained internally; only serialization rounds.

**Alternative rejected:** finer per-field precisions (2–3 dp) for readability. Faithfulness to the
enumerated "one decimal place" and exact golden reproducibility outweigh cosmetic granularity.

**Output impact:** e.g. `expected_rushing_touchdowns` serializes `1.759 → 1.8`. Labels and downstream
values are unaffected (they never read the serialized projection numbers).

---

## Decision 4 — Confidence and volatility labels derive from the rounded score

**Decision:** the reported confidence/volatility **label** is computed from the one-decimal
serialized score, not the raw score.

**Why required:** §26.2.4 explicitly states "Derive confidence and volatility labels from the rounded
serialized score," and §26.16.7 tests that raw `32.97 → 33.0 MEDIUM` and raw `79.96 → 80.0 HIGH`.

**Interpretation chosen:** round first, then label, so a score that displays as a boundary value
(33.0, 80.0) always carries the label its displayed number implies.

**Output impact:** boundary scores never show a label that contradicts their printed value. Matches
the WR platform precedent exactly.

---

## Decision 5 — Median-or-final fallback rows share a single log entry and penalty

**Decision:** for the four "projection → reference median → hard final" rows (team non-QB rushes,
team dropbacks, points/drive, red-zone trips), whichever branch supplies the value produces exactly
one fallback-log entry and one penalty for that canonical field.

**Why required:** §26.5.2 lists both a "First fallback" (reference median) and a "Final fallback"
(hard constant) with one penalty column, and §26.5.1 says "A fallback penalty applies once per
canonical field" and "No canonical field may appear more than once in `fallback_log`."

**Interpretation chosen:** one field → one log entry → one penalty, regardless of which fallback tier
resolved it. The bundled reference table is always non-empty, so these fields resolve at the median
tier in practice; the hard final is a defensive path.

**Output impact:** no double-logging or double-penalising of a single canonical field.

---

## Decision 6 — Red-zone share resolved before goal-line share

**Decision:** the red-zone-share fallback is resolved before the goal-line-share fallback so that
goal-line's "otherwise canonical red-zone share" branch references the already-canonicalized
red-zone value.

**Why required:** §26.5.2 lists goal-line above red-zone, but goal-line's fallback explicitly names
the *canonical* red-zone share (a "previously canonicalized derived field," permitted by §26.5.1).
Both are still resolved against original inputs for their own primary values, and each logs
independently when its own primary is missing (§26.16.4.5 pattern).

**Interpretation chosen:** compute red-zone canonical first; goal-line then reads original red-zone
if present, else the canonical red-zone. Each field is still logged/penalized only for its own
independent miss.

**Output impact:** deterministic, order-independent goal-line resolution; both fields logged once
when both are missing.

---

## Decision 7 — Fixture qualitative expectations that the binding formula does not meet

**Decision:** three §9 fixture "required behavior" bullets are not literally reproducible from the
verbatim fixture inputs under the binding §26 formulas. The formulas are followed; the fixture tests
assert the closest true behavior instead of the unreachable label.

**Cases:**
- **Committee back — "volatility MEDIUM or HIGH":** §26.12 yields ≈ 29.3 (**LOW**). Competition
  (0.74) and TD dependence do lift it above a low-competition equivalent, but not past the 33.0
  MEDIUM boundary. The committee *negative explanation* requirement is met.
- **Injury-return — "volatility elevated" and "availability negative explanation":** §26.12 yields
  ≈ 30.5 (**LOW**, though +10 above the healthy-equivalent from the QUESTIONABLE injury term), and
  §26.13.1 rule 7 fires only at `AV < 60` while a QUESTIONABLE+LIMITED back scores `AV = 68`. So no
  availability-negative explanation is generated. The reduced-ramp and reduced-EFO behaviors are
  fully met.

**Why required:** §26.0 — the formulas "control without exception." Tuning §26.12 or the §26.13.1
threshold to hit a label would be inventing logic to satisfy a non-binding expectation, which the
task forbids.

**Interpretation chosen:** implement §26 verbatim; record the golden outputs as the formula produces
them; assert the reachable behaviors (competition/injury raise volatility relative to a matched
baseline; committee explanation negative; ramp reduces conditional stats and EFO).

**Output impact:** committee volatility label LOW; injury-return volatility label LOW with no
availability-negative driver, in the golden snapshots. All other fixture expectations are met.
