# Controlled-beta external-market exclusion

The release policy is `MARKET_DATA_DISABLED = true` in `src/config/release.ts`. No environment
setting enables it. PlayerTicker's independent valuations remain separate and unchanged by
this policy. Public rights to FantasyPros-derived DynastyProcess data remain unresolved;
this exclusion is not a legal-clearance claim.

## Enforced boundaries

- `ingest:market` rejects before network or database access, including `--dry-run`.
- `GET /market` returns `410 / MARKET_DATA_DISABLED` without reading retained snapshots.
- Static and API browser sources expose no market path; both browser readers and the hook
  block explicit legacy paths and cached market results.
- `export:site-data` writes only the board and status. `--dataset all` has the same meaning;
  `--dataset market` rejects before touching output. Retained private history is not erased.
- `prepare:site-data` retains PT-09 board admission and exact board bytes, copies only
  `board.json` and optional `status.json`, and rejects a destination containing any other
  artifact before overwriting the board. A fresh destination is required; it never deletes
  data to pass validation.
- The Vite build rejects market/history/comparison files in `public/`, symlinks, or
  non-allowlisted files under public/output `data/`. The UI removes external comparison reads
  and disables Market Edge.

The pure adapters, comparison tests, private storage and history seeding remain available for
retained development history. They are not serving/export authority. The old public API and
scheduled export behavior must not be used as evidence of redistribution clearance.

## Targets for the separately authorized deployment

The existing deploy workflow previously copied `site-data:market-latest.json` to
`dist/data/market-latest.json`, served as `<deployed-base>/data/market-latest.json` (for the
repository project site, `/Fantasy-Market/data/market-latest.json`). A future authorized
deployment must replace that Pages artifact with a fresh build lacking this file and verify
the old URL no longer serves quotes. Do not copy the site-data checkout recursively.

`site-data:market-history.jsonl` is retained history and the existing deployment intentionally
did not copy it. Do not delete it as part of this candidate. Verify that
`<deployed-base>/data/market-history.jsonl` and any historical comparison exports are not
available; no separate comparison filename is produced by the inspected exporter. If another
deployment previously published one, inventory that exact target before removal.

The `site-data` Git branch itself may be public and contain retained data. Moving/removing those
repository-hosted copies and resolving public-history access requires a separately approved
operation; this candidate neither rewrites Git history nor claims those copies have vanished.
No new-build exclusion erases previously downloaded files or settles upstream licensing.

Workflow pause status and restoration commands are recorded in the integrated handoff. No
workflow, production artifact or serving-data removal is performed by these changes.
