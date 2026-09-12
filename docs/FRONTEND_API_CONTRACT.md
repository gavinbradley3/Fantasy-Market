# Frontend ↔ Backend Contract (Phase 10)

How the PlayerTicker browser app talks to the internal HTTP API, and exactly what it may and
may not display. This is the frontend's view of the contract; the API's own implementation
notes live in [`src/api/README.md`](../src/api/README.md) and are deliberately not repeated
here.

---

## 1. The one rule

**The browser talks to the backend over HTTP and nothing else.**

No browser-facing file imports `@/api`, `@/application`, `@/scheduler` or `@/persistence` —
those are Node-only (`node:http`, `node:sqlite`) and would break the bundle even if they were
safe to expose. The frontend's API types in `src/services/api/types.ts` are deliberate
*duplicates* of the server DTOs, not imports of them.

Enforced by `src/services/api/boundary.test.ts` (browser side) and `src/api/boundary.test.ts`
(server side).

---

## 2. Base URL

One environment variable connects the two:

```
VITE_PLAYERTICKER_API_URL
```

Resolved by `resolveApiBaseUrl()` in `src/services/api/client.ts`:

| `VITE_PLAYERTICKER_API_URL` | Base used | CORS needed? |
|---|---|---|
| `https://api.example.com` (absolute) | `https://api.example.com` | **Yes** — the API must allow the app's origin |
| `/api` (path prefix) | `/api` | No — same origin |
| unset, `vite dev` | `/api`, proxied by `vite.config.ts` | No — same origin |
| unset, production build | `` (the app's own origin) | No — same origin |

Trailing slashes are normalized, so `https://api.example.com/` and `https://api.example.com`
behave identically and a request can never contain `//`. **No host or port is hard-coded in
frontend source.**

---

## 3. Endpoints the frontend uses

| Method & path | Where it is used | Notes |
|---|---|---|
| `GET /publication` | The Board (`src/pages/BoardPage.tsx`) via `usePublishedMarket()` | The current published board |
| `GET /market` | The Board's market columns via `useExternalMarket()` | **External** dynasty market quotes |
| `GET /health` | `fetchHealth()` — available to any provenance surface | Backend self-report |

No other endpoint is called. In particular the frontend **never** issues `POST /refresh`:
re-reading what the browser shows and rebuilding the market on the server are different
actions, and only the first belongs to the app's readers. The Board's "Refresh Market" button
re-issues `GET /publication` and nothing else.

---

## 4. `GET /publication`

### Status behavior

| Status | Client result | UI |
|---|---|---|
| `200` | `ApiPublicationResponse` | The board renders |
| `404` | `ApiError { kind: 'notFound' }` → hook status `empty` | "No market publication is available yet." |
| `400` | `ApiError { kind: 'badRequest' }` | Error state, no retry offered |
| `503` | `ApiError { kind: 'unavailable' }` | Error state with **Try Again** |
| other non-2xx | `ApiError { kind: 'server' }` | Error state with **Try Again** |
| unreachable | `ApiError { kind: 'network' }` | Error state with **Try Again** |
| 2xx, unparseable or off-contract body | `ApiError { kind: 'invalidResponse' }` | Error state, no retry offered |
| caller/timeout abort | `ApiError { kind: 'cancelled' }` | Transient; a lifecycle abort self-recovers |

**404 is not an error.** A reachable backend with nothing published is an empty market, and the
UI must say so differently from an outage.

### Response shape

```jsonc
{
  "publication": {
    "publicationId": "board-…", "runId": "run-…", "snapshotId": "snap-…",
    "boardChecksum": "…", "entryCount": 2,
    "publishedAt": "2026-07-27T15:04:49.924Z", "supersededPublicationId": null
  },
  "entries": [
    {
      // identity + integrity (always present)
      "canonicalId": "pt-24f63194cb4a8467", "position": "WR",
      "normalizedInputChecksum": "…", "outputChecksum": "…",

      // display fields — null when the publication carries none
      "name": "test receiver", "team": "CIN", "age": 26, "playerStatus": "active",
      "asOf": "2025-10-01T00:00:00.000Z",

      // model state
      "outputStatus": "UNAVAILABLE", "readiness": "NOT_READY",
      "readinessMissingCount": 19, "honestyState": "UNAVAILABLE",
      "engineInvoked": false, "limitations": ["ROUTE_PROXY", "…"],

      // valuation — null unless an engine actually ran
      "publicConfidenceLabel": null,
      "confidenceScore": null, "confidenceLabel": null,
      "volatilityScore": null, "volatilityLabel": null,
      "composites": null      // else { weekly, ros, oneYear, threeYear, dynasty }
    }
  ]
}
```

Every display field is a **projection of an artifact the publication already contains** —
identity from the persisted normalized inference input, valuation from the persisted production
envelope (`src/api/publicationProjection.ts`). Nothing is computed and nothing is defaulted:
a field the publication does not carry is `null`.

### The state of the system today

Publications currently produced by the pipeline have `readiness: "NOT_READY"` for every player,
because the AIL readiness frontier is not yet crossed with the data the ingestion layer can
supply. Those publications therefore contain **identity but no valuation**: `composites`,
`confidenceScore` and `volatilityScore` are all `null`.

The frontend renders that faithfully — an em-dash and an `UNAVAILABLE` badge per player, plus a
sentence explaining it — rather than showing a zero, an estimate, or a demo price. When the
frontier is crossed, the same path lights up with no frontend change (the valued path is
covered by tests today).

---

## 4b. `GET /market`

**External data, and the contract says so.** These are not PlayerTicker valuations: they are
quotes published by a third party, joined to PlayerTicker canonical ids. The endpoint is
read-only — there is no write path behind it, because ingestion is a deliberate, logged batch
job (`npm run ingest:market`), not something an HTTP caller can set off.

### Query parameters

| Param | Default | Behaviour |
|---|---|---|
| `format` | `dynasty_superflex` | `dynasty_superflex` \| `dynasty_1qb`. An unknown value is **rejected with 400**, never defaulted — answering a 1QB request with Superflex numbers would misprice every quarterback. |
| `source` | `dynastyprocess` | Short lowercase key. A malformed key is a 400. |

### Status behaviour

`200` always, including when no market has been ingested: an empty market is a real answer
(`quoteCount: 0`), not a 404. A persistence failure is `503`. There is no "nothing yet" error
kind to handle, unlike `GET /publication`.

### Response shape

```jsonc
{
  "source": "dynastyprocess",
  "format": "dynasty_superflex",
  "attribution": {                       // REQUIRED — the client rejects a body without it
    "publisher": "DynastyProcess",
    "url": "https://github.com/dynastyprocess/data",
    "licence": "GPL-3.0",
    "derivedFrom": "FantasyPros expert consensus",
    "refreshCadence": "weekly",          // the ceiling on any movement window the UI may offer
    "usage": "External comparison source, not PlayerTicker-owned market data. …"
  },
  "sourceTimestamp": "2026-09-11T00:00:00.000Z",  // newest quote's own stamp, or null
  "sourceVersion": "2026-09-11",                  // the source's own dataset version, verbatim
  "capturedAt": "2026-09-11T21:33:45.639Z",       // newest capture instant held, or null
  "captureCount": 2,                              // < 2 ⇒ no movement can be MEASURED
  "quoteCount": 439,
  "quotes": [
    {
      "canonicalPlayerId": "pt-d80f2bd29165c373",
      "source": "dynastyprocess",        // repeated per record so a detached quote stays attributed
      "format": "dynasty_superflex",
      "value": 10256,                    // the SOURCE's scale. null = no value published, never 0
      "overallRank": 1,
      "positionRank": 1,
      "sourceTimestamp": "2026-09-11T00:00:00.000Z",
      "ingestedAt": "2026-09-11T21:33:45.639Z",
      "freshness": "fresh",
      "provenance": "external"
    }
  ]
}
```

### What is deliberately NOT served

`sourcePlayerId` (the upstream id space) and `sourceConsensusRank` (the FantasyPros consensus
rank) are retained in storage for audit and **withheld from the API**. Re-serving them would be
redistributing another party's dataset rather than showing what PlayerTicker compares against.
See [`MARKET_DATA_SOURCES.md`](MARKET_DATA_SOURCES.md).

### Comparing it to the model

Raw values are **not comparable**: a PlayerTicker dynasty composite is a 0–100 model score and a
market value is a ~0–10,000 trade-currency number with no published conversion. The comparison
is made on **rank and percentile** (`@/market/comparison`), always dynasty-vs-dynasty regardless
of the horizon the board is displaying, and a player either side does not cover comes back with
`comparable: false` rather than a zero.

---

## 5. `GET /health`

```jsonc
{
  "status": "ok",                                   // or "degraded" (served with 503)
  "scheduler":   { "enabled": true, "running": false, "state": "idle" },
  "persistence": { "available": true },
  "publication": { "hasCurrent": true, "currentPublicationId": "board-…", "boardChecksum": "…" },
  "replay":      { "available": false },
  "transport":   { "requiredProviders": ["nflverse"], "replayEnabled": true },
  "checkedAt":   "2026-07-27T14:59:42.583Z"
}
```

A `degraded` backend answers `503`, which the client reports as `kind: 'unavailable'`.

---

## 6. Error envelope

Every non-2xx response carries:

```json
{ "error": { "code": "NOT_FOUND", "message": "no current publication", "issues": ["…"] } }
```

The client keeps `code`/`message`/`status` for logs and tests, and the UI **never renders
them**. User-facing copy is chosen from `ApiError.kind` in
`src/components/states/apiErrorCopy.ts`, so no stack trace, class name, database detail, or
low-level error object can reach the screen.

---

## 7. Adapter output

`adaptPublication()` (`src/services/publication/adapter.ts`) is the single place the wire shape
becomes the frontend model. No component converts API fields itself.

```ts
PublishedMarket {
  publicationId, runId, publishedAt, boardChecksum, entryCount,
  horizon,                       // which composite became `value` (default 'weekly')
  players: PublishedPlayer[],    // ranked, valued first
  valuedCount,                   // how many carry a published value
  rejected: RejectedRecord[],    // records refused, with a reason
}

PublishedPlayer {
  playerId,                      // the backend's canonicalId, verbatim
  position,                      // 'QB' | 'RB' | 'WR' | 'TE'
  name, team, age,               // null when not published
  value,                         // the horizon's composite, or null
  composites,                    // or null
  overallRank, positionRank,     // derived ORDERING over `value`; null when unvalued
  confidenceScore, confidenceLabel, publicConfidenceLabel,
  volatilityScore, volatilityLabel,
  honestyState, readiness, outputStatus, readinessMissingCount, limitations,
  asOf, outputChecksum,
}
```

**Rank is the only thing the adapter computes**, and it is a pure ordering over the backend's
own published value (ties and unvalued players broken by canonical id, so the order is total
and stable). There is no valuation arithmetic in the frontend.

Records are **rejected rather than repaired**:

| Reason | When |
|---|---|
| `missingId` | no `canonicalId` |
| `unknownPosition` | a position outside QB/RB/WR/TE (e.g. `K`) — never coerced into one |
| `duplicateId` | a `canonicalId` already on this board; the first occurrence wins |
| `invalidValue` | the horizon's composite is present but not a finite number |

Rejections are surfaced on the page ("_n_ published records were not displayable and were left
out rather than guessed"), never swallowed. A structurally unusable *response* throws
`PublicationAdapterError` instead of yielding a half-board.

---

## 8. Demo-data policy

The Demo Market still exists, and this is exactly where it may and may not appear.

**May:** tests; the deliberately-labelled Demo Market surfaces (`/market` movers, `/player/:ticker`
stock card, watchlist, portfolio), which depend on fields — market price, mispricing, 1/7/30-day
movement, asset class, tags, signals, sparklines — that no publication carries.

**May not:** anywhere on The Board, and never as a fallback. If `GET /publication` fails, the
page shows an error. Substituting simulated players there would make an unreachable backend
look like a healthy market, which is the single failure this page must never have. Enforced by
`src/services/api/boundary.test.ts` and asserted behaviourally in `src/pages/BoardPage.test.tsx`.

---

## 9. Local development

```bash
# 1. API — fixture-backed, no network, listens on 127.0.0.1:8787
PLAYERTICKER_SEED=1 npm run serve:api

# 2. Frontend — proxies /api to the API server, so no CORS is involved
npm run dev
```

Open `http://localhost:5173/board`.

| Variable | Side | Default | Purpose |
|---|---|---|---|
| `PLAYERTICKER_PORT` | API | `8787` | Listen port |
| `PLAYERTICKER_HOST` | API | `127.0.0.1` | Bind interface |
| `PLAYERTICKER_DB` | API | `.local/playerticker.db` | SQLite path |
| `PLAYERTICKER_SEED` | API | unset | `1` publishes one fixture board if none exists |
| `PLAYERTICKER_ALLOWED_ORIGINS` | API | unset (CORS off) | Comma-separated browser origins allowed |
| `PLAYERTICKER_API_PROXY_TARGET` | Vite | `http://127.0.0.1:8787` | Where `/api` is proxied |
| `VITE_PLAYERTICKER_API_URL` | Frontend | unset | Set to bypass the proxy and call the API directly |

To publish a board without the seed flag:

```bash
curl -X POST http://127.0.0.1:8787/refresh
```

### CORS

Not needed for the default setup — the Vite proxy makes `/api` same-origin.

It is needed only if you point the frontend directly at the API:

```bash
PLAYERTICKER_ALLOWED_ORIGINS=http://localhost:5173 npm run serve:api
VITE_PLAYERTICKER_API_URL=http://127.0.0.1:8787 npm run dev
```

The server echoes the *matched* origin — never `*` — sends `Vary: Origin`, never enables
credentials, answers a preflight from an allowed origin with `204`, and sends no CORS headers
at all to an origin that was not configured. Covered by `src/api/composition.test.ts`.

### Resource ownership

`ComposedApi.close()` closes the scheduler and the persistence store, and is idempotent. It
does **not** close any HTTP server: `createHttpServer()` hands the server to its caller, and
that caller owns the socket. `scripts/serve-api.ts` closes both, server first.
