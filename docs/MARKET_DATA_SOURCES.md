# External dynasty market data — sources, licensing, and the boundary

PlayerTicker's valuation engines produce PlayerTicker's own numbers. This document covers the
other kind of number on the board: what an **external market** says a player is worth.

The two are stored separately, served separately, and compared explicitly. Nothing in this
document licenses mixing them.

---

## The one source wired today

**DynastyProcess** — <https://github.com/dynastyprocess/data>

| | |
|---|---|
| Files consumed | `files/values-players.csv`, `files/db_playerids.csv` |
| Formats published | `value_1qb` **and** `value_2qb` (2QB = Superflex), explicitly, as separate columns |
| Primary lens here | `dynasty_superflex`, read from `value_2qb` |
| Refresh cadence | **Weekly**, via the repository's own GitHub Actions |
| Source version | Each row carries its own `scrape_date`, stored verbatim as `source_version` |
| Access | Public HTTPS, no auth, no key, no rate limit to negotiate |
| Repository licence | GPL-3.0, published "for the purpose of supporting apps and developers" |
| Values derived from | **FantasyPros expert consensus** |

### Why this source and not another

It is the only reachable source that publishes **both formats explicitly**. Everything else
either quotes one format and leaves you to infer the other — which would misprice every
quarterback — or has no public data access at all.

It also ships an **id crosswalk in the same repository**. `db_playerids.csv` carries
`fantasypros_id` alongside `gsis_id`, and `gsis` is the namespace PlayerTicker already mints
canonical ids from. So the join is `fp_id → gsis_id → IdentityResolver`, using the pipeline's
own resolver. No parallel identity system exists, and none is needed.

### Why the join must go through an id

The crosswalk contains two players named **Justin Jefferson**: the Vikings WR (`00-0036322`)
and a Browns LB (`00-0041075`). Name matching picks whichever row sorts first. There is a test
pinning this case (`src/market/dynastyProcess.test.ts`) so nobody can reintroduce a name join
as a "simplification".

---

## The licensing boundary

**DynastyProcess values are an external comparison source, not PlayerTicker-owned market
data.** The distinction is not cosmetic and it is enforced in code:

- `market_snapshot` rows carry `source`, `source_player_id`, `source_timestamp` and
  `source_version` — attribution travels with every row, not in a README.
- `GET /market` returns a **required** `attribution` envelope naming the publisher, the
  licence, the upstream party, and the usage restriction. The frontend schema rejects a
  response without it (`src/services/api/market.ts`).
- The board labels the market columns with the publisher's name and the words "external
  comparison source, not a PlayerTicker valuation".

### The unresolved question, stated plainly

GPL-3.0 is DynastyProcess's licence for **its repository**. GPL is a software licence. It does
not settle the upstream rights to the **FantasyPros expert-consensus numbers** those values are
derived from.

- Internal use and model-vs-market comparison look defensible.
- **Public re-publication of the raw values is an open question and has not been cleared.**

Until it is, the following are deliberately not built:

- no public export endpoint,
- no bulk dump of the source dataset,
- no re-serving of the upstream id space (`sourcePlayerId`) or the FantasyPros consensus rank
  (`sourceConsensusRank`) over HTTP — both are retained in storage for audit and withheld from
  the API,
- no presentation of a market number as a PlayerTicker valuation.

If the answer changes, it changes here first.

---

## Sources considered and not used

| Source | Dynasty? | Superflex? | Access | Why not |
|---|---|---|---|---|
| FantasyCalc | Yes | Yes (`numQbs=2`) | Public JSON API | Not reachable from the current sandbox (org egress policy blocks `api.fantasycalc.com`). A viable second source to evaluate from an unrestricted host. |
| KeepTradeCut | Yes | Yes | No documented public API | Would require scraping. Out of scope, and not something to do quietly. |
| FantasyPros API | Partial | Partial | Auth + paid tier | Paid, and restrictive terms. |
| Sleeper trending adds/drops | **No** | n/a | Public | **Not a market value.** See below. |
| Sleeper / redraft ADP | **No** | No | Public | Wrong lens — redraft, not dynasty. |

### Sleeper is not a dynasty market

Sleeper's trending adds, trending drops, roster percentage and ADP are **activity and
popularity signals**. They measure what fantasy managers are doing this week. They are not
prices, they do not clear a trade, and converting any of them into a "value" would be
fabricating a market that does not exist.

Sleeper's place in PlayerTicker is identity and metadata — see `docs/SLEEPER_INTEGRATION.md`.

---

## Freshness language

The source refreshes **weekly**. The product's wording is bounded by that:

- ✅ "Market updated Sep 11", "weekly", "Updated 3d ago"
- ❌ "live", "real-time", "current price", **any 1H or 24H movement window**

`GET /market` returns `captureCount`. Below two captures there is nothing to measure movement
*between*, and the board says "no market movement is shown" rather than rendering a zero
change. `ExternalMarket.movementAvailable` exposes this as a flag so no screen has to
rediscover the rule.

---

## Operating it

```bash
npm run ingest:market                 # fetch, resolve, append a capture to the production DB
npm run ingest:market -- --dry-run    # everything except the write
npm run ingest:market -- --format dynasty_1qb
```

Each run reports source rows, valid values, resolved identities, unresolved identities (broken
down by reason), snapshots stored, and the source date. Nothing is discarded silently: a run
that dropped a third of the league would otherwise look exactly like a healthy one.

Storage is **append-only** (`market_snapshot`, migration 4). `ingested_at` is part of the
primary key, so a new capture is a new row and yesterday's is untouched. Re-running the
identical capture is a no-op, not an overwrite.
