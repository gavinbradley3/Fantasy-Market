# FINAL COLD IMPLEMENTATION AUDIT — PlayerTicker Automated Inference Layer

Independent, evidence-driven audit of the Automated Inference Layer (AIL) at the
frozen commit, against the two authoritative documents only:
`AUTOMATED_INFERENCE_LAYER_SPEC_V1.md` and
`AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.md` (air-1.1.0). Implementation reports and
code comments were treated as non-authoritative. Tests were treated as evidence, not
specification. No production code was modified.

---

## 1. Repository State

| Item | Value |
|---|---|
| Audited branch | `origin/claude/playerticker-automated-inference-spec-lm3kt3` |
| Audited commit | **`77fcfcc58ac717de5d4309ed0bfdc82e8ca369ce`** (`feat(inference): Phase 3 — production integration, readiness, engine evaluation`) |
| Expected commit (`77fcfcc`) present? | **Yes** — HEAD of the spec branch |
| Audit performed in | a detached, clean `git worktree` at `77fcfcc` (working tree clean before and after; no code changed) |
| Audit report committed to | `claude/playerticker-ail-cold-audit-r2q1fv` (this branch; report only) |

Repository-state gate: **PASS** — the expected implementation is present and the tree
was clean throughout. (My designated audit branch was at `390838a`; the audited AIL
lives on the spec branch, fetched and inspected read-only at `77fcfcc`.)

---

## 2. Executive Verdict

### Verdict: **PASS WITH MATERIAL CORRECTIONS**

| Score | /100 | Rationale |
|---|---|---|
| Implementation readiness | **88** | Every family model (features, roles, competition, security, environment, availability, projections, D1, D2, confidence, explanations, emission, merge, engine adapter) is implemented, registry-faithful, deterministic, and unit-tested. Independent recomputation matched the implementation on every fixture checked. |
| Production readiness | **58** | The models are **not assembled into an end-to-end production path**. `runInference()` consumes caller-precomputed inference fields; feature extraction, Phase 2A/2B position inference, projections, D1 and D2 have **zero production callers**. The reproducibility checksum is computed over the merged supplement (an output), not the normalized input facts (§15.3/§18.2), and the serialized envelope is a reduced value-only form missing the §15.1 per-field/`status`/`sidecar` structure. |

**Concise rationale.** The AIL is an unusually disciplined body of pure, deterministic,
registry-driven code. The frozen engines are untouched; the whole subsystem is purely
additive under `src/inference/**`; all 1171 tests pass; typecheck and build are clean.
Numerically it is faithful: I re-derived the environment percentile (Fx1 = 53), the
suspension expected-games carve-out (Fx6 = 6.8), the D1 ceiling cap (1500 → 299, tier
penalty 80 on the capped value, +120 proxy), the D2 guardrail (inferred starts →
`BACKUP`, official → `ESTABLISHED_STARTER`), the player WGM (512), and public
confidence (47) **by hand and against the code, and they agreed exactly.** What is
missing is not correctness of the pieces but their **assembly**: the production entry
point does not execute the binding §25.1 steps 4 (build features) and 6 (execute Phase
2A/2B inference); it accepts them precomputed. That is a production-significant
deviation from §24.3/§25.1/§32.5, compounded by a checksum-domain and a serialization
gap. The architecture is sound; the corrections are localized.

---

## 3. Architecture and Execution Path — what `runInference()` actually does

`src/inference/production/runInference.ts` executes, in order:

1. **Input validation** — position supported; `player.identity.canonical_id` present.
2. **As-of** — validates `Date.parse(asOf)` is not `NaN`. **It does NOT drop facts with
   `sourceTimestamp > asOf`** (§25.1 step 2 is only a date-format check here; the raw
   facts are assumed already clamped by the caller).
3. **Registry load + checksum** — `loadRegistry()` validates semver, band ordering, and
   the env-reference checksum (`a1b95e93d706e130`); throws `RegistryValidationError`.
4–5. **Feature build / Phase 2A / Phase 2B — ABSENT.** No feature extraction, no
   projection, no D1, no D2, no role/competition/environment/availability computation
   happens here. The inferred fields arrive **precomputed** as
   `input.inferenceFields: IntermediateField<unknown>[]`.
6. **Emit** — `emitSupplement()` applies the §20.F3 status×field-kind matrix to the
   supplied fields.
7. **Merge** — `mergedSupplement = { ...emit.supplement, ...input.facts }` (facts win).
8–9. **Readiness + engine** — `invokeEngine()` runs the existing per-position
   `assess*Readiness` on the merged supplement and, only if `READY`, calls the frozen
   engine (QB `generated_at` pinned to `asOf`; errors captured as `name: message`).
10–11. **Confidence/honesty** — `buildPlayerConfidence`, `computeSourceQuality`,
    `computePublicConfidence`, `honestyState`.
12. **Explanations** — `composeExplanation([], [], structural)` — **only structural
    fragments** (`MISSING_EVIDENCE`, `SOURCE_FRESHNESS`, `MODEL_VERSION`); no driver
    fragments, because driver deltas would come from the un-wired Phase 2B.
13. **Serialize** — a value-only envelope + a checksum over the merged supplement.
14. **Reproducibility id** — `{snapshotIds, normalizedInputChecksum, registryVersion,
    inferenceLayerVersion, asOf, engineVersion}` (tuple correct; the checksum value is
    the merged-supplement digest).

**Material determination (Part 1/Part 8).** `runInference()` **does not** execute the
complete required inference path; it **consumes already-computed intermediate fields
supplied by the caller.** The §24.3 contract defines the orchestrator as
`runInference(snapshotBundle, asOf, versions) → InferenceRun` performing
`buildFeatures → infer → toSupplements → composePublicConfidence`; §25.1 binds steps
4 (build features) and 6 (execute position inference) inside it. The authoritative
contract does **not** permit a precomputed-`IntermediateField[]` architecture, so this
is a genuine deviation (finding **M1**).

`runPhase2A` and `runPhase2B` (`src/inference/result/`) are separate, partial
orchestrators: 2A computes a *subset* of families (expected games, probability_active,
RB ramp, competition, security, org-commitment, environment scores, QB role, TE depth
role/prospect) and explicitly performs "no projection, no D1/D2, no explanation, no
merge, no readiness, no engine call"; 2B computes confidence/honesty over
already-supplied fields. **Neither chains the other, and neither calls projections, D1,
D2, or feature extraction.**

---

## 4. Traceability Matrix (material binding requirements)

Result codes: V = VERIFIED, PV = PARTIALLY VERIFIED, NI = NOT IMPLEMENTED (in the
production path), C = CONTRADICTORY, U = UNTESTED.

| # | Requirement | Spec / Registry | Implementation symbol | Test | Result | Note |
|---|---|---|---|---|---|---|
| 1 | Registry load + checksum | §32.4 / R§1,§21 | `registry.ts loadRegistry`, `envReference.ts loadEnvReference` | registry.test, envReference.test | **V** | env-ref checksum reproduced `a1b95e93d706e130` |
| 2 | Env reference (canonical, position-independent) | R§20.F1,§21 | `envReference.ts`, `environment.ts componentPercentile` | env tests | **V** | one array for all positions |
| 3 | Numeric rounding (half away from zero) | R§1,§1.1 | `numeric.ts roundHalfAwayFromZero` | numeric.test | **V** | negative-zero normalized; non-finite throws |
| 4 | Percentile (mid-rank, no interp) | R§1,§6.2 | `numeric.ts pct` | numeric.test | **V** | Fx1 = 53.125→53 reproduced |
| 5 | Freshness lifecycle (3-state) | R§20.F5,§16 | `freshness.ts classifyFreshness` | freshness.test | **V** | lower-open/upper-closed; 2·TTL clause absent |
| 6 | Replay / as-of cutoff | §25.1.2 / R§16 | `replay.ts enforceAsOf/withinAsOf` | replay.test | **PV** | correct helper exists but `runInference` does not call it on facts (m5) |
| 7 | Provenance vocabulary | §32.7 | `types/provenance.ts` | — | **V** | AIL never emits DIRECT |
| 8 | Status vocabulary | §32.6 | `types/status.ts` | — | **V** | |
| 9 | Limitation vocabulary | §17 | `types/limitations.ts` | — | **V** | |
| 10 | Feature extraction | R§20.F11 | `features/extract.ts` | extract.test | **PV** | implemented + tested; **no production caller** |
| 11 | Role classification (ladders, tie-break) | R§3,§20.F4 | `roles/roles.ts` | roles.test | **V** | first-match; null-safe; reduced ladders |
| 12 | Reduced ladders (null routing signal) | R§20.F4 | `classifyWR/TE/RBRole` reduced paths | roles.test | **V** | WR strong-target null-route → high_volume_primary |
| 13 | Competition | R§4 | `competition/competition.ts` | competition.test | **V** | teammate-sum + QB role map |
| 14 | Roster security | R§5 | `security/rosterSecurity.ts` | rosterSecurity.test | **V** | `NOT_TRUE_CONTRACT_DATA` attached |
| 15 | Environment scores | R§6.2 | `environment/environment.ts` | environment.test | **V** | drop-and-renormalize; all-missing→null |
| 16 | Availability / Table A | R§7.1 | `availability/availability.ts` | availability.test | **V** | precedence severity ordering |
| 17 | Expected games (+ suspension carve-out) | R§7.2,§20.F6 | `availability/expectedGames.ts` | expectedGames.test | **V** | Fx6 = 6.8 reproduced |
| 18 | Projection blending / shrinkage | R§2 | `projections/projections.ts`, `shrink.ts` | projections.test | **PV** | implemented + tested; **no production caller** |
| 19 | D1 route exposure + guardrail | R§8,§20.F7 | `d1/routeExposure.ts` | routeExposure.test | **PV** | correct; **no production caller** |
| 20 | D2 functional starts + guardrail | R§9,§23.4 | `d2/functionalStarts.ts` + `roles.ts` rule 3 | functionalStarts.test, roles.test | **PV** | guardrail reachable via role path; D2 compute has no production caller |
| 21 | Explanation ranking/rendering | R§14,§20.F12 | `explanations/explanations.ts` | explanations.test | **PV** | composer correct; production passes empty drivers |
| 22 | Field confidence | R§10 | `confidence/fieldConfidence.ts` | fieldConfidence.test | **V** | unvalidated cap 700 |
| 23 | Player confidence (WGM, weakest-critical) | R§11.1,§20.F2 | `confidence/playerConfidence.ts`, `aggregate.ts`, `weightedGeometricMean.ts` | tests | **V** | WGM=512 reproduced; CRITICAL sets exact |
| 24 | Source quality | R§20.F9,§11.3 | `confidence/sourceQuality.ts` | publicConfidence tests | **V** | absent→0.7; min across criticals |
| 25 | Public confidence | R§11.3 | `confidence/publicConfidence.ts` | publicConfidence.test | **V** | 47 reproduced; engine scale score/100 |
| 26 | Honesty state | R§11.4 | `publicConfidence.ts honestyState` | tests | **V** | bands 600/800 |
| 27 | Emission matrix | R§12,§20.F3 | `readiness/integration.ts emissionDecision`, `emit.ts` | emit.test | **V** | matches §20.F3 exactly |
| 28 | Merge precedence | R§13 | `runInference` spread; `merge.ts` | merge.test, production.test | **PV** | facts win (field-equivalent); binding helper bypassed (m2) |
| 29 | Readiness | §21 / R§12 | `engineAdapter.ts` via `assess*Readiness` | production.test | **V** | present-even-null satisfied; omit→NOT_READY |
| 30 | Engine routing / invocation | §25.1.11 | `engineAdapter.ts invokeEngine` | production.test | **V** | READY-gated; QB `generated_at`=asOf |
| 31 | Engine-confidence integration | R§11.3 | `runInference` + `computePublicConfidence` | production.test | **V** | engineConfidence01 = score/100 |
| 32 | Serialization order | R§15.1,§20.F8 | `serialize.ts`, `fieldKinds.ts declarationOrder` | production.test | **PV** | supplement order matches interface; envelope omits `status`/`sidecar`/per-field metadata (M3) |
| 33 | Checksum | R§15.3,§18.2 | `serialize.ts` `digest(stableStringify(mergedSupplement))` | production.test | **C** | over merged supplement (output), not normalized facts (M2) |
| 34 | Reproducibility id | R§1 | `replay.ts buildReproducibilityId` | replay.test | **V** | tuple structure correct (carries M2 checksum value) |
| 35 | Failure handling | §32.11 | `ProductionValidationError`, engine try/catch | production.test | **V** | typed errors; `name: message`; no stack in output |

---

## 5. Critical Findings

**None.** No path was found that overwrites observed facts, invokes an engine
incorrectly, produces a materially wrong valuation, violates determinism, leaks future
information, or misrepresents an individual player's readiness. The engine adapter is
READY-gated and calls frozen engines unchanged; the merge lets facts win; the
implemented pure functions are clock/random/locale-free.

---

## 6. Major Findings

### M1 — Production `runInference()` does not execute Phase 2A/2B; the inference models are dead in production
- **Files:** `production/runInference.ts` (consumes `input.inferenceFields`),
  `production/types.ts` (`ProductionInput.inferenceFields`), `result/orchestrator.ts`,
  `result/phase2b.ts`; `projections/*`, `d1/*`, `d2/*`, `features/*`.
- **Binding rule:** §24.3 (`runInference(bundle, asOf, versions)` performs feature
  build + inference + supplements + public confidence); §25.1 steps 4 & 6; §32.5.
- **Current behaviour:** `runInference()` accepts precomputed `IntermediateField[]`
  plus a facts supplement. `projectShare`, `projectTeamVolume`,
  `expectedActiveGamePassAttempts`, `computeCareerRoutes`, `rbRouteParticipationLast4`,
  `computeFunctionalStarts`, and every `features/extract.ts` function have **zero
  references outside their own files and tests** (verified by exhaustive grep).
  `runPhase2A` computes only a subset of families and never calls projections/D1/D2;
  `runPhase2B` only aggregates confidence; nothing chains raw facts → features →
  2A → 2B → emit. Consequence: production explanations carry no driver fragments.
- **Required behaviour:** a single orchestrator must execute steps 4 and 6 internally
  (build features from the snapshot bundle, run all Phase 2A/2B family models to
  produce the `InferredField[]`), then feed emit/merge/readiness/engine/confidence.
- **Severity rationale:** the individual models are correct, but the binding execution
  order and orchestrator contract are not met; two implementations wiring the caller
  side differently would diverge (the assembly is unspecified in code).

### M2 — `normalizedInputChecksum` is computed over the merged supplement (an output), not the normalized input facts
- **File/symbol:** `production/serialize.ts` line 60
  `const checksum = digest(stableStringify(input.mergedSupplement))`, passed as
  `normalizedInputChecksum` into `buildReproducibilityId`.
- **Binding rule:** R§15.3 (`normalizedInputChecksum = digest(canonical_facts_json)`
  over the **normalized facts**); §18.2 ("stable hash of the sorted normalized facts").
- **Current behaviour:** the hashed object is `{ ...ailSupplement, ...facts }` — it
  **excludes** all non-supplement normalized facts (identity, raw stats not in the
  supplement spec) and **includes** AIL `MODEL_ESTIMATE`/`MODEL_CLASSIFICATION` output
  values. Determinism holds (same inputs → same output → same digest), but the
  identifier no longer denotes "same normalized input"; a model-version change alters
  the "input" checksum.
- **Required behaviour:** hash the canonical, key-sorted, whitespace-free serialization
  of the normalized **facts** (§15.3), not the merged supplement.

### M3 — Serialized production envelope is a reduced value-only form, missing the §15.1 structure
- **File/symbol:** `production/serialize.ts serializeProduction` (`fields` = `{field,
  value}[]`; envelope keys `schema_version, registry_version, model_version, player_id,
  position, as_of, readiness, honesty_state, fields`).
- **Binding rule:** R§15.1 top-level order includes `status` and `sidecar`; each
  `InferredField` serializes `field, value, status, provenance, confidence, modelId,
  modelVersion, asOf, effectiveFor, expiresAfter, inputsUsed, assumptions, limitations,
  explanation`.
- **Current behaviour:** the serialized bytes omit the top-level `status`, omit
  `sidecar`, and reduce every field to `{field, value}` — no per-field status,
  provenance, confidence, inputs, assumptions, limitations, or explanation. (The rich
  data exists on the in-memory `ProductionResult`, just not in the serialized string
  that anchors reproducibility.)
- **Required behaviour:** serialize the full per-field `InferredField` shape and the
  top-level `status`/`sidecar` per §15.1, or amend §15.1 to define this reduced
  production envelope explicitly.

---

## 7. Minor Findings

- **m1 — cosmetic-flag importance weight.** `playerConfidence.ts importanceWeight`
  assigns `minor` (0.5) only to `previous_*`/`career_*`; §11.2 also lists "cosmetic
  flags" as 0.5, but booleans (`teammate_return_flag`, etc.) get `standard` (1.0).
  Small WGM effect; two implementations can differ slightly on player_conf.
- **m2 — merge bypasses the binding helper.** `runInference` uses a raw
  `{ ...ail, ...facts }` spread rather than the exported `mergeFactsOverAil` /
  `mergeSupplements` (R§13.2). Field-level equivalent (facts win, present-null wins),
  so behaviour matches; but the dedicated helper and `mergeByPrecedence` are dead code,
  and an explicit-`undefined` fact key would clobber an AIL value (theoretical).
- **m3 — D2 `recent_start_rate` when `recent_games = 0`.** Returns `null`; R§9.1 says
  it should be "treated as 0 for §6.2 with a limitation." Consumer coercion; latent
  because §6.2 is not wired to D2.
- **m4 — TE production baseline-equivalence untested.** `production.test.ts` covers
  WR/RB/QB explicitly but not TE. I constructed a TE case independently (complete TE
  facts → `runInference`) and confirmed `engineOutput` equals a direct
  `evaluateTightEnd(assessTEReadiness(...).input)` — so this is a **test-coverage gap,
  not a defect**.
- **m5 — as-of cutoff not enforced on facts in production.** `runInference` validates
  the date string only; §25.1 step 2 ("drop every fact with `sourceTimestamp > asOf`")
  is not applied (a consequence of consuming precomputed fields). The `enforceAsOf`
  helper exists and is tested but unused in production.

---

## 8. Observations

- **O1** — The entire `src/inference/**` subsystem has **no importer outside itself**;
  it is not wired into the app, pipeline, or UI. (This underlies the clean
  non-regression result and confirms the layer is not live.)
- **O2** — `src/inference/index.ts` header comment is stale: it still says
  "`runInference` … throws until a later phase implements it," though Phase 3 now
  implements it.
- **O3** — The "TE never computes routes / TE 399 ceiling" tension is **resolved
  correctly**: `computeCareerRoutes` returns `UNAVAILABLE` for TE (and RB); the TE 399
  `TIER_CEILING`/tier-penalty table is a latent constant reachable only by a *charted*
  (DERIVED) TE source, exactly as R§8.1 rung 1 intends. No conflict in code.
- **O4** — There is no whole-registry checksum; only the env-reference checksum is
  validated. This matches R§1 (which defines only the env-reference checksum).

---

## 9. Independent Reproduction Results (expected vs actual)

All values recomputed **outside** the production functions (hand-derivation) and then
compared to the implementation via an audit-only harness (removed after use).

| Case | Independent expected | Implementation actual | Match |
|---|---|---|---|
| Env-ref checksum (digest of canonical string) | `a1b95e93d706e130` | `a1b95e93d706e130` | ✅ |
| Fx1 `pct(2.05, team_points_per_drive)` = 100·(8+0.5)/16 | 53.125 → 53 | 53.125 | ✅ |
| Fx6 suspension EGR: `round1(max(9−2,0)·0.97·1.0)` | 6.8 | 6.8 | ✅ |
| Fx7 D1 WR estimate 1940 → cap | emit 299, PROXY, tier 80, proxy 120 | 299 / PROXY / 80 / 120 | ✅ |
| D1 RB/TE career_routes | UNAVAILABLE | UNAVAILABLE | ✅ |
| Fx8 D2 inferred (`MODEL_ESTIMATE`, rate .94, 60 starts, 8 seasons) | not `ESTABLISHED_STARTER` → `BACKUP` | `BACKUP` | ✅ |
| Fx8 D2 same inputs, `DERIVED` provenance | `ESTABLISHED_STARTER` | `ESTABLISHED_STARTER` | ✅ |
| Player WGM: `min(exp((3·ln700+ln200)/4), 700)` | 512 (raw 511.78) | 512 | ✅ |
| Public conf: `round(0.8·(0.75·0.79·1.0)·100)` | 47 | 47 | ✅ |
| TE baseline: `runInference` engineOutput vs direct `evaluateTightEnd` | equal | equal | ✅ |

No differences, including no rounding differences.

---

## 10. Position Baseline Equivalence

Method: feed a **complete** engine-input fixture as `facts` with `inferenceFields=[]`;
`runInference` must reach `READY`, invoke the frozen engine, and return an
`engineOutput` byte-equal to a direct engine call on the same readiness input.

| Position | Source | READY | Engine invoked | engineOutput == direct call | Evidence |
|---|---|---|---|---|---|
| **WR** | `metrics.sample.json` wr `pt_0001` | ✅ | ✅ | ✅ | `production.test.ts` (repo) |
| **RB** | `rb-model/fixtures/rb/explosive-rookie.json` | ✅ | ✅ | ✅ | `production.test.ts` (repo) |
| **QB** | `metrics.sample.json` qb `pt_0002` (`generated_at`=asOf) | ✅ | ✅ | ✅ | `production.test.ts` (repo) |
| **TE** | `tests/te-model/helpers.ts baseInput()` | ✅ | ✅ | ✅ | **audit-constructed** (repo tests omit TE — m4) |

All four positions are equivalent to the pre-AIL direct engine path; the AIL adds
nothing to a facts-complete player and never overwrites a fact.

---

## 11. D1 Verification

`d1/routeExposure.ts` — every R§8 guardrail holds:
- WR-only `×0.97` (`D1.wrRouteFactor`); RB-only `×0.42` window proxy
  (`rbRouteParticipationLast4`, clamp `[0,1]`, 4 dp); **TE never computes** (returns
  `UNAVAILABLE`). WR `0.97` cannot reach RB/TE; RB `0.42` cannot reach WR/TE.
- Rung 1 **charted** routes are `DERIVED` and the **only** rung allowed to exceed the
  ceiling. Estimates are capped `min(estimate, TIER_CEILING[pos])` (WR 299).
- Route-tier confidence penalty is computed on the **capped** emitted value (§20.F7),
  reproduced: 1940 → cap 299 → tier `100–299` → 80, plus `ROUTE_PROXY_PENALTY` 120.
- Uncapped estimate (1940) retained separately (sidecar); provenance `MODEL_ESTIMATE`
  when any uncovered/pbp game contributes, else `PROXY`; ≥3-covered-games gate.
- Low-exposure penalties remain in force (an estimate can never reach the unpenalized
  ≥300 tier). **TE-never-computes / TE-399 tension resolved** (O3).

---

## 12. D2 Verification

`d2/functionalStarts.ts` + `roles.ts classifyQBRoleStatus`:
- Official (rung 1) → `DIRECT`/`DERIVED`, `startsOfficial=true`, no penalty; distinct
  from inferred (rung 2) `functional_start = snap≥0.50 AND attempts≥10`,
  `MODEL_ESTIMATE`, `INFERRED_START_NOT_OFFICIAL`, +120.
- Regular-season only; future-dated plays excluded (`kickoff < asOf`); postseason
  excluded; multi-team career aggregation; recent window via `last17TeamGameIds`;
  `recent_games=0 → recent_starts NOT_APPLICABLE`; no games → `UNAVAILABLE`.
- **ESTABLISHED_STARTER guardrail:** ladder rule 3 requires
  `isOfficialProvenance(startsProvenance)` (`DIRECT`/`DERIVED`, the corrected §23.4/D2
  predicate). Independently confirmed: high inferred starts → **not** `ESTABLISHED`
  (falls to `BACKUP`); identical inputs with `DERIVED` → `ESTABLISHED_STARTER`.

---

## 13. Confidence Verification (with independent examples)

- **Field** (`fieldConfidence.ts`): `clamp(1000 − Σpenalties, 0, 1000)`; exact step
  penalties (`P_PROVENANCE 0/120/80/60/100`, recency `0/60/150`, sample `0/80/150`,
  completeness `40/cap 200`, conflict 80, cross-season 60, catch-all 120, reduced 80);
  unvalidated → cap 700 + `UNVALIDATED_MODEL`. Matches R§10.
- **Player** (`aggregate.ts`, `playerConfidence.ts`, `weightedGeometricMean.ts`):
  `min(WGM, weakest_critical)` clamped `[50,1000]`, integer. `FLOOR_IN=1`.
  Membership (§20.F2): `INSUFFICIENT=200`, `UNAVAILABLE=100`, `NEUTRAL_DEFAULT=400`,
  `NOT_APPLICABLE` excluded. CRITICAL sets exact for all four positions. **Independent:**
  fields {target_share@700 (critical, w3), adot@INSUFFICIENT=200 (w1)} →
  WGM=exp((3ln700+ln200)/4)=511.78→512, weakest_critical=700, min=512. Actual **512**.
- **Public** (`publicConfidence.ts`): `coverage=clamp(0.5+0.5·verified,0.5,1)`,
  `quality=clamp(0.3+0.7·conf/1000,0.3,1)`, `source=clamp(0.6+0.4·minFresh,0.6,1)`,
  `public=round(clamp(engine01·cov·qual·src,0,1)·100)`; `engine01=score/100`.
  **Independent:** conf 700, verified 0.5, source 1.0, engine 0.8 → 0.75·0.79·1.0=0.5925,
  0.8·0.5925=0.474→**47**. Actual 47.
- **Scale consistency:** field & player confidence are consistently **0–1000
  integer**; public confidence is **0–100 integer**; engine confidence is normalized
  `score/100` to 0–1 before the multiply. **No scale-conversion defect found.**
- **Honesty** (`honestyState`): omitted-critical→`UNAVAILABLE`; `<600` or any critical
  `FALLBACK`→`LIMITED`; `≥800`→`VERIFIED` (all-official) / `ESTIMATED_HIGH_CONFIDENCE`;
  else `ESTIMATED`. Bands 600/800 (§11.4). Matches.

---

## 14. Emission, Merge, and Readiness Verification

- **Emission** (`readiness/integration.ts emissionDecision` + `emit.ts` +
  `fieldKinds.ts`): the status×field-kind table is **identical to R§20.F3** —
  AVAILABLE/LOW_CONFIDENCE → present-value; INSUFFICIENT/UNAVAILABLE/NOT_APPLICABLE →
  present-null (nullable), **omit** (non-nullable numeric → NOT_READY), present-neutral
  (enum/bool). Neutral members match §20.F3.1 (`UNKNOWN`/`STABLE`/`BACKUP`/`false`).
  Nullable `NOT_APPLICABLE` → present-null (per the binding table, not inferred from
  tests).
- **Merge**: `{ ...ailSupplement, ...facts }` is field-level identical to the
  repository's `mergeSupplements` (which itself does `{...b, ...o}` per field). Facts
  (present, incl. observed-null) win; AIL-only fields survive; TE
  `route_participation_*` stays absent (engine proxy). The spread **does** implement
  the ownership contract for present/null; the only theoretical gap is an
  explicit-`undefined` fact key (m2). Binding helper `mergeFactsOverAil` is bypassed.
- **Readiness**: production uses the existing `assess*Readiness` on the **merged
  supplement** (emitted values), READY-gates the engine, and never depends on sidecar
  inference metadata. Present-even-null satisfies; omitted → NOT_READY. A NOT_READY
  player still yields a full honesty result with no engine valuation.

---

## 15. Serialization and Reproducibility Verification

- **Order:** supplement `fields` are ordered by the engine-input interface declaration
  order (metadata stripped, §20.F8) — verified against `WRMVPInput` (subsequence
  matches `WR_SPEC`). `inputsUsed`/`assumptions`/`limitations` ordering helpers exist.
- **Determinism:** repeated runs and **shuffled fact-key order** produce a byte-stable
  checksum (repo `production.test.ts`); no clock/random/locale in the subsystem;
  `roundHalfAwayFromZero` throws on non-finite (no `NaN`/`Infinity`); negative-zero
  normalized. Env-ref checksum independently reproduced.
- **Defects:** **M2** (checksum over merged supplement, not normalized facts) and
  **M3** (envelope omits `status`, `sidecar`, and per-field `InferredField` structure).
  The reproducibility **tuple** is otherwise correct and includes `registry_version`
  (§1).

---

## 16. Validation Results

Run in the clean worktree at `77fcfcc` (`npm ci` then the project scripts):

| Command | Exit | Result |
|---|---|---|
| `npm test` (`vitest run`) | **0** | **126 test files, 1171 tests, all passing** |
| `npm run typecheck` (`tsc -b --noEmit` + te/qb tsconfigs) | **0** | clean |
| `npm run build` (`tsc -b && vite build`) | **0** | clean |
| lint | — | no lint script configured (`package.json` has none) |
| Working tree after audit | clean | audit harness removed; worktree pruned |

No production code was altered to make anything pass.

---

## 17. Non-Regression Results

- The **four AIL implementation commits** (`98504d5..77fcfcc`) changed **no file
  outside `src/inference/**` and markdown docs** — verified by
  `git diff --name-only`, filtered for `wr/rb/te/qb-model`, `readiness/engineReadiness`,
  `pipeline/`, UI/pages/components, goldens, and engine fixtures: **empty**.
- No engine formula/type/threshold/golden changed; the engines are imported and called
  unchanged (`engineAdapter.ts`). All engine tests are among the 1171 passing.
- The AIL shares only genuinely-shared infrastructure (`pipeline/hash.ts`,
  `pipeline/provenance`, `pipeline/readiness/engineReadiness` for merge/readiness
  types) and does not mutate it. No indirect behaviour change to engines via shared
  utilities, types, registry values, or imports was found. **Non-regression: PASS.**

---

## 18. Required Corrections

| ID | File / symbol | Binding rule | Current | Required | Smallest safe correction | Required test |
|---|---|---|---|---|---|---|
| **M1** | `production/runInference.ts`, `result/orchestrator.ts`, `result/phase2b.ts`; `features/*`, `projections/*`, `d1/*`, `d2/*` | §24.3, §25.1 steps 4&6, §32.5 | consumes precomputed `inferenceFields`; projections/D1/D2/features have no production caller | orchestrator executes feature build + full Phase 2A/2B internally from the snapshot bundle | add a top-level `runInference(bundle, asOf, versions)` that calls `buildFeatures → runPhase2A(+projections/D1/D2) → runPhase2B → emit → merge → readiness → engine → confidence → serialize`, then have the production entry delegate to it | end-to-end test: raw facts (no precomputed fields) → serialized result; assert a projected/role/D1/D2 field is produced and drives readiness |
| **M2** | `production/serialize.ts:60` | R§15.3, §18.2 | `digest(stableStringify(mergedSupplement))` | `digest` of canonical key-sorted normalized **facts** | hash the normalized facts object (not the merged supplement); keep the merged-supplement digest, if wanted, as a separate `outputChecksum` | test: two runs with same facts but different AIL model output yield the **same** `normalizedInputChecksum`; non-supplement facts change it |
| **M3** | `production/serialize.ts serializeProduction` | R§15.1, §20.F8 | envelope omits top-level `status`, `sidecar`; `fields` = `{field,value}` | serialize full `InferredField` per field + top-level `status`/`sidecar` in §15.1 order | build `fields` from the emitted `InferredField[]` with the §15.1 key order; add `status` and `sidecar`; or amend §15.1 to define this reduced envelope | byte-assert a serialized field contains `status/provenance/confidence/...`; assert top-level `status` and `sidecar` present |
| **m1** | `confidence/playerConfidence.ts importanceWeight` | R§11.2 | cosmetic flags → 1.0 | cosmetic flags → 0.5 | map the known boolean flag fields to `minor` | unit: a flag field carries weight 0.5 |
| **m2** | `production/runInference.ts:56` | R§13.2 | raw spread | use `mergeFactsOverAil`/`mergeSupplements` | replace the spread with the exported helper | test: explicit-`undefined` fact key does not clobber an AIL value |
| **m3** | `d2/functionalStarts.ts` | R§9.1 | `recent_start_rate=null` at `recent_games=0` | treated as 0 for §6.2 + limitation | return a documented sentinel or coerce at the env consumer | unit: `recent_games=0` yields the §6.2-usable 0 with limitation |
| **m4** | `production/production.test.ts` | R§26.2 | no TE production case | add TE baseline equivalence | mirror the WR/QB test for TE | TE `engineOutput == evaluateTightEnd(direct)` |
| **m5** | `production/runInference.ts` step 2 | §25.1.2 | date parse only | drop facts with `sourceTimestamp > asOf` (once raw facts flow in with M1) | apply `enforceAsOf` in the M1 orchestrator | replay test: a post-asOf fact does not influence output |

---

## 19. Final Recommendation

**Correct the listed issues, then re-audit.**

The AIL's models are complete, deterministic, and faithful to the frozen registry, and
the frozen engines are provably untouched — this is high-quality work. But the
production **execution path** does not yet assemble those models end to end (M1), and
the reproducibility checksum (M2) and serialized envelope (M3) do not meet the binding
serialization contract. **Do not authorize live-data ingestion** on the strength of
`runInference()` as it stands: because it consumes caller-precomputed inference fields,
"production readiness" of the entry point overstates what is actually wired. Land M1–M3
(and ideally m1–m5), add the end-to-end and TE tests, and re-audit the assembled path;
at that point the layer should be authorizable for live-data work within its declared
scope.

---

*Audit complete. No production code was modified. Working tree clean; audit worktree
removed.*
