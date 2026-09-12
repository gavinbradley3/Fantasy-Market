# Operations — automated refresh

**Policy: try Sleeper automatically, never depend on Sleeper.** nflverse is the only required
provider. Everything below follows from that and from one measured constraint: a production
ingest peaks at 6.6 GB resident.

## 1. What existed before this pass

An honest audit, because it changes what "automate the production refresh" can mean:

| | state before |
|---|---|
| hosting / deployment platform | **none** — no `vercel.json`, `netlify.toml`, `fly.toml`, `Dockerfile`, `render.yaml`, `railway.json`, `Procfile` or `app.yaml` |
| CI | **none** — no `.github/` directory at all |
| scheduled jobs | **none** |
| environment variables | **none** — no `.env`, no `.env.example` |
| production database | a single SQLite file at `.local/playerticker.db`, **gitignored**, 184 MB for one season |
| how the app got data | `scripts/serve-api.ts` run **by hand** on a laptop; the SPA calls `VITE_PLAYERTICKER_API_URL`, defaulting to `/api` through the Vite dev proxy |
| ingestion | `npm run ingest`, `npm run ingest:market`, run by hand |
| build / start | `npm run build` (tsc + vite build) → static SPA; no server start command |

So there was no production environment to automate, and no durable storage. That is the
starting point, and §5 and §12 say exactly what it means.

## 2. Scheduler: GitHub Actions

Chosen because it is the only platform the project already uses, and it satisfies every
requirement the work actually has:

- runners have unrestricted outbound HTTPS to nflverse, Sleeper and DynastyProcess
- a job may run for hours, with a heap size we control
- logs and run history are retained and failures are visible without extra tooling
- no new provider, no account, no bill

**A serverless function platform was rejected on the facts, not on preference.** Vercel
functions cap at seconds-to-minutes and have an ephemeral, read-mostly filesystem; this ingest
runs for over two minutes and writes a 527 MB SQLite working store. Forcing it there would mean
rewriting the pipeline around a different storage model, which is a much larger change than the
automation itself.

Three workflows:

| workflow | schedule | what it does |
|---|---|---|
| `.github/workflows/refresh-board.yml` | every 6 h | nflverse + optional Sleeper → valuation → publish → export |
| `.github/workflows/refresh-market.yml` | weekly, Mon 06:20 UTC | DynastyProcess capture → append to history → export |
| `.github/workflows/ci.yml` | every push / PR | typecheck, test, build |

### Concurrency

Each refresh workflow declares a `concurrency` group with `cancel-in-progress: false`. A second
run **waits** rather than killing one that may be seconds from publishing, so two runs can never
interleave writes and leave a board and a status document from different runs. Board and market
use separate groups because they must be able to run and fail independently. The commit step
retries with a rebase, so two data-writing workflows finishing close together cannot drop a
history line.

## 3. Cadence, and why

**nflverse — every 6 hours.** Its weekly player-stats release lands after the last game of a
week and is then corrected over the following day or two. Six hours keeps the board inside one
release cycle without repeatedly polling a file that changes weekly. Four runs a day at ~2.5
minutes each is negligible runner time.

**Sleeper — alongside nflverse, no separate loop.** It is lightweight current-state enrichment
and its only product contribution today is an injury designation and a cross-provider id union.
A separate high-frequency poll would add load and change nothing: a weekly roster row always
outranks Sleeper's status, so its influence is bounded by design.

**DynastyProcess — weekly.** The published values move on a roughly weekly cadence. A daily
capture would record the same numbers repeatedly, inflate the append-only history and imply
movement the source never published. Monday 06:20 UTC sits after the weekend's games are priced
in.

## 4. Sleeper in production

`npm run ingest` now attempts Sleeper **by default**. `--no-sleeper` opts out; `--sleeper` is
kept as a no-op for compatibility. No operator flag is needed to get enrichment, and none is
needed to survive losing it.

Sleeper is not in `REQUIRED_PROVIDERS`, so every failure mode lands in the same place:

| Sleeper outcome | what happens |
|---|---|
| succeeds | injury designation and provider ids enriched, attributed to Sleeper per field |
| times out / blocked / provider error / schema mismatch | recorded as a source failure; run is `partial`; **board still publishes** |
| supplies no designation | nothing is written; the field stays absent |

A Sleeper failure never deletes the board, never removes a player, never substitutes synthetic
data, never re-uses a stale designation as current, and never marks the run a required-provider
failure. `status.json` reports `providers.sleeper.required: false` so a consumer can tell a
failed enrichment from a failed board without knowing the policy.

Verified live: the run recorded below attempted Sleeper automatically, Sleeper failed, and the
board published 867 entries with `overall: "ok"`.

## 5. Persistence — and the honest part

**The SQLite database is a per-run working store and is thrown away.** It is 527 MB for the
production window, most of it raw provider payloads and a 61 MB snapshot blob. None of that is
needed to render the product.

**The durable store is the `site-data` git branch.** Each successful run commits:

| file | contents |
|---|---|
| `board.json` | the published board — byte-identical to what `GET /publication` returns, 2.66 MB |
| `market-latest.json` | latest quotes with attribution and capture instants |
| `market-history.jsonl` | **append-only**, one line per capture, never rewritten |
| `status.json` | freshness and provider metadata |

This survives redeployments because it is git: history is the version record, and a failed run
commits nothing, so the previous board stays exactly where it was. `seed-market-history.ts`
reads the committed history back into a fresh database before each market capture, so
append-only semantics hold across runs that share no filesystem.

**What is NOT yet resolved:** the SPA still reads `VITE_PLAYERTICKER_API_URL`, which points at a
hand-run local API server. Pointing it at the committed `board.json` (or hosting the SPA at all)
is a deployment decision that has not been made. See §12.

## 6. Atomic publication and last-known-good

```
fetch → validate → normalize → compute → persist candidate → publish → export → commit
```

Four independent gates protect the served board:

1. **Publication gate.** `publishBoard` refuses a run in which a required provider failed, a run
   with no snapshot, and a run with zero inference associations — and validates every board
   entry against the run's snapshot before writing. It publishes on `partial` only when
   `requiredFailure` is false, which is what lets a Sleeper outage through and keeps an nflverse
   outage out.
2. **Export gate.** No board is published → no `board.json` is written. A previous export on the
   branch is left untouched.
3. **Commit gate.** The workflow refuses to commit if `board.json` is absent, with an
   `::error::` annotation. The market job commits only the market files, so a market-only
   database (which has no publication) can never blank a good board.
4. **Git.** A failed run produces no commit, so the last known-good data is the branch head. Its
   history is auditable.

## 7. Memory

**Measured, not estimated.** `process.resourceUsage().maxRSS` is now reported on every run.

| run shape | peak RSS | live heap at exit | duration | board |
|---|---|---|---|---|
| 3 valuation seasons + **9** career seasons (production) | **6,604 MB** | 4,625 MB | 137.5 s | 867 / 823 valued |
| 3 valuation seasons + 3 career seasons | 5,570 MB | 2,963 MB | 109.4 s | 867 / 823 valued |

**Cause.** Not a leak. The pipeline is whole-snapshot-in-memory by design: every game across the
career window is a live JS object graph, and `snapshot_artifact` then serializes the whole thing
to a single JSON string — 61.4 MB for one season alone — so the object graph and its
serialization are alive simultaneously. For one season the stored artifacts are 83 MB of raw
payloads plus a 61 MB snapshot; nine career seasons scale that.

**What was NOT done, and why.** Trimming the career window saves ~1 GB and is **not a safe
lever**: those seasons feed the QB career aggregates (`career_pass_attempts`, `career_starts`,
`career_adjusted_yards_per_attempt`, `career_rushing_yards_per_start`), so shortening it changes
QB valuations — which this task must treat as a regression. Streaming the snapshot serialization
or aggregating career windows incrementally would genuinely reduce peak memory, but both are
ingestion refactors with determinism risk, and this pass was scoped not to take that risk.

**What was done instead.** An explicit, documented limit plus a guard that fails *visibly*:

- `NODE_OPTIONS=--max-old-space-size=6144` in the workflow — above the 4,625 MB measured heap,
  with room for the collector to move objects rather than merely hold them.
- `src/ops/heapGuard.ts` checks the limit **before any provider is contacted** and exits with the
  numbers and the exact fix. Without it, the process fetches and parses every payload and is then
  killed mid-computation, which reads like a provider fault and is not one.
- Every run reports its own peak, so drift toward the ceiling is visible before it is a crash.

**`NODE_OPTIONS` is still required.** The default limit (~2 GB) cannot run a production window,
and nothing in this pass changed that. It is set in the workflow, so it is not an operator step.

## 8. Freshness

`status.json`, built by `src/ops/status.ts` as a pure function of persisted state and an injected
clock. It answers: when nflverse last succeeded, when Sleeper was last attempted and whether it
worked, when the market last refreshed and whether it is stale, when the board was computed,
whether the last attempt failed, which required providers succeeded, player count and quote
count — plus `servingLastKnownGood`, so a preserved board is visible rather than inferred.

Thresholds (`src/ops/staleness.ts`) are **derived from the cadence**, not chosen by feel:

| dataset | current within | stale until | then |
|---|---|---|---|
| board | 12 h (2 × 6 h cadence) | 7 days | `expired` |
| market | 336 h (2 × weekly cadence) | 30 days | `expired` |

Two cadences means one missed run is tolerated as operational noise; two consecutive misses is a
signal. A missing timestamp is `unknown`, **never** `current` — the absence of a refresh record
is not evidence of a recent refresh, and defaulting it the other way is how a broken pipeline
comes to look healthy. Each document publishes the threshold it was judged against, so a label
can be audited. `overall` is `degraded` when the board is not current or a required provider
failed; a Sleeper failure alone is **not** degraded.

## 9. Failure matrix

| scenario | board | market | run status | served data |
|---|---|---|---|---|
| nflverse ✓ / Sleeper ✓ | published, enriched | untouched | `success` | new board |
| nflverse ✓ / Sleeper ✗ | **published**, nflverse-only | untouched | `partial`, `requiredFailure: false` | new board; `overall: ok` |
| nflverse ✗ / Sleeper ✓ | **not published** | untouched | `partial`, `requiredFailure: true` | **last known-good**; `overall: degraded`, `servingLastKnownGood: true` |
| market ✓ | untouched | appended | — | new snapshot |
| market ✗ | untouched | **previous snapshot preserved**, marked stale once past threshold | — | previous market data, honestly labelled |
| crash during computation | **not published** — no commit | untouched | run row records the attempt | last known-good |

No path substitutes synthetic or empty values for real ones.

## 10. Deployment

**GitHub Pages**, built and deployed by `.github/workflows/deploy.yml`.

```
providers → GitHub Actions (refresh) → site-data branch → deploy workflow → GitHub Pages → SPA
```

The deploy builds the SPA and copies `board.json`, `status.json` and `market-latest.json` from
the `site-data` branch into `dist/data/`, so the browser fetches them from the same origin and
CDN as the app. **One source of truth:** the copy happens in CI, from the branch, every deploy,
so the served JSON cannot drift from what the refresh published — it *is* what the refresh
published. `market-history.jsonl` is deliberately not copied: nothing in the UI reads it, it is
the archive rather than a serving document, and it grows without bound.

**Code deploy:** a push to the default branch (ignoring `docs/**` and `*.md`).
**Data deploy:** each refresh workflow calls the deploy workflow when — and only when — it
actually committed new data.

Pages was chosen over Vercel and Netlify because it needs **no third-party account and no
authorization click**: it is a repository setting on a repo that already runs Actions. It is
free, HTTPS by default, CDN-backed and supports a custom domain later. Vercel or Netlify would
be equally capable and would each add an account, an app authorization and a second place to
look when something breaks.

Two Pages specifics are handled in the build: a project site is served from `/<repo>/`, so
`PLAYERTICKER_BASE_PATH` is derived from the repository name and the router takes its basename
from `import.meta.env.BASE_URL`; and Pages serves files rather than routes, so `index.html` is
copied to `404.html` as the standard single-page fallback for deep links.

### Known scaling limit

`market-history.jsonl` grows by one line per weekly capture — roughly 50 KB, about 2.6 MB a
year. **Migration trigger: when the file passes 50 MB, or when a shallow clone of `site-data`
starts adding noticeable time to the deploy.** At the current rate that is many years away, so
nothing is migrated now. When it arrives, the smallest fix is to shard by season
(`market-history-2026.jsonl`), which keeps the git-based store and needs no database.

## 11. One-time setup

See the accompanying report. Nothing here is a recurring task.
