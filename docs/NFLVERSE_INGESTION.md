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
(868 players selected, 421 valued):

| Position | Selected | Valued | Blocking field |
|---|---|---|---|
| QB | 111 | 111 | — |
| WR | 340 | 310 | `career_routes` (30 players below the 3-game minimum) |
| RB | 237 | 0 | `career_routes` |
| TE | 180 | 0 | `career_routes` |

### RB and TE are blocked on `career_routes`, and the blocker is correct

`career_routes` is a non-nullable numeric engine input, so a player without it is `NOT_READY` and
publishes no value. For RB and TE the frozen route model (`src/inference/d1/routeExposure.ts`,
REGISTRY §8.1 rungs 4/5) states that `career_routes` is `UNAVAILABLE` **unless charted** — the WR
pass-play proxy is explicitly WR-only, and the TE path never computes routes at all.

nflverse publishes no charted per-player route counts:

- `pbp_participation` carries a `route` column, but it describes the route run on that play by the
  targeted receiver, not a per-player route count.
- `pfr_advstats` weekly receiving carries broken tackles, drops and passer rating — no routes.
- `ftn_charting` is play-level (formation, pressure, coverage) with no per-player route data.

So the blocker is not a pipeline shortfall. It is the specification correctly refusing to
manufacture a number the data does not contain. Every RB and TE reaches readiness with all its
*other* non-nullable inputs satisfied from live data (`career_carries`, `career_touches`,
`career_targets`, `expected_games_remaining`), and stops at exactly this one field. Lifting it
requires a charted route source, which is a licensing decision, not an engineering one.

## Open items

- **Recent-window conflict.** REGISTRY §9.2 sets D2's recent window to 17 team games; the QB
  engine's input contract bounds `recent_games` to `[0,8]` and requires
  `recent_starts ≤ recent_games`. The two cannot both hold for a field the engine validates. The
  engine-facing window follows the engine (`RECENT_GAME_WINDOW` in
  `src/ingestion/observedFacts.ts`), because otherwise no quarterback with more than eight games
  can be valued at all. The conflict in the documents themselves is not resolved.
- **No injury feed.** nflverse publishes none, so availability is derived from the player's
  canonical roster status. That is a weekly-resolution signal, not a game-day designation.
- **Kickoff resolution.** The weekly stats export carries no timestamp, so ordering and as-of
  clamping use a derived week boundary (`src/ingestion/weekTiming.ts`); the schedules export
  carries a date but a US-Eastern wall clock with no offset, so only the date is used. Both are
  week/date-resolution keys and are never presented as observed kickoff times.
