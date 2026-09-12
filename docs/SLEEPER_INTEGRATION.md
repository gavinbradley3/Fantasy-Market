# Sleeper integration — what exists, what depends on it, and how to verify it

## The headline

**Sleeper is VERIFIED.** `npm run verify:sleeper`, run on 12 September 2026 from a host with
open egress, returned `SUCCESS` for all three configured endpoints, and all 12,227 player
records matched the schema the pipeline validates with. Status is recorded below.

**Sleeper is also optional.** Nothing in PlayerTicker's valuation path requires it. A production
refresh acquires nflverse only (`REQUIRED_PROVIDERS = ['nflverse']`), and the live board on this
branch was built with Sleeper absent. Verified and optional are both true: the integration works,
and no valuation depends on it.

**The Claude Code sandbox cannot reach `api.sleeper.app`.** That is an organization-level egress
policy, not Sleeper. Any `NETWORK_PROXY_BLOCKED` verdict produced in that environment is a
statement about the environment and carries no information about the provider or the integration
— which the 12 September run settles as a matter of evidence rather than argument.

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

### Verification record

| run | environment | verdict |
|---|---|---|
| 12 Sep 2026 | open egress | **`SUCCESS`** — `players`, `trending-add`, `trending-drop` all passed; 12,227 player records matched the schema |
| earlier | Claude Code sandbox | `NETWORK_PROXY_BLOCKED` — `403`, `x-deny-reason: host_not_allowed`; the request never reached Sleeper |

**The two runs together validate the taxonomy.** From inside the sandbox the verifier declined to
call a 403 a provider failure, and said the cause was an intermediary. An open-egress run then
confirmed the provider was fine all along. Had the verifier classified only *thrown* errors it
would have reported `HTTP_PROVIDER_FAILURE` and produced a false statement about a third party —
and, worse, an argument for deleting a working integration.

Sandbox verdict, kept for reference because this environment still produces it:

```
overall  NETWORK_PROXY_BLOCKED
players  403  an intermediary refused the request (403, x-deny-reason: host_not_allowed)
              — it never reached Sleeper. Re-run from a host with open egress.
```

---

## Enabling enrichment, and the gate that had to be fixed first

```bash
npm run ingest -- --sleeper [...]
npm run report:sleeper-enrichment -- --baseline .local/base.db --enriched .local/slp.db
```

### What enrichment is for

nflverse publishes a player `status` but no injury feed, so `inactive` conflates two very
different states: a player on injured reserve, and a free agent between contracts. **396 of 867
board entries — 46% — sit in that state.** Sleeper's players resource carries a per-player injury
designation, which splits it. `toAccessibleAvailability` already reads one when present; without
enrichment that branch never fires.

### A defect the first `--sleeper` run exposed

Requesting enrichment with Sleeper unreachable **published nothing**:

```
published: false   entryCount: 0
run status: partial   required_failure: 0   success 17 / failure 1
```

Seventeen nflverse sources succeeded, the snapshot was built, every player was valued — and an
867-player board became zero entries because one optional provider was unreachable.

The cause was the publication gate reading the wrong signal. A run's `status` goes to `'partial'`
when **any** source fails, including an optional one, and both `persistRefreshResult` and
`publishBoard` gated on `status === 'success'`. The signal that actually answers "is this board
trustworthy" was already computed from the refresh policy's `requiredProviders` and already
stored on the run: `requiredFailure`. Both gates now read that instead, and `publishBoard`
additionally rejects any run in which a required provider failed.

A partial run that lost only enrichment has a complete board built from complete required
evidence. What it is missing is an enrichment, and **a missing enrichment is published as an
absent field, not as an absent board.**

### Degrade behaviour, verified

Two replays from identical captures, one with `--sleeper` against a blocked Sleeper and one
without:

| | baseline | `--sleeper`, Sleeper blocked |
|---|---|---|
| published | yes | **yes** |
| entries | 867 | **867** |
| board checksum | `board-4de9fd8f777dc2b2` | **`board-4de9fd8f777dc2b2`** |
| players lost | — | **0** |
| weekly / dynasty / confidence movement | — | **none** |
| the 396 ambiguous players | `inactive` | **396 unresolved** — not assumed healthy, not assumed injured |

Same checksum: with Sleeper down, `--sleeper` produces a board byte-identical to nflverse-only.
`unresolved` is its own bucket in the report and is never folded into "genuinely unrostered",
because Sleeper not carrying a player is a gap in the join, not evidence about his health.

### Why dynasty values cannot move

All three accessible models weight availability at **exactly 0.00 on the dynasty horizon**
(`AV: 0.0` in the RB, TE and WR horizon tables). Availability is a statement about this week; a
dynasty value is a statement about years. So no injury designation, however severe, can move a
dynasty composite for the 712 accessible entries — a property of the weights rather than an
observation about one board. `availability cannot move a dynasty value` in
`src/accessible/models.test.ts` asserts it across all nine availability states, and also asserts
that weekly *does* move, so it cannot pass by being unwired.

QB is the exception and is not invariant: it is a FULL-tier engine whose spec assigns `AV: 0.03`
on DYNASTY, and its availability reaches the engine through `probability_active`. Enrichment can
therefore move a QB dynasty composite. The bound is small and computable — `AV` is
`0.7·(100·probability_active) + 0.2·injuryStatusScore + 0.1·career_start_availability`, so the
largest possible swing (healthy ⇄ out) is about 89 AV points, or **≈2.7 dynasty points on a
0–100 scale**, against ≈10.7 on weekly. Measure it with the report before enabling by default.

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

## Re-verifying Sleeper

```bash
npm run verify:sleeper
npm run verify:sleeper -- --json
npm run verify:sleeper -- --timeout 60000
```

It requests the exact endpoints configured above, reports HTTP status, validates each response
against the **same zod schema the pipeline validates with**, and reports row counts. It writes
nothing, changes nothing, and opens no database. Exit 0 only when every check succeeds.

Run it from a host with open egress; inside this sandbox it can only report the egress policy.
Re-run it when the transport configuration changes, when Sleeper announces a schema change, or
to refresh the record above.

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
