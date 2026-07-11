# TE MVP Implementation Decisions

Material interpretation decisions made while implementing
`TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md` Section 26. Trivial naming/layout choices are not
recorded.

---

**Decision:** Platform scaffolding created; WR/RB engines absent.
**Why a decision was required:** The task states the WR and RB engines are complete and
tested, but the repository contained only `README.md` — no `src/wr-model/`, `src/rb-model/`,
`package.json`, or test infrastructure.
**Interpretation chosen:** Scaffold a minimal strict-TypeScript + vitest platform and
implement the TE engine exactly per Section 26. WR/RB regression requirements are reported as
vacuously satisfied (no WR/RB code exists to change or weaken).
**Alternative rejected:** Halting for clarification (the task mandates proceeding without
approval), or inventing WR/RB engines (explicit scope violation).
**Output impact:** None on TE outputs. Platform-compatibility tests assert the absence of
cross-position formula imports rather than running WR/RB suites.
**Specification section:** Task §2, §15.11; spec §1.4.

---

**Decision:** The three defensive "final fallback" constants for Snap4 (`0.65`), target share
(`0.12`), and catchable-target rate (`0.76`) are unreachable in practice.
**Why a decision was required:** Section 26.5.2 lists first and final fallbacks per row, but
the first fallback for each of these rows is always computable: canonical RP4/RP8 always
exist (worst case `0.50` fixed), `shrunk_TPRR` always exists, and the canonical QB
environment score always exists (worst case fixed `50`, whose QB mapping happens to also
produce `0.76`).
**Interpretation chosen:** Try primary → first fallback → final fallback in order; because
the first fallback is always computable for these three rows, the final fixed constant never
fires. The closed `fallback_used` enums (`ROUTE_PARTICIPATION_PROXY`,
`RP4_SHRUNK_TPRR_PROXY`, `QB_ENVIRONMENT_PROXY`) are therefore always the logged codes for
these rows; `FIXED_0.65`/`FIXED_0.12`/`FIXED_0.76` remain implemented as defensive branches.
**Alternative rejected:** Using the fixed constant whenever the upstream canonical value was
itself a fallback — Section 26.5.3 explicitly says the target-share fallback "must use"
canonical RP4 × shrunk_TPRR, with no such exception, and 26.5.4 says to use the canonical QB
score "after its own fallback".
**Output impact:** Deterministic fallback values for fully-missing inputs (e.g. missing-data
fixture: Snap4 = 0.625, target share = 0.50 × shrunk_TPRR × 0.92, catchable rate = 0.76).
**Specification section:** 26.5.2, 26.5.3, 26.5.4, 26.5.8.

---

**Decision:** Every missing named distribution in an explicitly supplied runtime reference
object is logged/penalized, whether or not a formula consumes it.
**Why a decision was required:** Section 26.4 says a missing runtime distribution must
"create exactly one missing-reference log entry" and that the penalty applies "once per
missing named distribution, regardless of how many calculations consume that distribution".
Two of the 16 distributions (`average_depth_of_target`, `expected_targets_per_game`) are not
consumed by any Section 26.8/26.10 formula, so consumption-conditional logging would make
their absence silently invisible.
**Interpretation chosen:** "Once per missing named distribution" — log all missing named
distributions in interface order, 5 points each, `PARTIAL`.
**Alternative rejected:** Logging only consumed distributions; it reads extra intent into
"wherever that distribution is consumed" and produces order-dependent behavior.
**Output impact:** A custom reference omitting an unconsumed array still yields `PARTIAL`
and a 5-point penalty.
**Specification section:** 26.4 (Runtime Reference-Object Validation), 26.5.8.

---

**Decision:** `weekly.workload_ramp_factor` serializes the effective ramp used by the weekly
projection (0 for OUT/IR/PUP/SUSPENDED; otherwise the canonical clamped ramp).
**Why a decision was required:** Section 26.15 declares the output field; Section 26.10.1
sets `effective_ramp = 0` for inactive-list statuses while the canonical fallback lookup also
yields 0 for those statuses only when the ramp was missing. A supplied nonzero ramp with an
OUT status leaves the two values different.
**Interpretation chosen:** Serialize the effective ramp — it is the value the weekly block
actually used, keeping the weekly output internally consistent (routes = dropbacks × RP4 ×
serialized ramp).
**Alternative rejected:** Serializing the canonical pre-override ramp, which would let an OUT
player show a nonzero ramp beside all-zero statistics.
**Output impact:** OUT/IR/PUP/SUSPENDED always serialize `workload_ramp_factor = 0.000`.
**Specification section:** 26.10.1, 26.15.

---

**Decision:** `as_of_timestamp` validation accepts a full ISO-8601 date-time with an explicit
UTC or offset designator.
**Why a decision was required:** Section 26.2.2 requires "a valid ISO-8601 timestamp" without
naming a profile.
**Interpretation chosen:** Narrowest deterministic profile:
`YYYY-MM-DDTHH:MM:SS(.fraction)?(Z|±HH:MM)` that also parses to a finite date. Date-only
strings, missing timezone designators, and out-of-range calendar values are rejected.
**Alternative rejected:** Accepting anything `Date.parse` handles (environment-dependent) or
date-only strings ("timestamp" implies a time).
**Output impact:** Validation behavior only.
**Specification section:** 26.2.2.

---

**Decision:** Explanation topic de-duplication is applied to the full candidate lists before
the three-per-side truncation; component topics are claimed in descending
|weighted_driver| with exact ties preferring the negative candidate.
**Why a decision was required:** Section 26.13.3 orders the merge steps (dedupe at step 5–8,
truncation at step 9) but does not state whether a candidate dropped later by truncation
still blocks its topic, nor the claim order between positive and negative component
candidates of different components (impossible for the same component).
**Interpretation chosen:** Follow the literal step order: claim topics on the full lists
(direct candidates in rule order 1–10 first, then component candidates by |weighted_driver|,
tie → negative), then truncate each side to three.
**Alternative rejected:** Deduping after truncation, which would let a truncated candidate's
topic reappear and make output depend on list lengths.
**Output impact:** Deterministic explanation arrays.
**Specification section:** 26.13.3.

---

**Decision:** The bundled reference constant lives in `src/te-model/references.ts` only; no
duplicate `config/te-reference-distributions.json` file is created.
**Why a decision was required:** The task's preferred layout lists a config JSON, but the
spec forbids file-system dependency during evaluation and requires the exact frozen literal
object; two copies would create a second source of truth.
**Interpretation chosen:** Single deep-frozen TypeScript literal, validated at engine start.
**Alternative rejected:** A JSON file loaded at runtime (file-system dependency) or a
generated duplicate (drift risk).
**Output impact:** None.
**Specification section:** 26.4.1; task §7, §8.

---

**Decision:** Direct explanation threshold checks (`AV < 60`, `AD < 35`) and component
drivers use full-precision (pre-serialization) component values.
**Why a decision was required:** Section 26.2.4 derives *labels* from rounded scores but the
explanation rules do not name a precision.
**Interpretation chosen:** Full precision, consistent with "keep full precision internally"
and with step 27 (explanations) preceding step 29 (rounding) in the binding calculation
order.
**Alternative rejected:** Rounded values, which would let serialization affect explanation
content, contradicting the calculation order.
**Output impact:** Only at exact rounding boundaries.
**Specification section:** 26.2.4, 26.13, 26.14.
