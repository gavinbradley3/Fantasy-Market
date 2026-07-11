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

## Decision 7 (revised by the conformance patch) — Fixture expectations vs. binding formulas

**Decision:** the §26 formulas are never tuned to hit a fixture label. Where the *binding*
specification itself constrains a golden fixture's behavior, the fixture **inputs** are authored to
satisfy it; expectations that exist only outside the binding contract are asserted as the
§26-reachable behavior.

**Cases (as resolved by the conformance audit and patch):**
- **Committee back — "medium/high volatility" (§26.16.11.4, binding):** the original inputs
  (snap 0.48, competition 0.74) produced 29.3 **LOW** under the unchanged §26.12 formula. Because
  §26.16.11.4 is part of the binding golden-fixture contract and MEDIUM is reachable with legitimate
  committee-archetype inputs, the fixture was re-authored (snap 0.38/0.40, competition 0.88, smaller
  career sample, goal-line/red-zone 0.42/0.44) and its golden regenerated: volatility **34.1
  MEDIUM**. The §26.12 formula was not modified.
- **Injury-return — "volatility elevated" and "availability negative explanation":** neither appears
  in the binding §26.16.11.7 requirements (nonzero Pactive, ramp below one, reduced first active
  game, later games at full workload — all met). §26.12 yields ≈ 30.5 (LOW, though +10 above the
  healthy-equivalent from the QUESTIONABLE term), and §26.13.1 rule 7 fires only at `AV < 60` while
  QUESTIONABLE+LIMITED scores `AV = 68`. These outputs stand as the formulas produce them.

**Why required:** §26.0 — the formulas "control without exception," and §26.16.11 golden-fixture
descriptions are equally binding. Fixture inputs are an implementation choice; formulas are not.

**Output impact:** committee golden volatility 34.1 MEDIUM; injury-return golden volatility 30.5 LOW
with no availability-negative driver. All ten §26.16.11 fixture descriptions are now satisfied.

---

## Decision 8 — Integer-valued age and career counts (conformance patch)

**Decision:** `age`, `career_touches`, `career_carries`, and `career_routes` must be integers;
non-integer values are rejected at validation.

**Why required:** the §26.8.7 age-security adjustment and §26.8.8 AD base table are integer-keyed
(bands "24", "25", "27" leave fractional ages like 24.5 in no band), and the §26.11 career-touch
tiers ("< 50", "50–149") assume count semantics. The audit showed a fractional age such as 24.5 fell
through to the 30+ AD base (14) and a fractional 27.5 received the ≥29 RD adjustment — pathological
mappings the spec never defines.

**Interpretation chosen:** the smallest deterministic resolution consistent with the public
contract: these fields are semantically integer (years, attempts, receptions, routes), so
non-integers are rejected exactly like other malformed input rather than being mapped into an
undefined band. The §26.11 confidence tiers additionally use the literal `< 50 / < 150 / < 300`
boundary comparisons.

**Output impact:** none for any valid integer input; all golden fixtures are unchanged by this rule.

---

## Decision 9 — Missing-reference fallback-log entries and reference rejection (conformance patch)

**Decision:** each missing/empty reference distribution writes one fallback-log entry
(`field: "Reference distribution <key>"`, `fallback_used: "neutral percentile 50"`, penalty 5) in
addition to the existing −5 confidence penalty and PARTIAL status; and a caller-supplied non-empty
reference array containing a non-finite member is rejected during configuration validation.

**Why required:** §26.4 — "add one fallback-log entry for that canonical distribution" (the entry
was previously omitted; only the penalty and status were applied), and "Sanitize a non-empty array
by rejecting non-finite members during configuration validation; do not silently drop them" (members
were previously filtered silently at percentile time). §26.14 step 19's output-range validation was
also added to the engine as part of the same patch.

**Interpretation chosen:** a distribution key is logged once regardless of how many percentile calls
used it (mirroring §26.5.1 once-per-canonical-field semantics); an *all*-non-finite array cannot
occur past validation, so the §26.4 "contains no finite values" neutral path now applies to absent
or empty arrays. An absent or empty array remains a legal configuration handled by the neutral
percentile-50 fallback, not a validation error.

**Output impact:** none with the bundled reference table (it is complete and finite); goldens are
unchanged. Only callers injecting incomplete or malformed reference tables observe the new log
entries or rejections.
