# PlayerTicker Live Readiness Frontier & MVP Data-Strategy Audit

**Question:** the lowest-cost, lowest-risk, technically honest route from the
current repo to a live MVP that evaluates real active WR/RB/TE/QB players.

**Answer (headline):** No combination of *free* data stages — stats, snaps,
participation, a context stage, and a projections stage — unlocks a single active
player. The engines require fields that have **no free source at all**:
`career_routes` (post-2023 routes are paid), QB official starts, **and
irreducibly authored context judgments** (`contract_security`,
`competition_pressure`, role-change flags). The only strategies that produce
ready active players are an **authored supplement** or **comprehensive paid
data**. **Primary recommendation: a versioned, curated authored MVP supplement
(Strategy E). Fallback: a free projections + context-free build plus a spec
fallback for routes/starts, authoring only the irreducible judgment fields.**

This audit is player-level, reproduced deterministically by
`npm run pipeline:readiness-audit` (`src/pipeline/readiness-audit`).

---

## Phase 1 — Readiness audit (fixture, live 2025)

- 9 canonical players assessed; **2 currently READY** (the authored-complete
  demo WR `pt_0001` and QB `pt_0002`), 7 NOT_READY.
- By position: **WR** 6 assessed / 1 ready; **RB** 1 / 0; **TE** 1 / 0; **QB** 1 / 1.
- Missing requirements are reported per player with an owning stage
  (`metadata` / `stats` / `projections` / `context`) and are additionally
  classified by *availability* (how they could realistically be supplied).

Nullable-vs-blocking: the readiness model requires every engine-input key to be
present, so an absent field blocks regardless of engine-nullability. What
matters for strategy is therefore **availability**, not nullability.

## Phase 2 — The readiness frontier (measured)

Player-level newly-READY counts if a whole category were solved (simulated field
presence — no fabricated values):

| Scenario | Players READY |
|---|---|
| current | **2** |
| stats(free) solved | 2 |
| context only | **2** |
| projections only | **2** |
| context + projections | **2** |
| all free-solvable | **2** |
| free + spec fallback (routes/starts proxy) | **2** |
| authored supplement | **9** |

**The decisive line:** context-only, projections-only, and **context+projections
together all stay at 2** — they unlock **zero** active players. Even "all
free-solvable + spec fallback for routes/starts" stays at 2. Only an authored
supplement reaches every player.

Position summaries (ready count under each scenario):

| Position | Assessed | Now | ctx | proj | ctx+proj | all-free | free+spec | authored |
|---|---|---|---|---|---|---|---|---|
| WR | 6 | 1 | 1 | 1 | 1 | 1 | 1 | 6 |
| RB | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| TE | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| QB | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## Phase 3 — Universal & final blockers

**Universal WR blockers** (block every not-ready WR): `career_routes`,
`competition_pressure`, `contract_security`, `route_role_change`,
`expected_games_remaining`, `projected_team_dropbacks`, `team_points_per_drive`,
`qb_environment_score`, `practice_status`. Note the mix: a **paid** field
(`career_routes`), **authored** judgments (`competition_pressure`,
`contract_security`, `route_role_change`), and **free-derivable** fields
(projections + team context).

Why context+projections still fails: even after solving every `projections` and
`context`-stage field, `career_routes` (stage `stats`, PAID_ONLY) remains — it is
in the final-blocker set for every WR/RB/TE, and QB starts for QB. And even
"all free-solvable" fails because the authored context judgments
(`competition_pressure`, `contract_security`, role flags) have **no free source**.

## Phase 4 — Field criticality (classification of every blocking field)

| Class | Meaning | Example fields | Free MVP? |
|---|---|---|---|
| `DIRECT_FREE` | observable now, free | metadata, `practice_status`, `depth_chart_role` | yes |
| `DERIVABLE_FREE` | computable from free data | counting stats, `target_share`, projections, `qb_environment_score`, `team_points_per_drive` | yes (needs a stage) |
| `AUTHORED_FACT` | real fact, manual entry | `role_change`, `route_role_change`, `prospect_type`, flags | **no free feed** |
| `AUTHORED_ESTIMATE` | subjective 0–1 judgment | `contract_security`, `competition_pressure`, `organizational_commitment` | **no free feed** |
| `PAID_ONLY` | no free source | `career_routes`, `career_starts`, `recent_starts` | **no** (spec-fallback possible) |
| `SPEC_CHANGE_REQUIRED` | only via contract revision | (routes/starts have this as a fallback) | via spec change |

`career_routes` and QB starts carry a **spec-fallback** flag: a snap-derived
proxy count / a games-played proxy *could* satisfy them if the engine contract
were revised to accept it (WR §175 already authorizes a snap→route proxy; the TE
engine already applies one).

## Phase 5 — Strategy analysis & scoring

Scores 1–5 (5 best). Weighted total weights: players-unlocked ×3, all-position ×2,
model-fidelity ×2, legal ×2, determinism ×1, source-stability ×1, maintenance ×1,
implementation-cost ×1, time-to-MVP ×1.

| Strategy | Players | All-pos | Fidelity | Legal | Determ. | Stability | Maint. | Impl. | Time | Weighted | Fatal flaw |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A Context only | 1 | 1 | 3 | 4 | 4 | 3 | 2 | 3 | 3 | low | **unlocks 0** — routes/starts + authored judgments remain |
| B Projections only | 1 | 1 | 3 | 5 | 4 | 3 | 3 | 3 | 3 | low | **unlocks 0** — same wall |
| C Context + projections | 1 | 1 | 3 | 4 | 4 | 3 | 2 | 2 | 2 | low-mid | **still unlocks 0** — routes/starts remain (PAID) |
| D Paid route/charting + starts | 5 | 4 | 5 | 2 | 4 | 3 | 3 | 2 | 2 | mid | recurring cost + licensing; still needs projections + context |
| **E Authored MVP supplement** | **5** | **5** | 3 | **5** | **5** | 4 | 2 | **4** | **5** | **high** | manual maintenance; estimates need honest confidence |
| F Spec revision (free proxies) | 4 | 3 | 3 | 5 | 4 | 4 | 3 | 3 | 3 | mid-high | changes engine contracts; still needs projections + authored context |
| G Limited-position MVP | ~2 | 2 | 4 | 5 | 5 | 4 | 3 | 4 | 4 | mid | narrower scope does **not** remove the routes/starts/authored wall |

Key finding for D/F/G: none of them, alone, removes the **authored-context** wall
(`competition_pressure`, `contract_security`, role flags). A free/paid data
strategy still needs those authored. So the shortest path to *any* ready active
player is authoring.

## Phase 6 — Recommendation

### Primary: **Strategy E — versioned, curated authored MVP supplement**

Build a reviewed, deterministic `authored-supplement.vN.json` covering a curated
top-N (e.g. 60–150 fantasy-relevant players) across **all four positions**,
supplying exactly the fields no free stage can: `career_routes` (or the spec
fallback), QB starts, and the authored context judgments — layered over the free
stats/snap stages that already supply counting/efficiency where available.

- **Build next:** the authored-supplement loader + provenance (mark each value
  `AUTHORED_FACT` / `AUTHORED_ESTIMATE`, never as provider data), versioning, a
  review checklist, and confidence that reflects authored/estimated inputs. This
  reuses the existing supplement/merge/readiness seam — no engine change.
- **Do NOT build next:** a context ingestion stage or a projections stage *first*
  — the frontier proves they unlock 0 players until routes/starts and the authored
  judgments exist.
- **Unlocks:** all curated players, all four positions (fixture: authored → 9/9).
- **Remaining blockers:** none for curated players; everyone else stays NOT_READY
  (honest, expected).
- **Spec decisions required:** whether authored `career_routes` is a real history
  or a snap-proxy estimate (set provenance accordingly); the confidence treatment
  of authored estimates.
- **Maintenance:** weekly-ish edits for role/injury/depth-chart changes on the
  curated set — hobby-practical at N≈100.
- **Success criteria:** ≥ N curated players READY across all four positions;
  deterministic versioned output; authored values never labeled as provider data;
  confidence visibly lower for estimate-backed players.

### Fallback: **Strategy F+ — free projections + context-free stages + spec-fallback proxies, authoring only the irreducible judgments**

Triggered if the authored set must scale beyond hand-maintenance (say N > ~200) or
the market wants broad coverage. Build a projections stage and a context stage for
the free-derivable fields, adopt the spec fallback so the existing snap stage
satisfies routes and a games-proxy satisfies starts, and author **only**
`contract_security` / `competition_pressure` / role-change flags. Higher build
cost and one engine-contract decision, but scales to the full active-player set.

**Not recommended:** another historical-data adapter (the frontier proves it moves
0 active players), or context/projections *first* (they unlock 0 until the wall is
removed).

## Phase 7 — Next implementation prompt outline (do not build yet)

> **Authored MVP Supplement Stage.** Add a versioned `authored-supplement`
> loader + schema under `src/pipeline/authored/`: typed per-position records
> keyed by canonical id, each field carrying explicit `AUTHORED_FACT` /
> `AUTHORED_ESTIMATE` provenance and a source note; a validation pass; merge as
> the highest-precedence supplement layer (authored > snaps > stats > metadata);
> a readiness report distinguishing authored-satisfied from free-satisfied
> fields; confidence/quality flags surfaced so authored-estimate-backed players
> are visibly lower-confidence. Curate ~100 players across WR/RB/TE/QB. Do not
> label authored values as provider data. Deterministic, offline, no engine
> change. Success = curated players READY across all four positions with honest
> provenance and confidence.
