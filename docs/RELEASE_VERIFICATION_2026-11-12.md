# Release verification: PR #11 and PR #13

2026-11-12, merged with owner authorisation. Production refresh workflows untouched.

## Sequence

| Step | Time (UTC) | Result |
|---|---|---|
| Live site before merge | 20:47 | `/data/market-latest.json` **200, 188,076 bytes** of DynastyProcess quotes |
| Local check of `main` + #11 + #13 | 20:48 | Typecheck pass, 2,260 tests pass, build pass. Deploy data gate: 615 entries admitted, 2,522 uncalibrated values redacted, only `board.json` and `status.json` |
| Local render (Pages-style server, deploy base path) | 20:50 | Stale-board warning shown. `/`, `/market`, `/player/:id`, `/portfolio` redirect to `/board`. No market or buy/sell text. Only `board.json` requested |
| #11 squash-merged as `4a733bf` | 20:52 | CI from 16:27 on an unchanged base: verify (push and PR ref) and preview green |
| Deploy run 43304553809 | 20:52–20:53 | Success, including the workflow's own post-deploy verification |
| Live check after #11 | 20:54 | `market-latest.json` **404**. No vendor marker in any served file. Confidence and volatility values all null. Stale warning rendered: "This board is out of date…". Simulated routes redirect to `/board` |
| #13 branch updated onto `4a733bf` | 20:56 | **Fresh** CI on the merged state: verify on push, verify on PR ref, preview data gate, all green |
| #13 squash-merged as `3e06f6d` | 20:58 | |
| Deploy run 43305620222 | 20:58–20:59 | Success |
| Live check after #13 | 21:03 | Files last modified 20:59:30. Same results as after #11 |

Live checks ran from the build environment through the newly allowed host
`gavinbradley3.github.io` (personal environment "Fantasy-Market"), with cache-busting query
strings, in Chromium at 1280×900.

## State after release

- **Workflows:** `Refresh board` and `Refresh market snapshot` remain `disabled_manually`.
  `Refresh staging board` is listed active, but its file exists only on the unmerged PR #12
  branch, and GitHub runs schedules only from the default branch.
- **Board:** still the September 12 board, now shown as "Published Sep 12, 2026 · 60 days ago"
  with the out-of-date warning.
- **`status.json`** still carries `"state": "current", "ageHours": 0` as written at publish time.
  The site ignores those fields and computes age from `publishedAt`. Anyone reading the raw
  file directly sees the stale claim. Fixing it needs a republish of `site-data`, which nobody
  has authorised.
- **Market quotes** are gone from the live site and the `site-data` branch head. They remain in
  `site-data` history (`5ca226d`, `a0d3d8d`) and in a few test fixtures in `main` history. See
  `docs/MARKET_DATA_EXPOSURE.md` for the options; none was taken.
- **`npm audit`:** 9 findings remain, all needing major upgrades (`docs/SECURITY_AUDIT_2026-11.md`).
- **Not checked:** CDN behaviour from other regions, and Pages routing for paths not listed above.
