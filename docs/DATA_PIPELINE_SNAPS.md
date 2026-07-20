# PlayerTicker Snap-Count & Participation Stage (nflverse)

The snap-count stage ingests real NFL offensive participation, joins it to
canonical identities by GSIS, aggregates snap-share windows, and supplies the
**offensive snap share** the engines consume. It also encodes the specs'
position-specific route-proxy authorizations so a derivation valid for one
position is never leaked to another.

It **measures readiness honestly**: snap-share fields are nullable engine inputs,
so supplying them upgrades data quality (unavailable → direct) but removes no
readiness *blocker* — no player becomes engine-ready from snaps alone, and the
report says so.

## Architecture

```
nflverse snap_counts (fixture; PFR→GSIS crosswalked upstream)
   ▼ stats-snapshot layer (reused)  provider, dataset=snap_counts_weekly, seasons, columnSignature, checksum
   ▼ snap adapter    src/pipeline/snaps/nflverse/snapAdapter.ts   neutral SnapRecord[] + typed rejections
   ▼ GSIS join       src/pipeline/snaps/runSnaps.ts               strong-id only; unmatched/no-snaps/collision/team/pos reported
   ▼ aggregation     src/pipeline/snaps/aggregate.ts              CURRENT/PREVIOUS/LAST_4/LAST_8 snap share (deterministic)
   ▼ proxy registry  src/pipeline/snaps/proxyRegistry.ts          per-position route-proxy authorization
   ▼ supplements     src/pipeline/snaps/supplements.ts            partial snap supplements + availability report
   ▼ readiness merge (metadata + weekly stats + snaps)
```

## Dataset

| Provider | Dataset | Seasons | Key | Fields consumed | Limitations |
|---|---|---|---|---|---|
| nflverse | `snap_counts` (weekly) | 2024–2025 (fixture) | GSIS (crosswalked from PFR upstream) | `offense_snaps`, `offense_pct` | No pass/run split (routes need pbp); no carries; no starter flag. `offense_pct` may be 0–1 or 0–100 (normalized). |

Snap share is taken directly from `offense_pct`; team offensive snaps are recovered
exactly as `offense_snaps ÷ offense_pct` (no reconstruction guess). Aggregation is
order-independent; conflicting duplicate `(gsis, season, week, seasonType)` rows
resolve deterministically (sort-before-dedup).

## Route-proxy authorization (no cross-position leakage)

Two **distinct, non-interchangeable** proxies exist in the binding specs:

| Proxy | Rule | Authorized | Owner | Input available from snaps? |
|---|---|---|---|---|
| WR routes | `proxy routes = pass snaps × 0.97` (WR §5.1.4, lines 175/962) | **WR only** | pipeline | **No** — needs pass-play snaps (pbp) |
| TE route participation | `clamp(snap_share_last4 × 0.72, 0, 0.85)` (TE §26.5.2.2) | **TE only** | **frozen TE engine** | n/a — engine applies it |

- The **WR** 0.97 proxy is implemented and authorized for WR only
  (`computeWrProxyRoutes` returns `UNAUTHORIZED` for TE/RB/QB). Its input
  (pass-play snaps) is not in the snap-count dataset, so it reports
  `INPUT_UNAVAILABLE` — never a fabricated value. WR `career_routes` stays
  unavailable.
- The **TE** proxy is **owned by the frozen TE engine** (`te-model/fallbacks.ts`):
  it activates internally, with logged confidence penalties, when RP4/RP8 are null
  and `snap_share_last4` is present. The pipeline therefore **supplies
  `snap_share_last4` and leaves the route fields null** — it never re-implements
  the engine's proxy (doing so would skip the engine's penalty). The WR 0.97 rule
  is **never** applied to TE.

## Engine-field ownership (this stage)

| Position | Field | Source |
|---|---|---|
| RB | `snap_share_last4`, `snap_share_last8`, `previous_snap_share` | **snaps ✓ (DIRECT)** — offensive snap share |
| TE | `snap_share_last4` | **snaps ✓ (DIRECT)** — also arms the engine's route proxy |
| TE | `route_participation_last4/last8` | engine-owned proxy (pipeline supplies snap share, leaves null) |
| WR | `career_routes`, `route_participation_*` | **snaps ✗** — WR proxy needs pass-play snaps (pbp) |
| RB | `carry_share_last4` | **snaps ✗** — denominator is team non-QB rush attempts (weekly team stats), *not* snaps |
| RB/WR | `route_participation_*` | **snaps ✗** — route proxy needs pass-play snaps (pbp) |
| QB | `career_starts`, `recent_starts` | **snaps ✗** — snap counts cannot distinguish a starter from an early entrant |

**Exact denominators (never substituted):** snap share = offensive snaps ÷ team
offensive snaps (WR §5.1.3, RB §5.1.3). Carry share = rush attempts ÷ **team
non-QB rush attempts** (RB §5.2.1) — a weekly-team-stats denominator, so it is not
computed here. Route participation = routes ÷ team dropbacks.

## Provenance

`DIRECT` (snap share), `PROXY` (WR proxy output, when input present),
`ENGINE_OWNED_PROXY` (TE route fields the engine proxies), `UNAVAILABLE`
(input/denominator missing), `NOT_APPLICABLE` (field intentionally left for the
engine). Readiness treats an authorized proxy value as satisfying only where the
engine's contract accepts a proxy for that field (WR routes); an unauthorized
proxy produces no value and satisfies nothing.

## Running

```bash
npm run pipeline:snaps                                   # metadata + weekly stats + snaps
npm run pipeline -- --mode fixture --stats --snaps --season 2025
npm run pipeline -- --mode fixture --stats               # stats only (unchanged)
npm run pipeline -- --mode fixture                       # metadata only (unchanged)
npm run generate:pipeline-fixtures                       # rebuild committed snapshots
```

The report's **Snap-count stage** section shows rows accepted/rejected, joins,
unmatched/no-snaps/no-gsis, team/position mismatches, collisions, direct vs proxy
metrics supplied, readiness before → after snaps, newly ready, missing fields
eliminated, and remaining gaps by stage. The run exits non-zero on a corrupted
snapshot or an unsafe identity collision.

**Live retrieval remains deferred** for both weekly stats and snap counts: the
nflverse feeds are CSV/parquet releases keyed by PFR ids requiring a documented
GSIS crosswalk before snapshotting. That crosswalk + a shared release-pinned
retrieval utility is a self-contained follow-up; fixtures are always offline, so
tests never touch the network. This stage is **not** described as live-capable.

## Measured fixture outcome

5 GSIS joins; **4 direct snap-share metrics supplied** (RB×3, TE×1); **0 proxy
metrics** (WR pass-snap input absent); readiness **2 → 2**, **0 newly ready** —
because every snap-fillable engine field is nullable, snaps remove no blocker.
This is the honest result, not a shortfall.

## Current limitations / next milestone

- WR/RB route participation still blocked (needs pass-play snaps from pbp).
- RB carry share needs a team-rush-attempts denominator (weekly team stats).
- QB starts have no free source.

**Recommended next milestone:** decide from the updated per-position blocker
counts (below), not by default. The largest remaining *stats* blockers are route
counts (WR/RB/TE `career_routes`) and QB starts — both need a **pbp / charted
participation** source or a starts feed, not projections or context yet.
