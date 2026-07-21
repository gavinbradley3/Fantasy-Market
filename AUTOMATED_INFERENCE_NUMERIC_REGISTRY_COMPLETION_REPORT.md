# Numeric Registry — Completion Report

Companion to `AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.md`. Specification task only —
no code implemented, no engine or golden output modified.

---

## 1. Files reviewed

- `AUTOMATED_INFERENCE_LAYER_SPEC_V1.md` (all 33 sections; §5–16, §32 traced for open symbols).
- `AUTOMATED_INFERENCE_LAYER_COMPLETION_REPORT.md`.
- Cold-session audit findings (this chat): C1, M1–M8, m1–m3, D1/D2 guardrails.
- Repository (for reuse of engine conventions):
  - `src/wr-model/constants.ts` (confidence start/labels, fallback penalties, draft-round security, TPRR/efficiency shrink K, age bands, AV lookup, explanation max drivers).
  - `src/te-model/constants.ts` (workload-ramp table, contract-security-by-round, route proxy 0.72/0.85, efficiency shrink Ks, career-route confidence tiers, AV lookup).
  - `src/rb-model/constants.ts` (career-touch confidence tiers, draft-round security, workload ramp, AV values, labels 80/60).
  - `src/qb-model/constants.ts` (`DROPBACK_SHARE_BY_DEPTH`, `EXPECTED_PASS_ATTEMPTS_BY_ROLE`, `COMPETITION_PRESSURE_BY_ROLE`, `DRAFT_COMMITMENT_BY_ROUND`, `ROLE_COMMITMENT_BY_ROLE`, `ACTIVE_PROBABILITY_BY_INJURY`).
  - `src/te-model/percentiles.ts` (`pct` mid-rank, `roundTo` half-away-from-zero, `clamp`).
  - `src/pipeline/hash.ts` (`fnv1a32`, `digest`).
  - `src/pipeline/readiness/engineReadiness.ts` (`mergeSupplements` overlay-wins; `assessFromSupplement` present-even-null semantics).
  - `src/pipeline/readiness/metrics.ts` (field→stage ownership).
  - Engine input types (WR/RB/TE/QB `types.ts`) for field nullability, enum neutral members, and interface declaration order.

## 2. Registry sections completed

All 19: identity/precision (1); projection parameters (2); role classification (3);
competition (4); contract/roster security (5); team & QB environment (6);
availability & expected games (7); routes/D1 (8); QB starts/D2 (9); field confidence
(10); player & public confidence (11); emission matrix (12); merge precedence (13);
explanation (14); serialization & reproducibility (15); TTL/freshness (16);
consolidated constant tables (17); internal validation (18); reconciliations (19).

## 3. Audit findings closed

| Item | Closed by | Mechanism |
|---|---|---|
| C1 | §1–§17 | every coefficient/threshold/weight/prior/clamp/penalty/boundary/precision fixed |
| M1 | §12 | binding status×field-kind emission matrix (adds enum/bool neutral-member category) |
| M2 | §13 | precedence order + exact `mergeSupplements(ail, facts)` argument binding |
| M3 | §15.1 | field order = engine input interface declaration order |
| M4 | §11.1 | exact weighted geometric mean (normalization, FLOOR_IN, membership, null handling) |
| M5 | §11.3 | three explicit factor-mapping formulas |
| M6 | §1 + §6.2 | repo mid-rank `pct`, named reference arrays, drop-and-renormalize on missing |
| M7 | §14 | 3/3 counts, contribution-weight formula, threshold, ranking, tie-break, structural order |
| M8 | §3 | ordered decision ladders per position, first-match tie-break |
| m1 | §2.1 | linear `w_recent = clamp(games/4,0,1)` |
| m2 | §15.3 | canonical fact serialization + `digest` |
| m3 | §7.4 | RB computes ramp (TE table); TE defers to engine |
| D1 guardrail | §8.4 | `TIER_CEILING` cap (WR 299 / TE 399) on estimated routes → only adds uncertainty |
| D2 guardrail | §9.3 | `ESTABLISHED_STARTER` predicate requires `starts.provenance = DERIVED` |

## 4. Existing engine conventions reused (ENGINE_PRECEDENT / REPOSITORY_CONVENTION)

- **QB context maps reused verbatim** (the AIL now produces these fields with the
  engine's *own* fallback values): `DROPBACK_SHARE_BY_DEPTH`,
  `EXPECTED_PASS_ATTEMPTS_BY_ROLE`, `COMPETITION_PRESSURE_BY_ROLE`,
  `DRAFT_COMMITMENT_BY_ROUND`, `ROLE_COMMITMENT_BY_ROLE`, `ACTIVE_PROBABILITY_BY_INJURY`.
- **Draft-tier security** = TE `CONTRACT_SECURITY_BY_ROUND`; **competition draft
  weight** = WR `DRAFT_ROUND_SECURITY`.
- **Shrinkage Ks** (WR 150/250; TE 140/120/180/160/180/120/160) and **efficiency
  neutral priors** reused.
- **Age/experience adjustment** = WR `RD_AGE_SECURITY`.
- **RB workload-ramp** = TE ramp table (RB has no engine ramp fallback).
- **WR route factor 0.97** = `proxyRegistry` / WR §175 (WR-only).
- **Career-route/touch confidence tiers** = each engine's own tiers (×10 to 0..1000).
- **Percentile** = `pct` mid-rank; **rounding** = `roundTo` half-away-from-zero;
  **checksum** = `digest` FNV-1a; **merge** = `mergeSupplements` overlay-wins;
  **confidence labels** = 80/60 → bands 800/600; **explanation max drivers** = 3.

## 5. Every MVP_HEURISTIC (fixed, versioned, binding now)

Team-volume: `w_team` denom 6, `K_TEAM_PRESEASON` 8; RB shrink K carry 60 / snap 6;
QB attempts K 180. `role_adj = 0`. Archetype share-prior table (§2.5). Projection
bounds/min-samples (§2.6). All role-ladder thresholds not directly from an engine
(§3). `CLASS_CATCHALL_PENALTY` 120; min-evidence gate 2 games. Competition: `K_SQUASH`
3.0, `POS_NORM` 0.90/0.70/0.55, recency 8 wk, use_eff floor 0.15, category cuts
0.25/0.50/0.75. Security: `YEARS_WITH_TEAM_ADJ` 0.03/cap 0.15, usage coeff 0.15,
`NEGATIVE_TXN` 0.25/0.10, category cuts 0.40/0.70, QB blend 0.5/0.5, true-contract
weights 0.4/0.3/0.3. Environment: score weights 0.50/0.25/0.25 and 0.40/0.20/0.20/0.20,
rookie starter_stability prior 60. Availability Table A: OUT 0.30, IR/PUP 0.05, FA
0.10, PS 0.15, recently-activated 0.85; durability coeff 0.5. `high_recent_workload`
22 touches/g. `RB_SNAP_ROUTE_FACTOR` 0.42; `TIER_CEILING` WR 299 / TE 399;
`ROUTE_PROXY_PENALTY` 120. `T_START` 10, recent window 17, `START_INFERENCE_PENALTY`
120. All field-confidence penalty magnitudes (§10/§17.5). Player-conf floor 50,
IMPORTANCE weights 3/1/0.5, FLOOR_IN 1. Public-confidence map forms (bounds are main
§16.2). Stale freshness factor 0.7. `EXPLANATION_MIN_CONTRIB` 0.01, structural
fragment order. All TTLs (§16). `median_fn` lower-median.

Each is fixed and binding for V1; the "future recalibration note" column in §17 flags
those most likely to move once historical validation data exists (route factors,
`T_START`, competition norms, archetype priors, availability priors).

## 6. Unresolved risks

- **Calibration is heuristic, not empirical.** No repository data proves any
  MVP_HEURISTIC optimal; §19 of the main spec's validation gate (walk-forward, D5
  error bound) still governs promotion to `production-ready`. Until then, affected
  models are capped at MEDIUM confidence (§10 `p_model_error`). This is disclosed, not
  hidden.
- **Candidate sources still require implementation-time verification** (pbp pass/run
  split for WR routes; an official-starts feed for D2 rung 1; contracts S10 for the
  true-contract model). Where absent, the registry's fallbacks degrade to
  `UNAVAILABLE`/reduced models — no fabricated value.
- **D1/D2 remain product/contract decisions.** The registry supplies the numeric
  contract *assuming* D1/D2 are approved; if they are rejected, `career_routes`/QB
  starts stay `UNAVAILABLE` and the affected live players stay `NOT_READY` (the
  guardrails and estimators simply do not activate).
- **Reconciliations (§19)** refine four main-spec provisional values (rounding, bands,
  availability, emission). They are completions of deferred values; if a future editor
  prefers the main spec's original provisional numbers, that is a one-line band/rounding
  change, not a structural conflict.

## 7. Implementation-readiness score

**Score: 93 / 100.**

Deductions:
- **−4 — empirical calibration absent.** Values are conservative and fixed, so two
  implementations converge, but they are not validated-optimal; the numbers will move
  under §19 walk-forward calibration (D5). Determinism is unaffected; predictive
  quality is provisional.
- **−2 — candidate-source dependence.** Full live readiness still depends on pbp
  (WR routes) and an official-starts feed (D2 rung 1) that must be verified at
  implementation; their absence forces documented fallbacks, not divergence.
- **−1 — D1/D2 are still contract decisions.** The registry is complete *conditional*
  on their approval; unconditional live readiness cannot be asserted here.

No deduction for determinism, precision, reproducibility, or repository compatibility:
every symbol from main §5–16/§32 is now bound (§18.1), the audit items are closed
(§18.2), the convergence check passes (§18.3), and the consistency check confirms no
engine formula, provenance honesty rule, fact-precedence, leakage guard, or
uncertainty protection is violated (§18.4). With this registry plus main §32 and the
frozen contracts, two competent developers produce materially equivalent inferred
values, confidence, readiness, explanations, provenance, and serialized bytes — the
one remaining variable (the heuristic constants themselves) is pinned identically by
the registry.

## 8. Git state

Both documents committed and pushed to `claude/playerticker-automated-inference-spec-lm3kt3`.
No main-spec edit (reconciliations documented in-registry per the task's contradiction
rule — none rose to a binding-blocking contradiction). No engine, pipeline, or golden
output changed. Working tree clean.
