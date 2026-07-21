# Automated Inference Layer — Completion Report

Companion to `AUTOMATED_INFERENCE_LAYER_SPEC_V1.md`. Specification task only — no
production code, engine, pipeline behaviour, or player value was changed.

---

## 1. Repository review

- **Branch:** `claude/playerticker-automated-inference-spec-lm3kt3`.
- **HEAD:** `8b03353c451e93549ba3c193eda9be45ecd19124`
  (`docs(readiness-audit): live-MVP data-strategy audit & recommendation`), the tip
  of `origin/claude/playerticker-live-readiness-frontier` — matching the task's
  expected source commit `8b03353`.
- **Working-tree status:** clean at reset; then only the two new spec/report docs
  added (no source/engine/pipeline files touched).
- **Baseline verified:** `npm ci` + `npm test` → **982 passing tests, 96 files**.
  Four frozen engines (`src/wr-model`, `src/rb-model`, `src/te-model`,
  `src/qb-model`); canonical metadata + nflverse weekly/snap/participation pipelines;
  staged provenance/readiness; readiness-frontier audit. Matches the expected
  verified baseline exactly.
- **Documents read:** `MARKET_MODEL_FOUNDATION_V2.md` (full); WR
  `WR_VALUATION_MODEL_v1.2_FINAL.md`, RB `RB_VALUATION_MODEL_v1.1_FINAL.md`, TE
  `TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md` (via binding type contracts + fallbacks);
  QB contract (`src/qb-model/types.ts`; no standalone QB markdown exists —
  source-is-authoritative); `READINESS_FRONTIER_AUDIT.md`,
  `PARTICIPATION_FEASIBILITY.md`, `DATA_PIPELINE*.md`; engine `types.ts`, `fallbacks.ts`,
  `confidence.ts`; pipeline `types.ts`, `provenance.ts`, `readiness/engineReadiness.ts`,
  `readiness/metrics.ts`, `readiness-audit/classifier.ts`, `snaps/proxyRegistry.ts`,
  `stats/derive.ts`.
- **Discrepancies (initial checkout vs. task baseline):** the session initially
  opened at `390838a` on the inference-spec branch (an earlier repo state lacking the
  QB engine, pipeline, and readiness-frontier). Per the user's instruction I fetched
  all remotes, verified `origin/claude/playerticker-live-readiness-frontier` =
  `8b03353`, confirmed the commit exists, and reset the designated branch to exactly
  `8b03353`, then confirmed the 982-test baseline. The specification is written
  against this verified baseline (the true source of truth). No other discrepancy
  remains.

## 2. Field coverage

- **Directly sourceable (adapter pass-through):** the eight metadata keys (already
  produced), `practice_status`, and free counting stats (targets, carries, attempts,
  receptions, games) → `career_targets`, `career_touches`, `career_carries`,
  QB `career_games_played`/`career_pass_attempts`/`career_rush_attempts`,
  `team_change`/`new_team_flag`.
- **Inferable (deterministic, no contract change):** every projection/context/role/
  environment/availability field — `expected_games_remaining`, team volume
  (`projected_team_dropbacks`, `projected_team_non_qb_rush_attempts`,
  `team_points_per_drive`, `team_red_zone_trips_per_game`), environment scores
  (`qb_environment_score`, `offensive_environment_score`, `protection_context_score`,
  `qb_rush_pressure`), shares/efficiency projections, role classes
  (`route_role_change`/`role_change`/`depth_chart_role`/`depth_chart_status`/
  `role_status`/`prospect_type`/`recent_role_change`/`major_system_change`),
  `competition_pressure` + flags, `contract_security`/`organizational_commitment`
  (reduced roster-security model), `workload_ramp_factor`, `probability_active`,
  `coaching_continuity`.
- **Requiring proxies (nullable, non-blocking):** `route_participation_last4/last8`,
  `targets_per_route_run` — WR via authorized pass-snap proxy (needs pbp); TE via the
  engine's own snap-share fallback (AIL supplies `snap_share_last4`); RB via its own
  spec proxy or `UNAVAILABLE`. The WR `×0.97` proxy is never applied to RB/TE/QB.
- **Requiring contract changes (blocking):** WR/RB/TE `career_routes` (Decision D1);
  QB `career_starts`/`recent_starts` (Decision D2).
- **Must remain unavailable (until a decision/source):** true contract-security data
  (unless a licensed source S10 is cleared); any field whose only source has
  unresolved legality and no fallback.

## 3. Architecture summary

- **Feature layer:** provider-neutral, as-of-clamped `FeatureValue<T>` with unit,
  window, coverage, provenance chain, proxy flag (Section 4). Pure functions of facts
  + asOf + version.
- **Model registry:** single source of coefficients, thresholds, TTLs, bounds,
  CRITICAL sets, importance weights, and per-artifact semver (Sections 18, 24).
- **Outputs:** `InferredField<T>` (value/status/provenance/confidence/model identity/
  evidence/assumptions/limitations/explanation) → `MetricsSupplements`
  (`Partial<MetricsSupplement>`) + `InferenceSidecar` (Section 5). Plugs into the
  existing `mergeSupplements` → `assessReadiness` seam without engine change.
- **Confidence:** field-level integer 0..1000 (start 1000, subtract registered
  penalties); player-level `min(weighted geometric mean, weakest-critical)` — a
  separate object from engine confidence (Section 15).
- **Explanations:** deterministic structured fragments rendered from fixed templates;
  association language only (Section 17).
- **Readiness integration:** recommended READY_DIRECT/ESTIMATED/LIMITED/NOT_READY
  split over the existing readiness layer; engine called only with typed-bounded
  inputs (Section 21).
- **Historical replay:** as-of cutoff + pure version-pinned models + reproducibility
  key + replay guard test (Sections 18, 25, 26.5).

## 4. Position summary

- **WR:** all free-derivable inputs automatable; route windows via pass-snap proxy
  (needs pbp); `career_routes` blocked pending D1. Expected automated coverage: full
  READY_ESTIMATED once D1 + pbp land.
- **RB:** all free-derivable inputs automatable; route windows RB-specific or
  UNAVAILABLE (no WR-proxy inheritance); `career_routes` blocked pending D1.
- **TE:** all free-derivable inputs automatable; route participation handled by the
  frozen engine's own snap proxy (AIL supplies `snap_share_last4`); `career_routes`
  blocked pending D1; `prospect_type`/`depth_chart_role` classified from usage.
- **QB:** all free-derivable inputs automatable (environment, projections, role,
  availability); `career_starts`/`recent_starts` blocked pending D2 (direct source or
  inferred functional-start metric).
- **Expected automated coverage:** Phases B–C make every free-derivable supplement
  field automatic for all four positions; Phase D (D1/D2) makes 100–150 curated live
  active players READY_ESTIMATED with honest confidence and no manual entry.

## 5. MVP feasibility

**FEASIBLE WITH TARGETED CONTRACT AMENDMENTS.**

Precisely: under **current** contracts, no free stage makes a live active WR/RB/TE/QB
`READY` — `career_routes` (post-2023 paid) and QB official starts (no free feed) are
blocking and non-null, exactly as `READINESS_FRONTIER_AUDIT.md` measures (context +
projections together unlock 0). Everything else — projections, environment, role,
competition, roster-security, availability — is deterministically inferable from free
data with no engine change. Making live players evaluable **without** paid or manual
data requires two isolated amendments: **D1** (accept an estimated *effective route
exposure* for `career_routes`) and **D2** (accept a direct or inferred functional-start
metric for QB starts), each with explicit PROXY/MODEL_ESTIMATE provenance and reduced
confidence. With D1/D2 the system is fully automatable at hobby scale; without them it
degrades honestly to the current NOT_READY frontier rather than fabricating readiness.

## 6. Required decisions (unresolved)

D1 estimated `career_routes`; D2 inferred/sourced QB starts; D3 readiness-state split;
D4 public-confidence separateness; D5 route/projection error bounds; D6 confidence
bands + honesty thresholds; D7 LIMITED-honesty ranking/market-movement policy; D8
redefining career-fact fields as forward-looking exposure. Full options/recommendations/
impacts/risks/amendment targets are in Spec Section 31.

## 7. Implementation phases (recommended order + readiness effect)

- **A Core framework** → readiness impact 0 (enables all).
- **B Automatically inferable facts** (expected games, team volume, environment,
  continuity/change flags, direct role signals) → removes the projections/context wall;
  routes/starts still block.
- **C Position projections** (WR/RB/TE/QB shares, efficiency, expected active-game
  workload, competition, roster-security) → players blocked only by routes/starts.
- **D Difficult blockers** (routes via D1 + pbp; QB starts via D2; contract-true if
  licensed) → **the decisive milestone**: unlocks live active players to
  READY_ESTIMATED (100–150 curated).
- **E Integration + public confidence** (supplements/sidecar, readiness-state split,
  honesty, reports, UI disclosure) → evaluable players become publishable and honestly
  labelled.

Prioritized by *players moved to evaluable*, not raw field count.

## 8. Specification quality assessment (1–100)

| Dimension | Score | Rationale |
|---|---|---|
| Determinism | 96 | Pure models, as-of cutoff, fixed ordering/precision, integer confidence, reproducibility key, replay guard. −4: final byte-equivalence depends on the registry's numeric values (D5/D6) being pinned before two implementations match exactly. |
| Implementation precision | 90 | Binding MVP contract (S32), per-field dispositions, formulas by reference, exact status/provenance semantics. −10: some coefficients/thresholds are registry inputs deferred to D5/D6, deliberately, so numeric outputs converge only after calibration. |
| Data realism | 95 | Grounded in the actual free-source audits (participation ended 2023, WR-only ×0.97, TE engine-owned proxy, snaps≠starts); no assumed source lacks a fallback. −5: pbp pass/run split and a starts source are candidates needing implementation-time verification. |
| Model governance | 97 | Semver per artifact, evidence tags, validation/promotion gates, walk-forward no-leakage, incident override isolated, fixture-regeneration control. −3: numeric validation tolerances pending D5. |
| Public transparency | 96 | Provenance never DIRECT for estimates, honesty states, per-input disclosure, global "verified + estimates" statement, confidence bands. −4: exact honesty cut points pending D6/D7. |
| Hobby-stage practicality | 92 | MVP-critical vs deferrable split, one-developer registry operation, overengineering risks named. −8: route/starts calibration + pbp ingestion are real added scope beyond the free stages. |
| Overall implementation readiness | 92 | Two developers converge on structure, provenance, status, readiness, serialized shape from S32; full numeric equivalence and live readiness are gated on the isolated, enumerated decisions D1/D2/D5/D6 — surfaced, not hidden. |

Scores below 100 are driven by three deliberate, disclosed factors: (a) numeric
coefficients/bands/tolerances are governed registry inputs deferred to product
decisions D5/D6 rather than invented; (b) live readiness is genuinely blocked by
contract facts (routes/starts) that only D1/D2 can resolve; (c) two candidate sources
(pbp split, official starts) require implementation-time verification. None is a
specification defect — each is an honestly-surfaced data or governance boundary, which
the constitution requires (P27, §8.5, §23.3).

## 9. Git state

Specification task. Branch `claude/playerticker-automated-inference-spec-lm3kt3` was
reset to the verified readiness-frontier tip `8b03353` and carries only the two new
documents (`AUTOMATED_INFERENCE_LAYER_SPEC_V1.md`, this report). No engine, pipeline
production behaviour, or golden output was modified; no inference code was implemented.
Committed and pushed to the designated branch. No force-push, no merge to main, no PR.
Working tree left clean.
