# Controlled-beta preview: runbook and owner boundary

This is a working **private evidence preview**, not an authorized live valuation release. The
same application renders real retained evidence at `/controlled-beta`; it does not substitute
demo prices or baseline diagnostic numbers. The local server binds only `127.0.0.1`, validates
Host, refuses every API/production-data route, and never opens a database. Do not expose it
through a public tunnel. No preview artifact belongs in Git, `public`, `dist/data` or `site-data`.

## Reproduce the retained population

Run from the integration checkout. Supply the exact checked-out SHA/tree and a **new external**
output directory. The retained task workspace input is `../../outputs/role-population-2026`.

```sh
TSX_TSCONFIG_PATH=./tsconfig.app.json node --max-old-space-size=6144 --import tsx \
  scripts/build-controlled-beta.ts \
  --input-dir ../../outputs/role-population-2026 \
  --output-dir ../../outputs/controlled-beta-final \
  --code-sha "$(git rev-parse HEAD)" \
  --code-tree "$(git rev-parse 'HEAD^{tree}')" \
  --generated-at 2026-09-22T04:03:00.000Z
npm run build
npm run preview:controlled-beta -- \
  --artifact ../../outputs/controlled-beta-final/controlled-beta.json --port 4317
```

Open `http://127.0.0.1:4317/controlled-beta`. Ctrl-C stops the local server. For a second
deterministic replay, change only the output directory. Production refresh is not part of any
command above. Build output is ordinary application assets, not a serving-data export.

Inputs: `freeze-seal.json`, `frozen-manifest.json`, `envelope-identities.json`,
`selected-before-inference.json`, `role-references.json`, 13 transport envelopes in `captures/`,
and 19 raw bodies with their recorded metadata in `raw/`. Optional `run-1/` supports comparison
with the earlier v2 diagnostic checksums. The driver checks raw SHA-256/size/retrieval cutoff,
envelope/body identity, mandatory coordinates, freeze-seal identities and selected IDs/positions
before accepting the result. Capture writes and network calls throw. It creates immutable output
files using exclusive writes and rejects output paths inside the checkout or serving directories,
including symlink aliases. Dirty development code is explicitly fingerprinted; owner review uses
the clean final commit.

## Frozen meaning

- Preview configuration: `playerticker.controlled-beta/v1` (all numerical fields prohibited).
- Source configuration: `playerticker.experimental.in-season-participation-independent/v1`.
- Existing evaluator/gate: `playerticker.experimental.in-season-participation-independent/v2-role-gated`.
- Role policy: `playerticker.experimental.role-evidence-opportunities/v1`, provisional QB 2,
  RB/WR/TE 3 opportunities; no threshold or precedence changes.
- Beta aggregation: `playerticker.controlled-beta.observed-aggregation/v1`, opt-in only.
- Reference ledger version and reference schema identities are recorded in outputs.
- Fixed as-of: `2026-09-22T03:16:45.636Z`; valuation 2026; careers 2017–2025; optional Sleeper
  deliberately unrequested. Participation is planned omission under documented in-season delivery,
  never reclassified after a failed request. All other 13 mandatory coordinates remain mandatory.
- The captured observation-time snapshot includes all Week 1 and partial Week 2. It is **not** a
  closed-week-2 evaluation or a claim that downloaded evidence was known before retrieval.
- Schema/registry/inference/curve identities and capture/reference checksums are retained in
  `frozen-beta-manifest.json`, `private-diagnostics.json`, and `output-checksums.json`.

## What the concrete product establishes

The retained census has 929 roster-observed candidates; 417 selected (QB42/RB113/WR170/TE92),
512 excluded. Candidate presence is separate from admission. The driver preserves the exact
selected canonical identities and positions. One raw-roster TE is a canonical RB, so raw-position
and model-position tallies differ by one; the audit retains both labels. The union of weekly
roster observations is not a current active-roster census.

Every selected player has exactly one terminal outcome, currently reference-blocked. Eligible,
terminal INSUFFICIENT, expired-role holds, unknown-role holds, failed and unsupported outcomes
are each zero **under reference-block precedence**, not estimates of their population prevalence.
Underlying inference produces 365 valued diagnostics and 52 legitimate INSUFFICIENT outcomes;
neither is promoted past the reference hold. Source/inference completeness is separate from
reference/numerical incompleteness. Historical game rows/checksums are preserved.

The ledger establishes 31 games final **known by** capture/as-of, without invented end timestamps.
It preserves 5,491 raw weekly membership observations and their source statuses, without claiming
continuous tenure or treating ACT as positive role evidence. Missing transaction continuity,
current-role authority and post-gap numerical policy are still material gaps. The strict original
v2 reference validator has not been relaxed. New ledger facts are visible diagnostics, not an
eligibility bypass. Unknown role does not mean BACKUP, zero opportunity or zero dynasty value.

M08 is corrected only in the new opt-in aggregation: same-provider/team/game denominator evidence
includes genuine zero-target appearances, rejects conflicting or missing denominators. Fourteen
WR shares materially change; an additional 25 formerly absent WR shares become genuinely observed
zero. This is not fabricated performance. M09 partial-column sums are now withheld in the opt-in
path; complete appearance counts/history stay intact, and separate coverage diagnostics identify
missingness. The retained population has no aggregation holds. This does not prove future
coverage or forecast accuracy. Original production and recorded v1/v2 aggregation remains unchanged.

## Numerical and publication containment

The browser schema accepts only `numericallyEligible:false`, null dynasty value/ranks and
`productionPublicationAuthorized:false`; unexpected engine, confidence, role or diagnostic-value
fields fail validation. A future numerically eligible result makes this first preview driver fail
rather than silently expand its authority. The normal serving exporter cannot consume this shape.
Existing persistence nonpublication and PT-02 durable incomplete-run rejection remain active.
No publication ID/pointer, serving board, canonical ranks or production database is created.

The ordinary board retains canonical values/ranks and now exposes explanations through native
keyboard/touch disclosures. Rejected/INSUFFICIENT model headlines are suppressed and tiers cannot
borrow rejected model output. External market requests, cache results, acquisition and serving
are disabled; deployment copies only board/status. See `CONTROLLED_BETA_MARKET_EXCLUSION.md`.

## Deployment, containment and rollback plan — NOT executed

Do not merge this draft to main: main/master pushes automatically deploy, and inherited model
changes plus current numerical/reference incompleteness are not approved production methodology.
Only feature push/PR CI is authorized here. The two scheduled refresh workflows were manually
disabled in GitHub; CI and Deploy site were not disabled or changed in this integration.

For a **separately authorized future release**: record exact approved code SHA, immutable validated
site-data SHA, last-good board publication ID/timestamp/checksum/bytes, and prior Pages artifact.
Use a fresh build destination; run typecheck/tests/build and PT-09 admission before upload. Never
deploy a boardless shell or this all-unavailable private preview as a replacement valued board.
The fresh artifact must omit `/Fantasy-Market/data/market-latest.json`; do not copy
`market-history.jsonl` or comparison/history exports. Probe those deployed paths and browser requests
after authorized replacement. Old copies/caches and public Git `site-data` history are not erased
by a new build; address their rights/removal separately without rewriting history in this task.

If admission fails, upload nothing and retain last-good. After an authorized deployment regression,
restore a prevalidated last-good **market-free** application artifact with the identical last-good
board identity/bytes; do not roll back to an artifact containing uncleared market data. A Pages
artifact/production rollback requires separate owner authorization. No deployment, deletion or
rollback command has been run here.

Restore a paused workflow only after separate owner approval by opening its exact GitHub Actions
page and choosing **Enable workflow**: `.github/workflows/refresh-board.yml` and
`.github/workflows/refresh-market.yml`. Prior state was active; no run history was removed.
Market refresh must remain paused until public-use rights are resolved. Enabling is not a request
to dispatch a run. Secrets, Pages settings and deployment workflow remain unchanged.

## Owner decision

Recommend **limited private testing of this concrete preview**, not a numerical or public release.
No new role-free formula, admission allowlist, current-role attestation rule, or production
conditional-participation policy is approved by this candidate. The release checklist and
inherited-main reconciliation are in `CONTROLLED_BETA_RELEASE.md`. The next necessary owner
decision is whether to authorize a separately versioned current-role/membership and post-gap
input policy; until that decision is concrete, preserve the numerical holds. Do not retune the
2/3 thresholds or optimize named-player rankings to fill this board.
