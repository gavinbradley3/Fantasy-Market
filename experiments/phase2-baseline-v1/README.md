# phase2-baseline-v1: INVALID for PlayerTicker. Kept as evidence.

The frozen PlayerTicker predictions in this experiment were replayed from one shared capture store.
On an HTTP 304 the transport reuses a cached envelope verbatim, **including the effective date of
whichever run first fetched it** (`src/transport/refresh.ts`). The nflverse adapter derives `age` and
`nfl_seasons_completed` from that date (`src/ingestion/adapters/nflverse.ts`).

Result: every date from 2019-W4 onward was valued with player ages and experience **as of
October 2019**. The run databases record it: the 2021-W8 replay's `nflverse:identity` payload has
`effective_date = 2019-10-01T12:15:00Z`. Players drafted after 2019 fell back to nflverse's
current `years_exp`, which leaks 2026 state into history. Example at 2021-W8:

| QB | v1 (shared captures) | v2 (isolated captures) |
|---|---|---|
| Trevor Lawrence | unvalued (INSUFFICIENT) | QB25 |
| Justin Herbert | QB37 | QB6 |
| Joe Burrow | QB38 | QB15 |

The baselines and outcomes here are unaffected; they read the harness's own files, not the
pipeline captures. The PlayerTicker comparison is not. Use `phase2-baseline-v2`.

The production pipeline has the same code path: a 304 on the players export keeps the previous
run's effective date. See docs/PHASE2_VALIDATION_PLAN.md, defect P2-D1.
