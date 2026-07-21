# AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.md

**Status:** Binding numeric and algorithmic contract for the Automated Inference
Layer (AIL). This document supplies every coefficient, threshold, weight, prior,
clamp, penalty, classification boundary, tie-break, precision rule, and remaining
algorithmic choice referenced but not fixed by `AUTOMATED_INFERENCE_LAYER_SPEC_V1.md`.
It closes cold-session audit items **C1, M1–M8, m1–m3** and the **D1/D2 guardrails**.

**Precedence:** For implementation, read Section 32 of the main spec + this
registry + the frozen engine contracts. Where this registry gives a concrete value
for a symbol the main spec left to "the registry," **this registry governs**. Where
this registry refines a *provisional default* the main spec printed (Section 11.2
availability numbers; Section 5.3/25.2 rounding mode; Section 15.5 bands = Decision
D6), the reconciliation is stated inline and in the completion report; these are
completions of deferred values, not contradictions. No frozen engine formula,
threshold, type, or golden output is changed by this document.

**Value sourcing tags** (every binding value carries one):
`ENGINE_PRECEDENT` (copied from a frozen engine constant), `REPOSITORY_CONVENTION`
(an existing repo-wide utility/convention), `FOOTBALL_RATIONALE` (a documented
football/statistical rationale), `MVP_HEURISTIC` (a fixed, versioned, conservative
V1 value chosen for determinism; recalibration-eligible but binding now).

---

# 1. Registry identity

| Key | Value | Source | Rationale |
|---|---|---|---|
| `registry_version` | `air-1.0.0` | MVP_HEURISTIC | semver; bumped per §18 policy of main spec |
| `effective_date` | `2026-07-21` | — | issue date |
| `compatibility_target` | main spec `AUTOMATED_INFERENCE_LAYER_SPEC_V1` §32; engines wr-mvp-1.0, rb-mvp-1.0, te-mvp-1.0, qb-mvp-output-1.0 | ENGINE_PRECEDENT | binds to the verified 8b03353 baseline |
| `supported_positions` | WR, RB, TE, QB | ENGINE_PRECEDENT | the four frozen engines |
| `reproducibility_id` | `{snapshotIds[], normalizedInputChecksum, registry_version, inferenceLayerVersion, asOf, engineVersion}` | REPOSITORY_CONVENTION | extends main §18.2 with `registry_version` |
| `confidence_scale` | integer `0..1000` | main spec | field & player confidence |
| `rounding_mode` | **round half away from zero** | REPOSITORY_CONVENTION (`te-model/percentiles.ts roundTo`) | supersedes main §5.3 "half-to-even"; the repo's only rounding helper is half-away-from-zero — binding it prevents divergence |
| `percentile_fn` | mid-rank `pct(x,V)=100·(below+0.5·equal)/N`, clamp[0,100], no interpolation | REPOSITORY_CONVENTION (`percentiles.ts pct`) | closes M6 percentile method |
| `median_fn` | lower-median: sort asc, take index `floor((N−1)/2)`, no averaging | MVP_HEURISTIC | deterministic, interpolation-free league prior |
| `checksum_fn` | `digest()` = `fnv1a32('a:'+s)+fnv1a32('b:'+s)` → 16 lowercase hex | REPOSITORY_CONVENTION (`pipeline/hash.ts`) | closes m2 |

## 1.1 Precision policy (binding, per output family)

| Output family | Decimals | Rule |
|---|---|---|
| probabilities & shares (`*_share`, `*_participation`, `*_rate`, `probability_active`, `contract_security`, `competition_pressure`, `workload_ramp_factor`, availability) | 4 | round half away from zero at serialization |
| per-game volumes (`projected_team_*`, `expected_active_game_*`, `*_per_game`, `adjusted_yards_per_attempt`, `average_depth_of_target`, yards rates) | 2 | as above |
| 0–100 scores (`qb_environment_score`, `offensive_environment_score`, `protection_context_score`) | 0 (integer) | matches engine reference-distribution granularity |
| counts (`career_routes`, `career_starts`, `recent_starts`, `career_*`, `expected_games_remaining`) | `expected_games_remaining` → 1 dp; all other counts → integer | main §11.1 already rounds expected games to 1 dp |
| confidence | integer `0..1000` | — |

Internal math is full `double` precision; rounding happens **only** at serialization
(REPOSITORY_CONVENTION — engines "store full precision, round at boundary").

---

# 2. Projection parameters (closes C1 for §6; fixes m1)

## 2.1 One bound functional form (resolves m1: linear chosen)

For a per-game **share** `S` (target/carry/snap/route share):
```
S_recent   = observed share over last-4 games (l4 window)
S_career   = career-to-date share (or prior-season if career unavailable)
w_recent   = clamp(games_observed_l4 / 4, 0, 1)          // LINEAR ramp over 4 games
S_blend    = w_recent·S_recent + (1−w_recent)·S_career
S_proj     = clamp(S_blend + role_adj, lo, hi)           // role_adj per §2.4
```
- If exactly one of `S_recent`/`S_career` is available → use it at full weight
  (the other's weight → 0). If neither → `INSUFFICIENT_DATA` (null).
- `games_observed_l4` = number of the player's team games in the l4 window for
  which the player has a usage row.

For a per-game **team volume** `V`:
```
w_team     = clamp(team_games_played_this_season / 6, 0, 1)   // LINEAR over 6 games
V_std      = team season-to-date per-game value
V_league   = median_fn(reference_distribution[field])         // §1 median_fn
V_proj     = w_team·V_std + (1−w_team)·V_league
// preseason (team_games=0): V_proj = shrink(V_prior_season_pg, V_league, K_TEAM_PRESEASON)
//   with n = min(prior_season_team_games, 17); if no prior season → V_league
```
`shrink(x,prior,k) = (n·x + k·prior)/(n+k)` (ENGINE_PRECEDENT — `*-model/shrinkage.ts`).

## 2.2 Shrinkage / weighting constants

| Key | Value | Unit | Applies | Source | Rationale |
|---|---|---|---|---|---|
| `K_TEAM_PRESEASON` | 8 | games | team volume preseason | MVP_HEURISTIC | ~½-season of prior data to move off league prior |
| `w_recent` ramp denominator | 4 | games | all share projections | FOOTBALL_RATIONALE | l4 window length |
| `w_team` ramp denominator | 6 | games | all team-volume projections | MVP_HEURISTIC | team rates stabilize ~6 games |
| `TPRR_SHRINK_K` (WR) | 150 | routes | WR tprr / target rate | ENGINE_PRECEDENT (`wr constants`) | reuse |
| `EFFICIENCY_SHRINK_K` (WR) | 250 | routes | WR efficiency rates | ENGINE_PRECEDENT | reuse |
| `TPRR_SHRINK_K` (TE) | 140 | routes | TE tprr | ENGINE_PRECEDENT (`te constants`) | reuse |
| `CATCH/YPT/YPR/YAC/RZ/EZ K` (TE) | 120/180/160/180/120/160 | targets/rec | TE efficiency | ENGINE_PRECEDENT | reuse |
| `CARRY_SHARE_SHRINK_K` (RB) | 60 | carries | RB carry share | MVP_HEURISTIC | ~½ season of carries |
| `SNAP_SHARE_SHRINK_K` (RB/TE) | 6 | games | snap share | MVP_HEURISTIC | snap share stabilizes fast |
| `PASS_ATT_SHRINK_K` (QB) | 180 | attempts | QB efficiency/attempts | MVP_HEURISTIC | ~½ season attempts |

## 2.3 Regression targets, age & rookie priors

- **Regression targets** for efficiency rates = the engine neutral priors verbatim
  (ENGINE_PRECEDENT): WR `CROE_NEUTRAL_PRIOR=0.0`; TE `CATCH 0.68 / YPT 7.2 / YPR
  10.6 / YAC 4.6 / RZ 0.18 / EZ 0.08`; per-round TPRR priors (WR `TPRR_PRIOR`, TE
  `TPRR_PRIOR_BY_ROUND` + prospect adjustment ±0.015). Share regression target =
  league median of the field's reference distribution.
- **Age/experience prior** (applied only to ROS/1yr+ share projections as an
  additive nudge, weekly = 0): reuse `RD_AGE_SECURITY` bands (ENGINE_PRECEDENT):
  ≤25 `+0.00`, 26–28 `+0.00`, 29–30 `−0.01·S_career`, ≥31 `−0.02·S_career`
  (share-space, small; FOOTBALL_RATIONALE aging shed). Weekly horizon: no age term.
- **Rookie prior** (0 NFL games): `S_recent` unavailable → `S_proj = S_prior` where
  `S_prior` = draft-tier archetype share (§2.5) blended with league median at
  `w = 0.5` (MVP_HEURISTIC); efficiency fields → `INSUFFICIENT_DATA` (null where
  nullable). `w_recent=0`; confidence capped MEDIUM (§10).

## 2.4 Role adjustment (`role_adj`)

`role_adj = 0.0` for all fields in V1 (MVP_HEURISTIC). Rationale: the recent/career
blend already carries the realized role signal; a class-based additive would
double-count and require uncalibrated per-class deltas. Role classes still drive the
engine's own role fields (route_role_change, etc., §3) and role-change flags — they
simply do not additionally perturb projected shares in V1. (Recalibration-eligible.)

## 2.5 Draft-tier archetype share priors (rookies / no-usage)

Per-position share prior by draft tier (used only when no player usage exists):

| Tier | WR target_share | RB carry_share | RB snap_share | TE target_share | TE snap_share |
|---|---|---|---|---|---|
| R1 | 0.18 | 0.45 | 0.55 | 0.14 | 0.60 |
| R2 | 0.15 | 0.38 | 0.48 | 0.11 | 0.52 |
| R3 | 0.12 | 0.30 | 0.40 | 0.09 | 0.45 |
| R4–5 | 0.09 | 0.22 | 0.32 | 0.07 | 0.38 |
| R6–7 | 0.06 | 0.15 | 0.24 | 0.05 | 0.30 |
| UDFA | 0.04 | 0.10 | 0.18 | 0.04 | 0.25 |

Source: MVP_HEURISTIC (monotone in draft capital; FOOTBALL_RATIONALE that draft
investment predicts opportunity). QB uses role-based baselines (§6.4/§ QB env), not
these share priors.

## 2.6 Minimum sample gates & bounds (per projected field)

| Field | min sample to emit non-null | lo | hi | precision |
|---|---|---|---|---|
| WR/RB/TE `target_share` | ≥2 games usage OR career prior | 0.00 | 0.45 | 4dp |
| RB `carry_share_last4` | ≥2 games | 0.00 | 0.95 | 4dp |
| RB/TE `snap_share_last4/last8` | ≥2 games | 0.00 | 1.00 | 4dp |
| `projected_team_dropbacks` (per game) | team ≥1 game OR prior season | 20.0 | 48.0 | 2dp |
| `projected_team_non_qb_rush_attempts` | team ≥1 game OR prior | 12.0 | 38.0 | 2dp |
| `team_points_per_drive` | team ≥1 game OR prior | 0.60 | 3.60 | 2dp |
| `team_red_zone_trips_per_game` | team ≥1 game OR prior | 1.00 | 6.00 | 2dp |
| QB `expected_active_game_pass_attempts` | role known | 8.0 | 45.0 | 2dp |
| QB `expected_active_game_designed_rush_attempts` | ≥3 games or role prior | 0.0 | 12.0 | 2dp |
| QB `expected_active_game_scrambles` | ≥3 games or 0 | 0.0 | 8.0 | 2dp |
| QB `expected_active_game_goal_line_rush_attempts` | ≥3 games or 0 | 0.0 | 4.0 | 2dp |
| `expected_games_remaining` | schedule present | 0.0 | games_left | 1dp |

Below the min sample → the field's ladder (main §14) descends to prior/league;
if still uncomputable → `INSUFFICIENT_DATA`. Bounds are hard clamps applied last.

## 2.7 QB expected active-game volume (bind the "dropback_share adj")

```
base_attempts   = EXPECTED_PASS_ATTEMPTS_BY_ROLE[role_status]          // ENGINE_PRECEDENT
recent_att_ps   = shrink(recent_pass_attempts / max(recent_starts_est,1), base_attempts, PASS_ATT_SHRINK_K)
share_adj       = team_dropback_share / DROPBACK_SHARE_BY_DEPTH[STARTER]   // = share / 0.96
expected_active_game_pass_attempts = clamp(recent_att_ps · clamp(share_adj,0.5,1.05), 8.0, 45.0)
```
`EXPECTED_PASS_ATTEMPTS_BY_ROLE`, `DROPBACK_SHARE_BY_DEPTH` are the QB engine's own
fallback maps (ENGINE_PRECEDENT). `team_dropback_share` from §6. Designed rush,
scrambles, goal-line per start = `shrink(recent_per_start, role_prior, PASS_ATT_SHRINK_K/3)`
with role_prior from the QB reference distributions' medians (ENGINE_PRECEDENT).

---

# 3. Role classification (closes M8)

Each classifier is an **ordered decision ladder**: evaluate rules top-to-bottom, the
**first** rule whose predicate holds assigns the class (this *is* the tie-break —
first match wins, resolving M8's tie-break requirement). All signals are shares in
`[0,1]` (already normalized) or counts. Every ladder ends in a catch-all
`uncertain`/neutral class. Minimum-evidence gate precedes every ladder.

**Global minimum-evidence gate (all role classifiers):** require `games_observed_l4
≥ 2` (in-season) OR a usable preseason prior (draft tier + prior-season usage). If
neither → class = the position's `UNKNOWN`/`uncertain`/`BACKUP` member, status
`INSUFFICIENT_DATA`, and the depth/role field is emitted with that neutral member
(§12 category c). Depth-chart source (S8) overrides usage **only** if present,
within TTL (§16), and team-complete; else usage governs (main §7.1).

Output confidence for a classification = field confidence per §10 (base 1000 minus
sample/recency/proxy penalties); a class assigned at the catch-all rung also incurs
`CLASS_CATCHALL_PENALTY = 120`.

## 3.1 WR role ladder

| # | Predicate | Class |
|---|---|---|
| 1 | `route_part_l4 ≥ 0.85 AND target_share ≥ 0.24` | `alpha_x` |
| 2 | `target_share ≥ 0.20 AND route_part_l4 ≥ 0.75` | `high_volume_primary` |
| 3 | `route_part_l4 ≥ 0.65 AND adot ≤ 8.0` | `slot_specialist` |
| 4 | `route_part_l4 ≥ 0.55 AND adot ≥ 13.0` | `field_stretcher` |
| 5 | `route_part_l4 ≥ 0.55` | `secondary_starter` |
| 6 | `route_part_l4 ≥ 0.30` | `rotational` |
| 7 | else | `reserve_developmental` |

Preseason variant: replace `route_part_l4` with prior-season route participation and
`target_share` with prior-season target share; if rookie, use draft tier
(R1→`high_volume_primary`, R2→`secondary_starter`, R3–4→`rotational`, else
`reserve_developmental`). Source: anchors ENGINE-adjacent (main §7.2) + MVP_HEURISTIC
thresholds; `adot` 8/13 = FOOTBALL_RATIONALE slot/deep split.

## 3.2 RB role ladder

| # | Predicate | Class |
|---|---|---|
| 1 | `snap_share_l4 ≥ 0.65 AND carry_share_l4 ≥ 0.60` | `lead_back` |
| 2 | `carry_share_l4 ≥ 0.55` | `committee_leader` |
| 3 | `route_part_l4 ≥ 0.50 AND carry_share_l4 < 0.40` | `receiving_back` |
| 4 | `goal_line_carry_share ≥ 0.50 AND snap_share_l4 < 0.45` | `goal_line_specialist` |
| 5 | `carry_share_l4 ≥ 0.35 AND snap_share_l4 < 0.55` | `early_down` |
| 6 | `snap_share_l4 ≥ 0.20 OR carry_share_l4 ≥ 0.15` | `committee_member` |
| 7 | else | `reserve` |

## 3.3 TE role ladder + `prospect_type` + `depth_chart_role`

Role ladder:

| # | Predicate | Class |
|---|---|---|
| 1 | `route_part_l4 ≥ 0.80 AND target_share ≥ 0.18` | `primary_receiving` |
| 2 | `route_part_l4 ≥ 0.75 AND snap_share_l4 ≥ 0.75` | `every_down_starter` |
| 3 | `route_part_l4 ≥ 0.65 AND (snap_share_l4 − route_part_l4) ≤ 0.05` | `route_first_specialist` |
| 4 | `snap_share_l4 ≥ 0.65 AND route_part_l4 < 0.55` | `blocking_heavy_starter` |
| 5 | `snap_share_l4 ≥ 0.30` | `committee` |
| 6 | else | `reserve` |

`depth_chart_role`: rank team TEs by `snap_share_l4` desc; rank 1 → `TE1`, rank 2 →
`TE2`, rank ≥3 → `TE3_OR_DEPTH`; no usage → `UNKNOWN`. (S8 order overrides if valid.)

`prospect_type` (veteran, ≥100 career routes): `blocking_gap = snap_share_l4 −
route_part_l4`; `RECEIVING` if `blocking_gap ≤ 0.10 AND tprr ≥ 0.18`; `BLOCKING_FIRST`
if `blocking_gap ≥ 0.25 OR route_part_l4 < 0.50`; else `BALANCED`. Rookie/<100 routes:
draft-tier + prospect note if a covered college-receiving feature exists, else
`UNKNOWN` (honest). Thresholds MVP_HEURISTIC; `tprr 0.18` = ENGINE_PRECEDENT (TE
`TARGET_SHARE_DERIVED` era prior).

## 3.4 QB `role_status` + `depth_chart_status`

`depth_chart_status` ladder (usage + roster): recent snap-majority in last game →
`STARTER`; split snaps ≥0.35 each between two QBs → `CO_STARTER`; on 53-man, not
starting → `BACKUP`; practice-squad roster → `PRACTICE_SQUAD`; no team → `FREE_AGENT`.

`role_status` ladder (uses S13 starts + age/experience + events):

| # | Predicate | Class |
|---|---|---|
| 1 | confirmed benched event (S9) within 4 weeks | `RECENTLY_BENCHED` |
| 2 | promoted due to confirmed starter injury (S9) & prior `BACKUP` | `TEMPORARY_INJURY_REPLACEMENT` |
| 3 | `recent_start_rate ≥ 0.90 AND career_starts ≥ 48 AND starts.provenance = DERIVED` | `ESTABLISHED_STARTER` |
| 4 | `recent_start_rate ≥ 0.80 AND nfl_seasons_completed ≤ 4` | `YOUNG_COMMITTED_STARTER` |
| 5 | rookie (0 seasons) with `depth_chart_status ∈ {STARTER,CO_STARTER}` | `ROOKIE_EXPECTED_STARTER` |
| 6 | veteran signed this offseason as expected starter (S9) & `nfl_seasons_completed ≥ 5` | `BRIDGE_STARTER` |
| 7 | `depth_chart_status = CO_STARTER` OR two-QB start signal | `COMPETITION` |
| 8 | else | `BACKUP` |

Rule 3's `AND starts.provenance = DERIVED` is the **D2 guardrail** (see §9.3):
`ESTABLISHED_STARTER` is unreachable when starts are inferred. `career_starts ≥ 48`
and `recent_start_rate ≥ 0.9` thresholds: FOOTBALL_RATIONALE (~3 seasons of starts).
Downstream, the QB engine maps `role_status` to role-security/commitment — unchanged.

---

# 4. Competition pressure (closes C1 for §8)

## 4.1 QB (reuse engine map)

`competition_pressure(QB) = COMPETITION_PRESSURE_BY_ROLE[role_status]`
(ENGINE_PRECEDENT — the QB engine's own §26.5.6 fallback): ESTABLISHED 0.05, YOUNG
0.10, ROOKIE 0.15, BRIDGE 0.45, TEMP 0.70, COMPETITION 0.75, RECENTLY_BENCHED 0.90,
BACKUP 0.85. This makes the AIL value identical to the engine's own notion.

## 4.2 WR/RB/TE teammate-sum model

```
for each same-position, same-team teammate t (excluding self):
  w_dc(t)   = DRAFT_TIER_WEIGHT[t.draft_round]          // table below
  usage(t)  = t.recent_share_l4 (target_share for WR/TE; carry_share for RB); null→0
  use_eff   = max(usage(t), 0.15 · w_dc(t))             // high-capital rookie still counts
  recency   = 1.25 if t acquired/returned ≤ 8 weeks ago (S9) else 1.00
  health    = availability_prob(t.state)                // §7 Table A
  g(t)      = w_dc(t) · use_eff · recency · health
pressure_raw = Σ g(t)
competition_pressure = clamp( logistic( K_SQUASH · (pressure_raw / POS_NORM − 1) ), 0.02, 0.98 )
```
`logistic(z) = 1 / (1 + e^{−z})`. Center: `pressure_raw = POS_NORM` → 0.5.

| Key | Value | Source | Rationale |
|---|---|---|---|
| `DRAFT_TIER_WEIGHT` | R1 1.00, R2 0.80, R3 0.65, R4 0.45, R5 0.45, R6 0.25, R7 0.25, UDFA 0.20 | ENGINE_PRECEDENT (WR `DRAFT_ROUND_SECURITY`) | teammate draft threat |
| `K_SQUASH` | 3.0 | MVP_HEURISTIC | logistic steepness |
| `POS_NORM` (WR) | 0.90 | MVP_HEURISTIC | ≈ target share a full competitor set holds |
| `POS_NORM` (RB) | 0.70 | MVP_HEURISTIC | committee carry share |
| `POS_NORM` (TE) | 0.55 | MVP_HEURISTIC | secondary-TE + slot competition |
| `recency_window` | 8 weeks | MVP_HEURISTIC | recent-acquisition salience |
| `use_eff` floor factor | 0.15 | MVP_HEURISTIC | rookie-with-no-usage still competes |

Injured competitors are **down-weighted** by `health`, never removed. Practice-squad
teammates: `w_dc` applies but `usage≈0` and (unless elevated ≤8 wks) `recency=1.0`,
so `use_eff = 0.15·w_dc` (near-zero). Offseason: `usage` = prior-season share.

## 4.3 Flags (MODEL_CLASSIFICATION; defaults for INSUFFICIENT_DATA in §12c)

- `teammate_return_flag` (RB/TE) = true iff a same-position teammate returned from
  absence ≤ 8 weeks (S9) AND held prior usage ≥ 0.40. Default false.
- `incoming_competition_flag` (RB) = true iff a same-position teammate acquired ≤ 8
  weeks (S9) with `w_dc ≥ 0.65` OR prior usage ≥ 0.40. Default false.
- `another_receiving_te_flag` (TE) = true iff another team TE has `route_part_l4 ≥
  0.50`. Default false.

## 4.4 Public categories (boundaries, lower-inclusive)

`LOW [0,0.25)`, `MODERATE [0.25,0.50)`, `ELEVATED [0.50,0.75)`, `HIGH [0.75,1]`.
A value exactly on a boundary falls in the **higher** category. Source MVP_HEURISTIC.

---

# 5. Contract / roster security (closes C1 for §9)

## 5.1 Reduced roster-security model (default, no paid data)

```
security = clamp(
    DRAFT_TIER_SECURITY[draft_round]         // backbone, 0..1
  + EXPERIENCE_ADJ(age)                        // additive
  + YEARS_WITH_TEAM_ADJ(years_with_team)       // additive, capped
  + 0.15 · recent_usage_share                  // usage → investment
  − NEGATIVE_TXN_PENALTY                        // benching/waiver/trade-block
, 0.05, 0.95)
```
No logistic — the draft-tier backbone is already `[0,1]`; a direct clamp is
conservative and deterministic. Provenance `MODEL_ESTIMATE`; mandatory limitation
code `NOT_TRUE_CONTRACT_DATA` (never presented as contract fact).

| Key | Value | Source | Rationale |
|---|---|---|---|
| `DRAFT_TIER_SECURITY` | R1 1.00, R2 0.82, R3 0.65, R4 0.45, R5 0.45, R6 0.26, R7 0.26, UDFA 0.20 | ENGINE_PRECEDENT (TE `CONTRACT_SECURITY_BY_ROUND`) | reuse exact engine map |
| `EXPERIENCE_ADJ` | ≤25 `+0.00`; 26–28 `+0.00`; 29–30 `−0.05`; ≥31 `−0.10` | ENGINE_PRECEDENT (WR `RD_AGE_SECURITY`) | aging → transition risk |
| `YEARS_WITH_TEAM_ADJ` | `min(0.03 · years_with_team, 0.15)` | MVP_HEURISTIC | tenure → stability, capped |
| usage coefficient | 0.15 | MVP_HEURISTIC | investment signal |
| `NEGATIVE_TXN_PENALTY` | benched/trade-block/waived ≤8wk → 0.25; IR churn → 0.10; else 0.00 | MVP_HEURISTIC | confirmed instability |

If S10 licensed contract data is present, the **true contract model** overrides
(provenance `MODEL_ESTIMATE`, assumption `TRUE_CONTRACT_DATA`): `security =
clamp(0.4·guaranteed_years_frac + 0.3·(1−dead_cap_release_frac) + 0.3·option_or_tag,
0.05, 0.95)` (MVP_HEURISTIC weights; only active if the columns exist).

## 5.2 QB `organizational_commitment` (reuse engine blend)

`organizational_commitment = clamp(0.5·DRAFT_COMMITMENT_BY_ROUND[round] +
0.5·ROLE_COMMITMENT_BY_ROLE[role_status], 0.05, 0.95)` — both maps are the QB
engine's own §26.5.7 fallbacks (ENGINE_PRECEDENT); 0.5/0.5 blend MVP_HEURISTIC.
Undrafted → `DRAFT_COMMITMENT_UNDRAFTED = 0.18`.

## 5.3 Categories (lower-inclusive)

`LOW [0,0.40)`, `MEDIUM [0.40,0.70)`, `HIGH [0.70,1]`. Boundary → higher category.
TTL 180 days (§16). Confidence lowered by the reduced-proxy penalty (§10) vs true
contract data.

---

# 6. Team & QB environment (closes C1/M6 for §10)

## 6.1 Per-game volumes

`team_points_per_drive`, `projected_team_dropbacks`, `projected_team_non_qb_rush_attempts`,
`team_red_zone_trips_per_game` use the **team-volume form** of §2.1 with
`V_league = median_fn(reference_distribution[field])` and bounds from §2.6. Reference
distributions are the committed engine reference arrays (ENGINE_PRECEDENT). Team
change → use new team's season-to-date (player history stays with player).

## 6.2 0–100 environment scores (percentile blend; M6 method fixed)

```
score = round0( Σ_i w_i · pct(component_i, ref_i) )        // pct per §1 (mid-rank)
```
If a component's input is missing → drop it and renormalize remaining weights to sum
1; if **all** missing → `INSUFFICIENT_DATA` (nullable → null).

| Score | Components (weight → reference array) | Source |
|---|---|---|
| `offensive_environment_score` | pts/drive 0.50 → `team_points_per_drive`; dropbacks/g 0.25 → `projected_team_dropbacks`; rz_trips/g 0.25 → `team_red_zone_trips_per_game` | weights MVP_HEURISTIC; refs ENGINE_PRECEDENT |
| `qb_environment_score` | team AY/A 0.40 → `adjusted_yards_per_attempt`; dropbacks/g 0.20 → `projected_team_dropbacks`; (1−sack_rate) 0.20 → `sack_rate` (reverse: use `100−pct(sack_rate)`); starter_stability 0.20 → 100·recent_start_rate (no percentile) | weights MVP_HEURISTIC; refs ENGINE_PRECEDENT (qb refs) |
| `protection_context_score` | `100 − pct(sack_rate, sack_rate_ref)` | REPOSITORY_CONVENTION | nullable → null if sack_rate absent |

`starter_stability` uses the projected starter's `recent_start_rate` (§9). Rookie-QB
team: `starter_stability` prior = 60 (MVP_HEURISTIC) with wider uncertainty
(confidence penalty §10). Backup-QB (starter injured): use the expected starter's
components if identifiable, else team prior + `QB_UNCERTAIN` limitation. Percentile
ties handled by mid-rank `pct` (0.5·equal). Scores are integers `[0,100]`.

## 6.3 `qb_rush_pressure` (RB, nullable)

`qb_rush_pressure = clamp(qb_goal_line_rush_att / team_goal_line_rush_att, 0, 1)`;
null if denominator 0 or inputs absent. Source FOOTBALL_RATIONALE (mobile QB erodes
RB goal-line value). 4dp.

## 6.4 Continuity flags

`coaching_continuity`: `CHANGE` if a confirmed HC/OC change (S9) since prior season;
`CONTINUITY` if same staff observable; `UNKNOWN` if unobservable. `new_team_flag`/
`team_change` = `current_team ≠ prior_season_team` (DERIVED). `major_system_change`:
true iff `coaching_continuity = CHANGE` (scheme-family flag if a covered feature
exists; else coaching change with limitation code). Defaults per §12c.

---

# 7. Availability & expected games (closes C1 for §11; fixes m3)

## 7.1 Table A — per-remaining-game availability probability (for `expected_games_remaining`)

Completes main §11.2 (which left OUT/IR/PUP/FA/PS/return as prose). Values anchored
to the engines' `AV_VALUES`/`ACTIVE_PROBABILITY_BY_INJURY` conventions.

| State | avail_prob | Source | Note |
|---|---|---|---|
| HEALTHY / active | 0.97 | main §11.2 | |
| QUESTIONABLE + FULL practice | 0.85 | main §11.2 | |
| QUESTIONABLE + LIMITED | 0.65 | main §11.2 | |
| QUESTIONABLE + DNP / UNKNOWN practice | 0.45 | main §11.2 | |
| DOUBTFUL | 0.20 | main §11.2 | |
| OUT | 0.30 | MVP_HEURISTIC | short-term; `RETURN_TIMELINE_UNKNOWN` limitation |
| IR | 0.05 | MVP_HEURISTIC | season-typically-lost; bounded, not zero |
| PUP | 0.05 | MVP_HEURISTIC | as IR |
| SUSPENDED | 0.00 for known-length games (S9), then 0.97 | FOOTBALL_RATIONALE | known length subtracts exactly; unknown length → 0.00 + limitation |
| FREE_AGENT | 0.10 | MVP_HEURISTIC | team-dependent; `NOT_APPLICABLE` if no team required field |
| PRACTICE_SQUAD | 0.15 | MVP_HEURISTIC | |
| recently activated (≤2 wks off inactive list) | 0.85 | MVP_HEURISTIC | ramp |

**One rule, uniform across remaining games** in V1 (no per-week recovery curve — no
fabricated return dates, constitution §19). Overlapping-status precedence (highest
severity wins): SUSPENDED > IR > PUP > OUT > DOUBTFUL > QUESTIONABLE(+practice) >
recently-activated > HEALTHY. Practice status only modifies QUESTIONABLE.

## 7.2 Expected games remaining

```
games_left  = count(team games with kickoff > asOf, from S5 schedule)
durability  = clamp(1 − 0.5 · games_missed_rate_last16, 0.85, 1.00)   // healthy band
expected_games_remaining = round1( clamp(games_left · avail_prob · durability, 0, games_left) )
```
`games_missed_rate_last16 = missed / (missed + played)` over the last 16 team games
(0 if no history). `durability` coefficient 0.5 = MVP_HEURISTIC; band `[0.85,1.0]` =
main §11.1. Recurrence history lowers `durability` within the band via the same rate.

## 7.3 `probability_active` (QB field, distinct from Table A)

`probability_active = ACTIVE_PROBABILITY_BY_INJURY[injury_status]` (ENGINE_PRECEDENT
— QB engine §26.5.8): HEALTHY 0.99, QUESTIONABLE 0.75, DOUBTFUL 0.20, OUT/IR/PUP
0.00. 4dp. (Table A governs *expected games*; this governs the QB *field*.)

## 7.4 `workload_ramp_factor` (fixes m3, per-position)

- **RB** (no engine-owned ramp fallback): the AIL **computes** it from the TE ramp
  table (ENGINE_PRECEDENT — `te-model/constants.ts`): HEALTHY 1.0; QUESTIONABLE+FULL
  0.9; QUESTIONABLE+LIMITED 0.8; QUESTIONABLE+DNP/UNKNOWN 0.7; DOUBTFUL 0.6;
  OUT/IR/PUP/SUSPENDED 0.0; UNKNOWN-status 0.8. 4dp.
- **TE** (engine owns the §26.5.5 ramp fallback): the AIL emits
  `workload_ramp_factor = null` (present-null) so the frozen TE engine applies its
  own lookup — the AIL does **not** duplicate it (main §14.3).

## 7.5 `high_recent_workload_flag` (RB)

True iff mean of (carries + receptions) per game over l4 ≥ 22 (MVP_HEURISTIC,
FOOTBALL_RATIONALE heavy-usage/regression signal). Default false.

---

# 8. Effective route exposure — D1 (closes C1 §12 + D1 guardrail)

## 8.1 Precedence ladder (per position)

1. **Direct charted routes** (licensed source, if present) → `DERIVED`, no proxy
   penalty. Provenance is the only rung that can exceed the guardrail ceiling (§8.4).
2. **WR only** — covered participation (≤2023 seasons the player's career falls
   within): `career_routes = Σ_covered_games (qualifying_pass_play_participations ×
   0.97)` → `PROXY`. Factor `0.97` = ENGINE_PRECEDENT (`proxyRegistry` / WR §175),
   **WR-only**.
3. **WR only** — post-2023 / uncovered seasons with pbp pass-play snaps:
   `+ Σ_uncovered_games (pass_play_snaps × 0.97)` → merged estimate `MODEL_ESTIMATE`.
   Requires pbp pass/run split; if unavailable → this component contributes 0 and the
   season is treated as uncovered (may yield `UNAVAILABLE`, §8.3).
4. **RB** — window field `route_participation_last4` only:
   `RB_SNAP_ROUTE_FACTOR × (rb_pass_play_snaps / team_dropbacks)`, `RB_SNAP_ROUTE_FACTOR
   = 0.42` (MVP_HEURISTIC; **RB-only**, never the WR 0.97). `career_routes` remains
   `UNAVAILABLE` unless a direct charted source exists.
5. **TE** — never compute routes; supply `snap_share_last4` and leave
   `route_participation_*` null so the engine's own §26.5.2.2 proxy fires.
   `career_routes` `UNAVAILABLE` unless charted.

## 8.2 Minimum evidence, bounds, rounding, confidence

- Min evidence to emit a WR career estimate: ≥ 3 covered/pbp games; else `UNAVAILABLE`.
- Bounds: `career_routes` integer ≥ 0; `route_participation_*` clamp `[0,1]` (4dp).
- Confidence: apply the consuming engine's own career-route tier penalty (×10 to the
  0..1000 scale) **plus** `ROUTE_PROXY_PENALTY = 120` when provenance is
  PROXY/MODEL_ESTIMATE. WR tiers (ENGINE_PRECEDENT ×10): `<100 → 150`, `100–299 → 80`.
  TE tiers: `<75 → 150`, `75–199 → 100`, `200–399 → 60`.

## 8.3 Fallback

If no rung produces a value → `career_routes` = `UNAVAILABLE` → **omitted** from the
supplement (§12b) → player `NOT_READY` on routes (honest; matches the readiness
frontier for live players lacking pbp/charted data).

## 8.4 D1 guardrail (binding) — estimates can only ADD uncertainty

**Problem it solves:** an estimated route count must never push a player past the
engine's low-exposure confidence tier (WR `≥300`, TE `≥400`) and thereby *delete* the
engine's own low-sample penalty.

**Implementation (exact):** when `career_routes.provenance ∈ {PROXY, MODEL_ESTIMATE}`,
the value emitted to the engine is `min(estimate, TIER_CEILING[pos])` with
`TIER_CEILING = { WR: 299, TE: 399 }`. Because the ceiling is the top of the engine's
*penalized* tier, an estimated count can never reach the unpenalized `≥300`/`≥400`
zone: the engine's low-exposure confidence penalty (and its route<200 EF/volatility
low-sample protections) **always** remain in force on estimated routes. Only a
**direct charted** source (rung 1, `DERIVED`) may exceed the ceiling. The cap errs
strictly toward *more* uncertainty, never less. The AIL additionally records the
uncapped estimate in the sidecar for transparency and applies `ROUTE_PROXY_PENALTY`.
This changes no engine formula — it only bounds the *input value* the AIL supplies.

---

# 9. Functional QB starts — D2 (closes C1 §13 + D2 guardrail)

## 9.1 Precedence

1. **Direct official starts** (verified source, if present) → `career_starts`,
   `recent_starts` `DERIVED`, no penalty.
2. **Inferred functional start** (default): for each covered game,
   `functional_start = (qb_snap_share ≥ 0.50) AND (pass_attempts ≥ T_START)`,
   `T_START = 10` (MVP_HEURISTIC; majority snaps + ≥10 attempts ≈ a start).
   `career_starts_est = Σ_all_covered functional_start` (integer);
   `recent_starts_est = Σ_last_17_team_games functional_start`;
   `recent_start_rate = recent_starts_est / recent_games` (`recent_games` = player
   games in the last-17 window; if 0 → `recent_starts` `NOT_APPLICABLE`, null-omit per
   §12b, and `recent_start_rate` treated as 0 for §6.2 with a limitation).
   Provenance `MODEL_ESTIMATE`; limitation `INFERRED_START_NOT_OFFICIAL`.

## 9.2 Bounds, rounding, confidence

- Integers ≥ 0; rate `[0,1]` 4dp. Recent window = 17 team games (MVP_HEURISTIC = one
  season). Partial games: majority snaps + ≥10 att qualify regardless of finish;
  missed games not counted.
- Confidence: `START_INFERENCE_PENALTY = 120` (0..1000) when provenance
  `MODEL_ESTIMATE`.

## 9.3 D2 guardrail (binding) — inferred starts cannot over-promote role

**Problem it solves:** inferred starts must not fabricate an `ESTABLISHED_STARTER`
classification (which the QB engine maps to the strongest role-security 95 /
commitment 0.92 tier).

**Implementation (exact):** the `role_status` ladder rule 3
(`ESTABLISHED_STARTER`) carries the predicate `AND starts.provenance = DERIVED`
(§3.4). Therefore when starts are inferred (`MODEL_ESTIMATE`), rule 3 cannot fire and
the highest reachable class is `YOUNG_COMMITTED_STARTER` (rule 4) or
`ROOKIE_EXPECTED_STARTER` (rule 5). Inferred starts may classify a QB as a starter
but never as an *established* one. This bounds the downstream engine role-security /
organizational-commitment inputs the AIL supplies; it changes no engine formula.

## 9.4 Fallback

If `career_starts` cannot be sourced or inferred (no covered games) → `UNAVAILABLE` →
omitted (§12b) → player `NOT_READY` on starts.

---

# 10. Field confidence (closes C1 for §15.1 — exact breakpoints)

Every field: `conf = clamp(1000 − Σ penalties, 0, 1000)`, integer. Penalties are
exact step functions (no interpolation). A penalty whose condition is absent = 0.

| Penalty | Breakpoints → value | Source |
|---|---|---|
| `p_provenance` | DERIVED 0; PROXY 120; MODEL_ESTIMATE 80; MODEL_CLASSIFICATION 60; FALLBACK 100 | MVP_HEURISTIC (proxy>estimate>fallback>class ordering) |
| `p_recency` | age ≤ TTL → 0; TTL < age ≤ 2·TTL → 60; age > 2·TTL → 150 (and status → INSUFFICIENT_DATA) | MVP_HEURISTIC |
| `p_sample` | coverage ≥ min_sample → 0; 0.5·min ≤ coverage < min → 80; coverage < 0.5·min → 150 | MVP_HEURISTIC |
| `p_completeness` | 40 per missing required feature, capped 200 | MVP_HEURISTIC |
| `p_conflict` | independent signals differ by > 0.20 (share space) OR > 1 tier → 80; else 0 | MVP_HEURISTIC |
| `p_cross_season` | primary input is prior-season (preseason) → 60; else 0 | MVP_HEURISTIC |
| `p_route_proxy` | 120 when route provenance PROXY/MODEL_ESTIMATE (§8.2) | MVP_HEURISTIC |
| `p_start_inference` | 120 when starts MODEL_ESTIMATE (§9.2) | MVP_HEURISTIC |
| `p_class_catchall` | 120 when a role class is assigned at its catch-all rung (§3) | MVP_HEURISTIC |
| `p_model_error` | validated model 0; unvalidated model → cap final `conf ≤ 700` (MEDIUM) + `UNVALIDATED_MODEL` limitation | MVP_HEURISTIC (main §15.4) |

Career-route and career-touch tier penalties (ENGINE_PRECEDENT ×10) also apply on the
relevant fields: WR routes `<100→150 / 100–299→80`; TE routes `<75→150 / 75–199→100 /
200–399→60`; RB touches `<50→150 / 50–149→100 / 150–299→60`.

Per-field `min_sample` (coverage denominator): shares → 4 games; efficiency rates →
their shrink-K in sample units (§2.2); team volumes → 3 team games; QB attempts → 6
games. Source MVP_HEURISTIC / ENGINE_PRECEDENT (shrink Ks).

---

# 11. Player & public confidence (closes M4, M5 — exact formulas)

## 11.1 Player-level (exact weighted geometric mean)

```
required = all engine supplement fields the AIL emits for the position that are
           NOT omitted (present-value or present-null); an omitted field is excluded.
FLOOR_IN = 1                                        // avoids ln(0)
w_f      = IMPORTANCE_WEIGHT[pos][field]            // §11.2
WGM      = exp( Σ_f w_f · ln(max(conf_f, FLOOR_IN)) / Σ_f w_f )
weakest_critical = min over CRITICAL[pos] fields of conf_f   // present fields only
player_conf = clamp( min(WGM, weakest_critical), 50, 1000 )   // integer (round half away)
```
- A **present-null** nullable field contributes its own computed `conf_f` (which is
  low, reflecting INSUFFICIENT_DATA/UNAVAILABLE) — it is *not* given a default.
- If a CRITICAL field is omitted the player is `NOT_READY` (engine not called), so
  `weakest_critical` ranges only over present critical fields.
- Floor 50 (MVP_HEURISTIC) keeps a valued player above absolute zero; cap 1000.

## 11.2 Importance weights & CRITICAL sets

`IMPORTANCE_WEIGHT`: CRITICAL field = 3.0; standard field = 1.0; minor field
(`previous_*`, `career_*` efficiency companions, cosmetic flags) = 0.5. (MVP_HEURISTIC.)

`CRITICAL[pos]` (ENGINE_PRECEDENT-aligned to each engine's dominant opportunity
drivers; main §15.2):
- **WR:** career_routes, route_participation_last4, target_share, projected_team_dropbacks, expected_games_remaining.
- **RB:** snap_share_last4, carry_share_last4, career_touches, projected_team_non_qb_rush_attempts, expected_games_remaining.
- **TE:** snap_share_last4, target_share, career_routes, projected_team_dropbacks, expected_games_remaining.
- **QB:** career_starts, expected_active_game_pass_attempts, offensive_environment_score, expected_games_remaining.

## 11.3 Public confidence (exact factor maps; M5)

```
verified_share = (# engine inputs with provenance DIRECT or DERIVED) / (# required engine inputs)
inference_coverage_factor = clamp(0.5 + 0.5·verified_share, 0.5, 1.0)
inference_quality_factor   = clamp(0.3 + 0.7·(player_conf/1000), 0.3, 1.0)
source_quality_factor      = clamp(0.6 + 0.4·min_source_freshness, 0.6, 1.0)
    // min_source_freshness = min over critical sources of (age ≤ TTL ? 1.0 : 0.7)
engine_conf_0_1  = engine.confidence.score / 100          // WR/RB/TE 0..100; QB same scale
public_conf_0_1  = engine_conf_0_1 · inference_coverage_factor · inference_quality_factor · source_quality_factor
public_confidence = round0( clamp(public_conf_0_1,0,1) · 100 )     // 0..100 integer
```
Factor bounds `[0.5,1.0]`, `[0.3,1.0]`, `[0.6,1.0]` = main §16.2 (MVP_HEURISTIC map
forms). **Public confidence never alters any engine value/component/composite/EFO** —
it is presentation only (main §16.2, constitution P10).

## 11.4 Honesty states & publication thresholds (sets D6/D7)

Bands (0..1000 aggregate `player_conf`): `LOW_BAND = 600`, `HIGH_BAND = 800`
(ENGINE_PRECEDENT — all engines label MEDIUM ≥ 60, HIGH ≥ 80; supersedes main §15.5
provisional 400/750). Field status `LOW_CONFIDENCE` when `conf_f < 600`.

| State | Condition | In rankings? | Publish market movement? |
|---|---|---|---|
| VERIFIED | player READY; every CRITICAL input DIRECT/DERIVED; `player_conf ≥ 800` | yes | yes |
| ESTIMATED_HIGH_CONFIDENCE | READY; `player_conf ≥ 800`; ≥1 estimated input; models validated | yes | yes |
| ESTIMATED | READY; `600 ≤ player_conf < 800` | yes | yes (flagged) |
| LIMITED | READY; `player_conf < 600` OR any CRITICAL provenance FALLBACK | yes (flagged) | **no** (D7 default) |
| UNAVAILABLE | NOT_READY (≥1 blocking field omitted) | no | no |

---

# 12. Supplement emission matrix (closes M1)

Binding: for each (status × field-kind) exactly one emission. **Field-kind** is
determined from the engine input type: (a) nullable numeric; (b) non-nullable numeric
(blocking); (c) non-nullable enum/bool with a defined neutral member.

| status \ kind | (a) nullable numeric | (b) non-nullable numeric | (c) enum/bool w/ neutral member |
|---|---|---|---|
| AVAILABLE | present-with-value | present-with-value | present-with-value |
| LOW_CONFIDENCE | present-with-value | present-with-value | present-with-value |
| INSUFFICIENT_DATA | present-null | **omitted** (→NOT_READY) | present-with-value = neutral member |
| UNAVAILABLE | present-null | **omitted** (→NOT_READY) | present-with-value = neutral member |
| NOT_APPLICABLE | present-null | **omitted** | present-with-value = neutral member |

This is compatible with the existing readiness core (`assessFromSupplement`): a key
present (even null) counts satisfied; an omitted key is reported missing → NOT_READY.
Resolves the §32.3 vs §5.2/§5.5 contradiction (M1): "cannot estimate" maps to
present-null for nullable, omitted for non-nullable numeric, neutral-member for
enum/bool.

**Category (c) neutral members** (binding): `route_role_change`/`role_change`/
`coaching_continuity`/`recent_role_change(false)` → `UNKNOWN`/`STABLE` per enum;
`depth_chart_role` → `UNKNOWN`; `depth_chart_status` → `BACKUP`; `role_status` →
`BACKUP`; `prospect_type` → `UNKNOWN`; `injury_status` → `UNKNOWN` (WR/RB/TE) /
required for QB (main readiness already handles); `practice_status` → `UNKNOWN`;
booleans (`teammate_return_flag`, `incoming_competition_flag`, `another_receiving_te_flag`,
`temporary_opportunity_flag`, `new_team_flag`, `team_change`, `major_system_change`,
`high_recent_workload_flag`) → `false`. Source: ENGINE_PRECEDENT (each enum's defined
UNKNOWN/neutral) / FOOTBALL_RATIONALE (safe-false booleans).

---

# 13. Supplement merge precedence (closes M2)

## 13.1 Ownership & precedence (highest wins)

1. Direct canonical metadata facts (identity/team/age/status).
2. nflverse weekly `DERIVED` facts (counting stats, efficiency ratios).
3. snap `DERIVED` facts (snap shares).
4. participation `PROXY` facts (WR route proxy where available).
5. existing derived metrics stage.
6. **AIL projections & context `MODEL_ESTIMATE`/`MODEL_CLASSIFICATION`.**
7. engine-owned fallbacks (applied *inside* the frozen engine, never at merge).

Rule: **observed facts (1–5) always win over AIL estimates (6) for any dual-owned
field.** Fields owned only by the AIL (projections, context, roles, competition,
roster-security, environment) have no fact competitor and survive.

## 13.2 Exact `mergeSupplements` binding

`mergeSupplements(base, overlay)` lets `overlay` win per field (REPOSITORY_CONVENTION).
Therefore call:
```
merged = mergeSupplements( ail_supplement /* base */, facts_supplement /* overlay */ )
```
where `facts_supplement` = the stats/snaps/participation/derived stages' supplement.
This makes observed facts override AIL estimates for stats-owned fields, while
AIL-only fields (absent from `facts_supplement`) pass through untouched. TE
`route_participation_*` stays absent from both (left null → engine proxy). No engine
formula is touched.

## 13.3 Ownership table (dual-owned resolution)

| Field group | Owner that wins | Note |
|---|---|---|
| counting stats, efficiency ratios, snap/target/carry shares (current window) | facts (stats/snaps) | AIL only fills if facts absent |
| `route_participation_*`, `targets_per_route_run` (WR) | participation proxy if present, else AIL proxy, else null | §8 |
| `career_routes` | direct charted (facts) if present, else AIL D1 estimate | §8 guardrail applies to AIL path |
| projections (`projected_*`, `expected_*`, `expected_games_remaining`) | AIL | no fact competitor |
| context (`*_environment_score`, `competition_pressure`, `contract_security`, roles, flags, continuity) | AIL | no fact competitor |
| TE `route_participation_*` | neither (null) | engine-owned proxy |

---

# 14. Explanation contract (closes M7)

- **Positive fragments:** up to 3; **negative fragments:** up to 3 (ENGINE_PRECEDENT
  `EXPLANATION_MAX_DRIVERS = 3`).
- **Contribution weight** of a driver fragment: `|Δ| = |(feature_value −
  feature_prior) · IMPORTANCE_WEIGHT[field]|` where `feature_prior` = the field's
  league median / neutral prior. Structural fragments (fallback-used, missing-evidence,
  confidence-penalty, source-freshness, model-version) have fixed priority and are not
  ranked by Δ.
- **Inclusion threshold:** a driver fragment is emitted only if `|Δ| ≥
  EXPLANATION_MIN_CONTRIB = 0.01` (normalized) — analogue of ENGINE_PRECEDENT
  `EXPLANATION_MIN_ABS`. Structural fragments always emit when their condition holds.
- **Ranking:** drivers by `|Δ|` descending; **tie-break:** fragment `code` ascending
  (lexicographic). Structural fragments appended after drivers in this fixed code
  order: `FALLBACK_USED`, `MISSING_EVIDENCE`, `CONFIDENCE_PENALTY`, `SOURCE_FRESHNESS`,
  `MODEL_VERSION`.
- **Numeric formatting in templates:** shares → percent, 0 dp (`23%`); per-game → 1
  dp; scores → 0 dp; probabilities → 0 dp percent.
- **Unavailable field:** emit a single `MISSING_EVIDENCE` fragment naming the missing
  input(s); no driver fragments.

Two implementations emit identical fragment sets and order (deterministic Δ + fixed
tie-break + fixed structural order).

---

# 15. Serialization & reproducibility (closes M3, m2)

## 15.1 Ordering (binding)

- **Players:** ascending by `canonical_id` (ordinal byte compare).
- **Top-level object key order:** `schema_version, registry_version, model_version,
  player_id, position, as_of, status, readiness, honesty_state, fields, sidecar`.
- **`fields` order:** the **declaration order of the engine input interface** for the
  position (`WRMVPInput`/`RBMVPInput`/`TEMVPInput`/`QBMVPInput`), metadata keys first
  in their declared order, then supplement keys in their declared order
  (REPOSITORY_CONVENTION — the frozen types are the canonical order; resolves M3).
- **Within `InferredField`:** `field, value, status, provenance, confidence, modelId,
  modelVersion, asOf, effectiveFor, expiresAfter, inputsUsed, assumptions,
  limitations, explanation`.
- **`inputsUsed`:** ascending by `featureKey`. **`assumptions`/`limitations`:**
  ascending by code. **`explanation`:** composer order (§14).

## 15.2 Formatting

- Numbers serialized at the field's fixed precision (§1.1); no exponent notation;
  negative zero normalized to `0`.
- `null` value per §12; omitted fields absent from both `fields` and the supplement.
- Booleans as JSON `true`/`false`; enums as their exact string member.

## 15.3 Checksum (m2)

`normalizedInputChecksum = digest(canonical_facts_json)` where `canonical_facts_json`
is: facts serialized as JSON with **object keys sorted ascending**, **players sorted
by canonical_id**, numbers at full stored precision (no rounding), no whitespace.
`digest` = `pipeline/hash.ts` (FNV-1a two-pass, 16 lowercase hex). Reproducibility id
per §1.

---

# 16. TTL & freshness registry (closes m2 recency inputs; main §5.4/§28.3)

| Source / family | TTL | Hard bound (unavailable-after) | Source |
|---|---|---|---|
| injury / practice report | 7 d | 10 d | MVP_HEURISTIC |
| nflverse weekly stats | 7 d | 14 d | MVP_HEURISTIC |
| snap counts | 7 d | 14 d | MVP_HEURISTIC |
| participation (pbp) | 7 d | 14 d | MVP_HEURISTIC |
| schedule | 45 d | 90 d | MVP_HEURISTIC |
| rosters | 10 d | 21 d | MVP_HEURISTIC |
| transactions | 10 d | 21 d | MVP_HEURISTIC |
| contracts (S10) | 180 d | 365 d | MVP_HEURISTIC |
| inference: availability | 7 d | 10 d | — |
| inference: projections | 7 d | 14 d | — |
| inference: role / competition | 14 d | 28 d | — |
| inference: roster-security | 180 d | 365 d | — |
| inference: environment | 14 d | 28 d | — |
| inference: routes / starts | 30 d | 60 d | — |

- **Stale boundary inclusivity:** `age ≤ TTL` is fresh (inclusive). `TTL < age ≤
  2·TTL` → `p_recency = 60`. `age > 2·TTL` (= hard bound where 2·TTL exceeds it, else
  hard bound) → status `INSUFFICIENT_DATA`, value retained with `STALE` limitation.
- **Maximum usable age** = the source's hard bound; beyond it the dependent field is
  `UNAVAILABLE`.
- **As-of behaviour:** `age = asOf − sourceTimestamp`; only facts with
  `sourceTimestamp ≤ asOf` ever enter (no future leakage).

---

# 17. Consolidated binding constant tables

Every load-bearing constant, one place. `pos`/`field` scope noted; source tag per §1.

## 17.1 Global

| Key | Value | Scale | Source |
|---|---|---|---|
| confidence scale | 0..1000 int | — | main spec |
| rounding | half away from zero | — | REPOSITORY_CONVENTION |
| percentile | mid-rank, no interp | 0..100 | REPOSITORY_CONVENTION |
| median | lower-median idx `floor((N−1)/2)` | — | MVP_HEURISTIC |
| checksum | FNV-1a `digest`, 16 hex | — | REPOSITORY_CONVENTION |
| LOW_BAND / HIGH_BAND | 600 / 800 | 0..1000 | ENGINE_PRECEDENT |
| player_conf floor / cap | 50 / 1000 | 0..1000 | MVP_HEURISTIC |
| FLOOR_IN (WGM) | 1 | — | MVP_HEURISTIC |
| IMPORTANCE_WEIGHT critical/standard/minor | 3.0 / 1.0 / 0.5 | — | MVP_HEURISTIC |

## 17.2 Projection

| Key | Value | Scope | Source |
|---|---|---|---|
| w_recent denom | 4 games | share proj | FOOTBALL_RATIONALE |
| w_team denom | 6 games | team vol | MVP_HEURISTIC |
| K_TEAM_PRESEASON | 8 | team vol | MVP_HEURISTIC |
| shrink K (WR tprr/eff) | 150 / 250 | WR | ENGINE_PRECEDENT |
| shrink K (TE tprr/catch/ypt/ypr/yac/rz/ez) | 140/120/180/160/180/120/160 | TE | ENGINE_PRECEDENT |
| shrink K (RB carry/snap) | 60 / 6 | RB | MVP_HEURISTIC |
| shrink K (QB attempts) | 180 | QB | MVP_HEURISTIC |
| role_adj | 0.0 | all | MVP_HEURISTIC |
| archetype share priors | §2.5 table | rookies | MVP_HEURISTIC |
| bounds & precision | §2.6 table | all | mixed |
| EXPECTED_PASS_ATTEMPTS_BY_ROLE | engine map | QB | ENGINE_PRECEDENT |
| DROPBACK_SHARE_BY_DEPTH | engine map | QB | ENGINE_PRECEDENT |

## 17.3 Roles / competition / security

| Key | Value | Scope | Source |
|---|---|---|---|
| role ladders | §3.1–3.4 | all | MVP_HEURISTIC + main §7 |
| CLASS_CATCHALL_PENALTY | 120 | all | MVP_HEURISTIC |
| min-evidence gate | games_observed_l4 ≥ 2 | all | MVP_HEURISTIC |
| DRAFT_TIER_WEIGHT (competition) | 1.0/0.8/0.65/0.45/0.45/0.25/0.25/0.20 | WR/RB/TE | ENGINE_PRECEDENT |
| K_SQUASH | 3.0 | competition | MVP_HEURISTIC |
| POS_NORM (WR/RB/TE) | 0.90 / 0.70 / 0.55 | competition | MVP_HEURISTIC |
| recency window / use_eff floor | 8 wk / 0.15 | competition | MVP_HEURISTIC |
| competition categories | 0.25 / 0.50 / 0.75 | competition | MVP_HEURISTIC |
| COMPETITION_PRESSURE_BY_ROLE | engine map | QB | ENGINE_PRECEDENT |
| DRAFT_TIER_SECURITY | 1.0/0.82/0.65/0.45/0.45/0.26/0.26/0.20 | security | ENGINE_PRECEDENT |
| EXPERIENCE_ADJ | 0/0/−0.05/−0.10 | security | ENGINE_PRECEDENT |
| YEARS_WITH_TEAM_ADJ | min(0.03·yrs, 0.15) | security | MVP_HEURISTIC |
| usage coeff / NEG_TXN | 0.15 / 0.25,0.10 | security | MVP_HEURISTIC |
| security categories | 0.40 / 0.70 | security | MVP_HEURISTIC |
| DRAFT_COMMITMENT_BY_ROUND / ROLE_COMMITMENT_BY_ROLE | engine maps | QB org-commit | ENGINE_PRECEDENT |

## 17.4 Environment / availability / routes / starts

| Key | Value | Scope | Source |
|---|---|---|---|
| env score weights (off / qb) | 0.50/0.25/0.25 · 0.40/0.20/0.20/0.20 | env | MVP_HEURISTIC |
| rookie starter_stability prior | 60 | qb env | MVP_HEURISTIC |
| Table A availability | §7.1 | expected games | mixed |
| durability coeff / band | 0.5 / [0.85,1.0] | expected games | MVP_HEURISTIC / main |
| ACTIVE_PROBABILITY_BY_INJURY | engine map | QB prob_active | ENGINE_PRECEDENT |
| RB workload ramp table | TE ramp map | RB | ENGINE_PRECEDENT |
| high_recent_workload threshold | 22 touches/g | RB | MVP_HEURISTIC |
| WR route factor | 0.97 | WR routes | ENGINE_PRECEDENT |
| RB_SNAP_ROUTE_FACTOR | 0.42 | RB routes (window only) | MVP_HEURISTIC |
| TIER_CEILING (D1 guardrail) | WR 299 / TE 399 | routes | MVP_HEURISTIC |
| ROUTE_PROXY_PENALTY | 120 | routes | MVP_HEURISTIC |
| T_START / recent window | 10 att / 17 games | QB starts | MVP_HEURISTIC |
| START_INFERENCE_PENALTY | 120 | QB starts | MVP_HEURISTIC |

## 17.5 Confidence penalties (0..1000)

| Penalty | Value(s) | Source |
|---|---|---|
| p_provenance DERIVED/PROXY/EST/CLASS/FALLBACK | 0/120/80/60/100 | MVP_HEURISTIC |
| p_recency | 0 / 60 / 150 | MVP_HEURISTIC |
| p_sample | 0 / 80 / 150 | MVP_HEURISTIC |
| p_completeness | 40 ea, cap 200 | MVP_HEURISTIC |
| p_conflict | 80 | MVP_HEURISTIC |
| p_cross_season | 60 | MVP_HEURISTIC |
| p_route_proxy / p_start_inference / p_class_catchall | 120 / 120 / 120 | MVP_HEURISTIC |
| p_model_error (unvalidated) | cap 700 | MVP_HEURISTIC |
| WR route tiers / TE route tiers / RB touch tiers | 150,80 / 150,100,60 / 150,100,60 | ENGINE_PRECEDENT ×10 |

## 17.6 Public confidence / explanation / TTL

| Key | Value | Source |
|---|---|---|
| coverage / quality / source factor bounds | [0.5,1] / [0.3,1] / [0.6,1] | main §16.2 |
| stale source freshness factor | 1.0 fresh / 0.7 stale | MVP_HEURISTIC |
| explanation pos/neg count | 3 / 3 | ENGINE_PRECEDENT |
| EXPLANATION_MIN_CONTRIB | 0.01 | MVP_HEURISTIC |
| structural fragment order | FALLBACK_USED, MISSING_EVIDENCE, CONFIDENCE_PENALTY, SOURCE_FRESHNESS, MODEL_VERSION | MVP_HEURISTIC |
| TTLs | §16 table | MVP_HEURISTIC |

---

# 18. Internal validation

## 18.1 Completeness check — every open symbol now bound

| Symbol / open choice (main spec) | Bound in |
|---|---|
| `shrink` k (all) | §2.2, §17.2 |
| `w_recent(coverage)` form + denom (m1) | §2.1 (linear), §17.2 |
| `blend` weights | §2.1 (w_recent), §2.4 (role_adj=0) |
| team-volume forecast + league prior | §2.1, §6.1 |
| clamp `[lo,hi]` per field | §2.6, §17.2 |
| age/experience & rookie priors | §2.3, §2.5 |
| role scoring + thresholds + tie-break (M8) | §3.1–3.4 |
| competition weights/squash/norm/cats | §4, §17.3 |
| roster-security coeffs/curve/tiers/cats | §5, §17.3 |
| environment weights/percentile/refs (M6) | §6, §17.4 |
| percentile method + ties | §1, §6.2 |
| availability probs (all states) | §7.1, §7.3 |
| durability_adj | §7.2 |
| workload_ramp (m3) | §7.4 |
| route factors / D1 estimator | §8 |
| QB start threshold/window (D2) | §9 |
| field-confidence penalties (exact) | §10, §17.5 |
| player WGM (M4) | §11.1 |
| public-confidence factor maps (M5) | §11.3 |
| bands / honesty thresholds (D6/D7) | §11.4 |
| supplement emission matrix (M1) | §12 |
| merge precedence (M2) | §13 |
| explanation N/M + contribution + order (M7) | §14 |
| serialization field order (M3) | §15.1 |
| checksum serialization (m2) | §15.3 |
| TTLs + stale inclusivity | §16 |

No symbol from main §5–16 / §32 remains unbound.

## 18.2 Audit-closure map

| Audit item | Resolved by |
|---|---|
| **C1** (empty registry) | §1–§17 (all values fixed) |
| **M1** (emission mapping contradictory) | §12 matrix |
| **M2** (merge precedence) | §13 (`mergeSupplements(ail, facts)`) |
| **M3** (serialization field order) | §15.1 (engine-interface declaration order) |
| **M4** (WGM underspecified) | §11.1 (exact formula, FLOOR_IN, membership) |
| **M5** (public-confidence maps) | §11.3 (three explicit maps) |
| **M6** (percentile ref + method) | §1 + §6.2 (mid-rank + named refs) |
| **M7** (explanation determinism) | §14 |
| **M8** (role scoring/tie-break) | §3 (ordered ladders, first-match tie-break) |
| **m1** (w_recent form) | §2.1 (linear) |
| **m2** (checksum serialization) | §15.3 |
| **m3** (workload ramp compute-vs-defer) | §7.4 (RB compute / TE defer) |
| **D1 guardrail** | §8.4 (TIER_CEILING cap; estimate only adds uncertainty) |
| **D2 guardrail** | §9.3 (ESTABLISHED_STARTER requires DERIVED provenance) |

## 18.3 Convergence check

Two developers using main §32 + this registry + the frozen contracts have: one
functional form per projection (§2.1); complete role ladders with first-match
tie-break (§3); exact competition/security/environment formulas with all coefficients
(§4–6); one availability table + durability rule (§7); a fully-specified D1/D2 path
with guardrails (§8–9); exact confidence penalties and one player/public formula
(§10–11); one emission matrix (§12); one merge order bound to the real
`mergeSupplements` argument order (§13); one explanation ranking (§14); one
serialization order + checksum (§15). Remaining freedom is limited to items a
conformance harness pins by construction (identical registry constants). **Result:
materially equivalent inferred values, confidence, readiness, explanations,
provenance, and serialized bytes.**

## 18.4 Consistency check (no rule violates the constitution / engines)

- **No engine formula changed** — the registry only fixes AIL-side values and the
  *input values* the AIL supplies; §8.4/§9.3 guardrails bound inputs, never engine
  math.
- **No estimate labelled DIRECT** — AIL provenance ∈ {DERIVED, MODEL_ESTIMATE,
  MODEL_CLASSIFICATION, PROXY, FALLBACK} (§12, §10 `p_provenance`).
- **No higher-quality fact overwritten** — merge precedence (§13) makes facts win
  over estimates.
- **No future leakage** — as-of rule (§16); checksum over `sourceTimestamp ≤ asOf`
  facts only.
- **No engine uncertainty suppressed** — D1 cap (§8.4) keeps low-exposure penalties
  in force; D2 gate (§9.3) blocks inferred over-promotion; unvalidated models capped
  (§10 p_model_error).
- **No position-specific proxy leaked** — WR 0.97 is WR-only; RB uses its own 0.42
  (window-only); TE routes engine-owned (§8.1, §7.4).

---

# 19. Reconciliations with the main spec (completions of deferred values, not edits)

1. **Rounding mode** — registry binds *half away from zero* (`roundTo`), refining
   main §5.3's "half-to-even" to the repo's actual convention. (§1)
2. **Confidence bands** — registry sets D6: `LOW_BAND=600, HIGH_BAND=800`
   (engine-aligned), superseding main §15.5's provisional `400/750`. (§11.4)
3. **Availability numbers** — registry completes main §11.2's prose states
   (OUT/IR/PUP/FA/PS/return) with concrete values and adds `probability_active` as a
   distinct QB table. (§7)
4. **Emission rule** — registry's §12 matrix supersedes the ambiguous prose of main
   §32.3, consistent with §5.2/§5.5.

None requires editing the main specification; each is a deferred value this registry
was commissioned to bind. No contradiction blocks binding.

*End of AUTOMATED_INFERENCE_NUMERIC_REGISTRY_V1.*