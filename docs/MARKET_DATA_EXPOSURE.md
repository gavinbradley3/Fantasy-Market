# External market data: public exposure assessment

Assessed 2026-11-12 for PR #11. Scope: DynastyProcess `values.csv` quotes (FantasyPros-derived)
whose redistribution rights are unresolved. Nothing here rewrites history or deletes anything
beyond the one authorised removal noted below.

## What was done

| Action | Where | State |
|---|---|---|
| Removed `market-latest.json` and `market-history.jsonl` from the branch tip | `site-data` commit `b3a68bb` | Done (owner-authorised). Did not trigger a deploy. |
| Export writes no market file while `EXTERNAL_MARKET_ENABLED = false` | `scripts/export-site-data.ts` | PR #11 |
| `refresh-market.yml` refuses to run while the flag is off | `.github/workflows/refresh-market.yml` (also still disabled in Actions) | PR #11 |
| Deploy copies only `board.json` and `status.json`, then asserts no market marker anywhere in the build | `scripts/prepare-site-data.ts`, `scripts/assert-public-data.ts`, `deploy.yml` | PR #11 |
| Real quote values in test fixtures and docs replaced with synthetic values | `src/market/dynastyProcess.test.ts` and 8 other files | PR #11 (forward only) |

## Remaining exposure

| Location | What | Since | Removable without history rewrite? |
|---|---|---|---|
| **Live GitHub Pages site** | `/Fantasy-Market/data/market-latest.json` (513 quotes, captured 2026-09-21) | Deployed by `Refresh market snapshot` run 35602825385, job `deploy / deploy`, 2026-09-21. No deploy has run since. | **Yes, by a redeploy.** Not done: deploying requires your approval. Not directly verified: `github.io` is blocked from the build environment. |
| `site-data` history | `5ca226d` (2026-09-14: both files, first capture) and `a0d3d8d` (2026-09-21: both files) | Sep 14 | No. Reachable by commit SHA and through GitHub's history views. |
| `main` history and every branch cut from it | About 5 sample quote rows in `src/market/dynastyProcess.test.ts` and Josh Allen's value repeated in several test files and `docs/FRONTEND_API_CONTRACT.md` | `084cbab`, 2026-09-12 | No. Replaced going forward only. |
| Pages artifacts from the Sep 14 and Sep 21 deploys | Contained `market-latest.json` | — | Already gone: the runs list 0 artifacts (expired). |
| Actions logs | Market runs print counts and dates, not quote values | — | Nothing to remove found. |
| Commit messages, PR bodies, audit docs | Aggregate comparisons only (correlations, coverage counts), no quote values found | — | — |
| Forks and third-party mirrors | Unknown: fork count was not checked | — | Outside our control. |

## Remediation options for historical exposure (not executed)

1. **Redeploy Pages from a clean build (recommended first).** Merging PR #11, or manually dispatching `Deploy site` once PR #11 is on `main`, replaces the live artifact with one that passes `assert:public-data`. This removes the only exposure an ordinary visitor reaches. It needs your deploy approval. It is reversible.
2. **Ask the rights holders.** Written permission from DynastyProcess and FantasyPros would resolve every row of the table above. A removal request would tell us which of options 3–5 is actually required.
3. **Rewrite `site-data` history.** Recreate the branch from a clean orphan commit holding only `board.json` and `status.json`, then force-push. The old commits stay reachable by SHA until GitHub garbage-collects them; a GitHub Support request is needed to purge cached views. Destructive: it breaks any clone or worktree of `site-data`.
4. **Rewrite `main` history** to scrub the fixture values. Disruptive out of proportion to roughly five sample rows: every branch and open PR (#2–#12) would need rebasing. Recommend only if a rights holder asks.
5. **Make the repository private.** Ends public access to all of the above at once. On a free plan this also takes GitHub Pages offline.

Recommendation: 1 when you approve a deploy, then 2. Hold 3–5 unless a rights holder asks for removal.
