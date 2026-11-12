# Phase 0 release checklist (PR #11)

Release = merge PR #11 to `main`. That push runs `Deploy site` automatically: build, then the data gate, then `assert:public-data`, then Pages deploy, then live verification. **Do not merge without the owner's authorisation.**

## Before merging

| # | Check | How | Status at 2026-11-12 |
|---|---|---|---|
| 1 | CI green on the PR head and merge ref | `CI / verify` | Green |
| 2 | Deployment preview green; only `board.json` and `status.json` in `dist/data`; no market marker in the build | `Deployment preview` job and its artifact | Green (`site-data@b3a68bb`) |
| 3 | `site-data` tip holds no market files | `git ls-tree origin/site-data` lists `.gitkeep`, `board.json`, `status.json` | Done (`b3a68bb`) |
| 4 | Market refresh cannot publish quotes | `refresh-market.yml` is disabled in Actions **and** refuses while `EXTERNAL_MARKET_ENABLED = false` | Done |
| 5 | Board refresh stays disabled | Actions → Refresh board shows "disabled manually" | Disabled; merging does not change workflow enablement |
| 6 | Dependency fixes decided | PR #13 (non-breaking lockfile fixes) merged first, or explicitly deferred | Owner decision |
| 7 | The owner accepts publishing the September board, labelled "Published Sep 12, 2026 · N days ago" with an out-of-date warning | Owner decision | Pending |

## Merge order

1. **PR #13** (lockfile only), if approved. Merging deploys the current `main` UI with the current `site-data`, which is market-free since `b3a68bb`.
2. **PR #11.** Deploys the truthful UI. Live verification runs automatically.
3. **PR #12** later, code only (see below). It contains no UI change. Its merge also triggers a deploy that rebuilds the same site from the same `site-data`, so the board is unchanged.

## After merging: automatic verification

The `verify` job in `deploy.yml` checks the live site from GitHub Actions, retrying for up to 12 minutes while the Pages cache refreshes:

- the app shell loads, and the `/board` deep link is answered by the app;
- `/data/board.json` is valid, has entries, and carries no confidence, volatility or honesty values;
- `/data/status.json` loads;
- **`/data/market-latest.json` and `/data/market-history.jsonl` return 404**;
- the deployed JavaScript contains no external-market marker.

The release is verified when the `Deploy site` run for the merge commit is green including `verify`. The same check can be run by hand from any machine with network access:

```bash
npm run verify:deployment -- --url https://gavinbradley3.github.io/Fantasy-Market/
```

## Manual spot checks after release

- [ ] `/board` on desktop and mobile shows "Published Sep 12, 2026 · … days ago" and the out-of-date warning.
- [ ] `/`, `/market`, `/watchlist`, `/portfolio`, `/player/JMC` all land on `/board`.
- [ ] No confidence column; Basis column reads "QB engine, partial inputs", "Box-score model" or "Not valued".
- [ ] Methodology and Legal describe the real board and credit nflverse.

## Rollback

- **UI problem:** revert the merge commit on `main`. The push redeploys the previous UI.
  - Caution: the previous UI's deploy step copies `market-latest.json` only if it exists on `site-data`, and it no longer does. So a rollback does not re-expose quotes.
- **Data problem:** none is possible from this PR. It does not change `site-data`.

## PR #12: code-only merge conditions

- It changes no UI, no `site-data`, no workflow enablement and no production board.
- `refresh-board.yml` stays disabled. Its new guard needs an owner-approved valuation checksum before any production publish, and none has been given.
- `refresh-staging.yml` gains a `pull_request` trigger. After merge it can write only to `site-data-staging`.
- The staged checksum stays unapproved. Approval is a dispatch input, not a file in the repository.
