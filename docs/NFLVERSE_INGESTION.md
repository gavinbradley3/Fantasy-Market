# nflverse ingestion

How real nflverse data enters production, what it can and cannot support, and why.

## The shape of the problem

nflverse does not serve a dataset at a fixed, versioned URL. It publishes each dataset as a
GitHub **release**, and each release carries a manifest recording when it was last rebuilt:

```
<base>/<tag>/timestamp.json   →  {"last_updated":"2026-07-27 07:17:28 EDT"}
<base>/<tag>/<asset>          →  the data file (CSV)
```

So "fetch the current nflverse data" is two requests, not one: discover the release's version,
then fetch that release's asset. Both go through the same `HttpClient`, so retry policy,
timeouts, size caps, redaction and cancellation apply identically to each.

## Release map

| Capability | Release tag | Asset | Season-scoped |
|---|---|---|---|
| `identity` | `players` | `players.csv` | no |
| `schedule` | `schedules` | `games.csv` | no |
| `roster` | `weekly_rosters` | `roster_weekly_<season>.csv` | yes |
| `games` | `stats_player` | `stats_player_week_<season>.csv` | yes |
| `participation` | `pbp_participation` | `pbp_participation_<season>.csv` | yes |

The table lives in `src/transport/providers/nflverseReleases.ts` and nowhere else.

Two entries deserve a note:

- **`games` uses `stats_player`, not `player_stats`.** The `player_stats` release stopped being
  rebuilt after the 2024 season and carries no file for later seasons. Its column vocabulary also
  differs (`recent_team`, `interceptions`, `sacks` against `team`, `passing_interceptions`,
  `sacks_suffered`); the adapter reads both spellings, so either release normalizes.
- **`officialStarts` is absent on purpose.** nflverse publishes no starts resource, but its
  schedules export names each game's starting quarterbacks (`home_qb_id` / `away_qb_id`). That
  payload therefore feeds two capabilities, declared through `alsoNormalizes` rather than
  registered as a second coordinate at the same URL — one fetch, one capture, one replay.

Capabilities nflverse publishes nothing for (`injuries`, `transactions`, `depthCharts`,
`projections`, `team`) are simply absent from the map, so requesting one yields an explicit
`UNSUPPORTED_CAPABILITY` error. A declared path that 404s would read like an outage instead of
the truth.

## CSV decoding

Releases are CSV, decoded structurally (`src/transport/csv.ts`) exactly as `JSON.parse` decodes
a JSON payload — no field names, no provider vocabulary, no units. Two properties matter:

- **Real RFC 4180 parsing.** The provider quotes fields containing commas (headshot URLs do).
  Splitting on commas would shift every later column in the row — corrupting data rather than
  failing, which is the worse outcome.
- **Null is not zero.** An empty cell or an `NA` token decodes to `null`. A player with no
  recorded carries is not a player with zero carries, and that distinction survives all the way
  to the engines.

Typing is lexical and field-agnostic: strict decimals become numbers, `TRUE`/`FALSE` become
booleans, everything else stays a string. The decimal rule rejects leading zeros, so provider
identifiers (`00-0034857`, `007`) keep their exact text instead of silently becoming numbers and
breaking every identity join.

Structural defects are reported rather than smoothed over: a ragged row (the signature of a
truncated download) and a duplicated header are both non-retryable `DECODE_FAILURE`s.

## Freshness

Each release's `last_updated` is recorded on the envelope verbatim (`sourceVersion`) alongside
the parsed instant (`sourceLastUpdated`), and flows into Phase 4 `FreshnessMeta` — which is what
the confidence model reads. The provider's own statement about its data wins over `Last-Modified`
and `ETag`, which describe the file transfer and can be rewritten by a CDN without the dataset
changing. Those HTTP validators remain the fallback and remain what conditional revalidation uses.

Only the two US-Eastern zone abbreviations the provider actually stamps (`EST`/`EDT`) are
recognised. An unrecognised zone yields no instant, and the raw text is kept as an opaque version
token — inventing an instant the provider never stated would be worse than reporting none.

## Participation, and why it is folded

nflverse publishes participation **play by play**: one row per play carrying the game id and
`offense_players`, the on-field offense as semicolon-separated GSIS ids. The normalized record is
per player per game, so the play rows are folded into that shape in the adapter.

A play counts as a dropback exactly when the provider recorded a `time_to_throw` for it — a
throw-timing measurement only exists on a play the passer dropped back for. This is the
provider's own signal, not a reconstruction from personnel or formation. It is deliberately
conservative: a sack or scramble with no recorded throw time is not counted, so `passPlaySnaps`
and `teamDropbacks` are both floors, and the ratio between them stays honest because one rule
defines both.

Seasons after 2023 are marked uncovered, routing the WR route model to its strictly more cautious
estimate rung. Where the provider's own era classification is unclear, the under-claiming side is
taken on purpose.

## Point-in-time integrity

A board carries an as-of date, and nothing dated after it may inform it.

The trap is that nflverse's identity export (`players.csv`) is a **current-state** resource:
`latest_team`, `status` and `position` describe the moment the provider last rebuilt the
release, and there is no way to ask what it said in February. Stamping such a payload with
the pipeline's as-of makes it pass as-of clamping trivially — the data then looks historical
while being current. Measured against the real exports, that mis-stated the team of 202 of
912 modelled players and the status of 366.

So each time-varying fact is resolved AT the as-of:

| Fact | Historical source | Fallback |
|---|---|---|
| team | newest weekly-roster row at or before as-of | identity export, only if attested at or before as-of |
| roster / availability status | same | same |
| teammates (competition) | each teammate's own as-of roster row | — |
| seasons completed | derived from the time-invariant rookie season, at the as-of | provider's current experience column |
| age | derived from birth date, at the as-of | — |
| injury designation | none exists | identity export, only if attested |

Weekly roster rows are timestamped at their **week boundary**, which is what makes them
answerable point-in-time. A current-state resource is timestamped at the provider's own
`last_updated` — the instant its content is attested for — never at the caller's as-of. When
neither source can attest a field for the as-of it is reported **absent**, and the readiness
layer treats that honestly (a QB with no status is `NOT_READY`); it is never filled in from
the present.

`src/ingestion/pointInTime.test.ts` fails if any of this is reverted.

## Player selection

A live refresh ingests the provider's entire identity export — every player it has ever carried.
A player is valued when both hold:

1. the identity export gives them one of the four modelled positions, and
2. the snapshot holds at least one regular-season game stat record for them at or before `as-of`.

Criterion 2 means "the provider recorded them playing in a season we ingested". It is not a
quality filter and not a cap: it never ranks, never scores, and never drops a player who has
evidence. Which seasons are in scope is decided by the source plan, in the open.

## Replay

The source plan is the same list for a live run and a replay; only `mode` differs. Every raw
payload is captured with its checksum, so a replay reproduces the same snapshot id, the same
output checksums and the same content-derived publication id with the network unused.
`npm run ingest -- --verify-replay` runs both and fails on any divergence.

## What live data supports, by position

Measured against nflverse's current releases for seasons 2023–2025, as of `2026-02-15`
(868 players selected, 814 valued):

| Position | Selected | Valued | Tier | Remaining blocker |
|---|---|---|---|---|
| QB | 111 | 111 | FULL | — |
| WR | 340 | 310 | FULL | `career_routes` (30 players below the 3-game minimum) |
| RB | 237 | 226 | ACCESSIBLE | none universal; 11 have no carries or targets at all |
| TE | 180 | 167 | ACCESSIBLE | none universal; 13 were never targeted |

### RB and TE are valued by the accessible-data model

`career_routes` is a non-nullable input of the FROZEN RB/TE engines, and it remains genuinely
unavailable: the frozen route model (`src/inference/d1/routeExposure.ts`, REGISTRY §8.1 rungs
4/5) states that `career_routes` is `UNAVAILABLE` unless charted — the WR pass-play proxy is
explicitly WR-only, and the TE path never computes routes at all.

nflverse publishes no charted per-player route counts:

- `pbp_participation` carries a `route` column, but it describes the route run on that play by the
  targeted receiver, not a per-player route count.
- `pfr_advstats` weekly receiving carries broken tackles, drops and passer rating — no routes.
- `ftn_charting` is play-level (formation, pressure, coverage) with no per-player route data.

So the FULL tier stays correctly blocked for RB and TE, and no route number is manufactured.

What changed is that this no longer means the positions publish nothing. A separate,
clearly-labelled **accessible-data model** values them from the evidence the pipeline really
has — the weekly box score, point-in-time biographical facts, and team shares reconstructed
from the same box scores. It is a different model with its own components, weights and
confidence ceiling (never HIGH), not the frozen engine with defaults substituted, and the tier
is published per player so the two can never be confused. See
[`valuation-models/ACCESSIBLE_DATA_MODEL_RB_TE_V1.md`](valuation-models/ACCESSIBLE_DATA_MODEL_RB_TE_V1.md).

Lifting RB/TE to the FULL tier still requires a charted route source, which is a licensing
decision rather than an engineering one. The tier system routes there automatically the moment
`career_routes` is present.

### The box-score columns the accessible tier consumes

The weekly stats export is ingested with `carries`, `rushing_yards`, `rushing_tds`, `targets`,
`receptions`, `receiving_yards` and `receiving_tds` populated on **100% of the 56,979 ingested
game records**. Before this work those columns were decoded, normalized, snapshotted and then
discarded: `observedFacts.ts` aggregated only the two or three counting fields the frozen
engines declare, and no RB/TE rate was derived anywhere, so every efficiency and share field
was reported `UNAVAILABLE` despite being computable. `src/ingestion/observedProduction.ts` now
aggregates them, as a channel separate from the frozen supplement.

`snaps`, `teamSnaps` and `qbSnapShare` are populated on **0%** of records — nflverse publishes
no snap-counts release in the map above — so snap share genuinely is unavailable and no model
uses it.

## Recent-window separation (REGISTRY §9.2.1)

Two windows, deliberately distinct — see §9.2.1 of the registry for the binding statement:

| Window | Size | Governs | Consumer |
|---|---|---|---|
| Role | 17 team games | `recent_start_rate` | §6.2 starter_stability (internal) |
| Engine | 8 games | `recent_games`, `recent_starts`, every `recent_*` counting input | the QB engine |

The QB engine rejects `recent_games > 8` outright, so engine inputs follow the engine — the
registry's own convention for an engine-defined value (§7.3 does the same for
`probability_active`). `recent_start_rate` is not an engine input, so its 17-game window is
unchanged. `src/inference/d2/windowSeparation.test.ts` fails if either is redefined in terms
of the other.

## Open items

- **No injury feed.** nflverse publishes none, so availability is derived from the player's
  roster status at the as-of. That is a weekly-resolution signal, not a game-day designation.
- **Injury designation has no historical source.** It is used only when the identity export is
  itself attested at or before the as-of, and is otherwise absent.
- **Kickoff resolution.** The weekly stats export carries no timestamp, so ordering and as-of
  clamping use a derived week boundary (`src/ingestion/weekTiming.ts`); the schedules export
  carries a date but a US-Eastern wall clock with no offset, so only the date is used. Both are
  week/date-resolution keys and are never presented as observed kickoff times.
