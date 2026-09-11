# Sleeper integration — what exists, what depends on it, and how to verify it

## The headline

**Sleeper is optional. Nothing in PlayerTicker's valuation path requires it.** A production
refresh acquires nflverse only (`REQUIRED_PROVIDERS = ['nflverse']`), and the live board on
this branch was built with Sleeper absent.

**The Claude Code sandbox cannot reach `api.sleeper.app`.** That is an organization-level egress
policy, not Sleeper. It is not evidence that Sleeper is down, that Sleeper rejects PlayerTicker,
or that the integration is broken — and it is not a reason to delete working code.
`npm run verify:sleeper` settles the question from a host with open egress.

### How the block actually presents, and why that matters

`curl` sees the tunnel refused: `CONNECT tunnel failed, response 403`. But the sandbox proxy
**terminates TLS and answers the request itself**, so Node's `fetch` sees an ordinary HTTP
response — `403`, `content-type: text/plain`, `x-deny-reason: host_not_allowed`, body "Host not
in allowlist: api.sleeper.app."

That is a trap. A verifier that classifies only *thrown* errors reports this as
`HTTP_PROVIDER_FAILURE` and tells you Sleeper is broken. The verifier therefore reads the
response body and headers before classifying (`classifyHttpFailure`), and requires **evidence**
of an intermediary — a 407, a deny-reason header, or an egress-policy message — before naming
one. Without evidence a 403 is still attributed to Sleeper, because Sleeper is entitled to
answer 403 for its own reasons. Both directions of that error are tested.

Current verdict from inside the sandbox:

```
overall  NETWORK_PROXY_BLOCKED
players  403  an intermediary refused the request (403, x-deny-reason: host_not_allowed)
              — it never reached Sleeper. Re-run from a host with open egress.
```

---

## Where Sleeper enters the system

### 1. Transport — `src/transport/providers/sleeper.ts`

| | |
|---|---|
| Base URL | `https://api.sleeper.app/v1` |
| Registered capability | `identity` → `GET /players/nfl` |
| Decoding | Keyed map → rows, map key becomes `sleeper_id` |
| Adapter | `sleeperAdapter` (Phase 4) |

Only the real, documented endpoint is registered. Injuries, depth charts and transactions are
deliberately **not** registered for live transport: Sleeper publishes no single public resource
for them, so requesting one would mean inventing a URL. Asking for those capabilities returns
an explicit `UNSUPPORTED_CAPABILITY`.

Sleeper's resource lives at a fixed, unversioned URL with no release index, so preparation is
resolution-free — no discovery request — and freshness falls back to the HTTP validators the
response carries.

### 2. The refresh source plan — `src/runtime/sources.ts`

```ts
if (options.includeSleeper) {
  sources.push({ provider: 'sleeper', capability: 'identity', ...base });
}
```

Opt-in, defaulting to **off**, and not in `REQUIRED_PROVIDERS`. Its purpose when enabled is a
cross-provider identity join: Sleeper carries `gsis_id`, `espn_id`, `yahoo_id` and
`sportradar_id` on one record, which is raw material for `IdentityResolver`.

### 3. Pipeline adapter — `src/pipeline/providers/sleeper/`

The audited primary source for player **metadata**: names, teams, positions, physical facts,
availability, and cross-provider ids. It supplies **no** usage statistics and **no** draft
capital — those come from nflverse.

Per-record validation against a deliberately lenient schema, because the real payload has
~11k entries of varying shape (team defenses carry no name; free agents carry `team: null`).
One odd record must never poison a payload.

### 4. Frontend live service — `src/services/marketData/live/`

`SleeperClient`, `SleeperMetadataProvider`, `LiveMarketDataService`. Read-only, no auth,
24-hour cache on the players map (Sleeper's own docs ask callers to fetch it at most daily),
retries on network/5xx only, and `navigator.onLine === false` short-circuits to cache.

This path serves the **Demo Market** surfaces, not `/board`.

---

## What depends on Sleeper vs nflverse

| Capability | Source | Sleeper required? |
|---|---|---|
| Player identity (canonical id minting) | nflverse `gsis_id`, priority namespace | No |
| Cross-provider id enrichment (espn/yahoo/sportradar) | Sleeper | Only for those ids |
| Names, teams, positions | nflverse rosters (Sleeper when enabled) | No |
| Availability / injury designation | Sleeper when enabled; nflverse otherwise | No |
| Usage statistics, snaps, participation | nflverse | No |
| Draft capital | nflverse | No |
| Every valuation engine input | nflverse-derived | **No** |
| Dynasty market values | DynastyProcess | **No** |

### Degradation behaviour

Sleeper's absence degrades **enrichment**, never valuation. With `includeSleeper` off, records
simply carry fewer provider ids and availability falls back to the nflverse-derived status. The
AIL records that as a `FieldState` with an explicit `MissingReason` — the absence is published,
not papered over.

---

## Sleeper's role boundary — what it is NOT

Sleeper's trending adds, trending drops, roster percentage and ADP are **activity signals**.
They are never market values, and they are never converted into one. A dynasty market value is
what a player trades for; an add count is how many managers clicked a button this week. See
`docs/MARKET_DATA_SOURCES.md`.

The verifier labels the trending endpoints in its own output — "market ACTIVITY signal, never
a dynasty value" — so the distinction is visible at the point of contact.

---

## Verifying Sleeper from outside the sandbox

```bash
npm run verify:sleeper
npm run verify:sleeper -- --json
npm run verify:sleeper -- --timeout 60000
```

It requests the exact endpoints configured above, reports HTTP status, validates each response
against the **same zod schema the pipeline validates with**, and reports row counts. It writes
nothing, changes nothing, and opens no database. Exit 0 only when every check succeeds.

**It is not part of `npm test`, on purpose.** The deterministic suite must never require
internet access. The classification and validation logic lives in `@/diagnostics` and is unit
tested there without a socket (`src/diagnostics/sleeperVerification.test.ts`).

### The failure taxonomy

| Classification | Meaning | What to do |
|---|---|---|
| `SUCCESS` | Sleeper answered and the body matched the schema | Nothing |
| `NETWORK_PROXY_BLOCKED` | An intermediary refused before Sleeper was reached | Re-run from a host with open egress. **Not a Sleeper outage. Not a reason to remove the integration.** |
| `DNS_TLS_FAILURE` | Name would not resolve, or the handshake failed | Check DNS and the CA bundle on this host |
| `TIMEOUT` | No answer within the deadline | Re-run with a longer `--timeout` before concluding anything |
| `NETWORK_UNREACHABLE` | A socket failure that is none of the above | Reported with its code rather than guessed at |
| `HTTP_PROVIDER_FAILURE` | Sleeper itself answered non-2xx | **This one is provider-side.** Check Sleeper status and the endpoint path |
| `SCHEMA_MISMATCH` | 2xx with a body the pipeline does not recognise | Review the adapter schema before trusting the data |

A partial pass is not a pass: one blocked check sinks the run, because a run that verified two
endpoints out of three has verified nothing about the third.
