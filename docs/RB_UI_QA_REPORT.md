# RB UI Vertical Slice — QA Report

Shared, position-flexible **Player Model** experience over the completed WR and RB engines.
Route: `/player-model?position=WR|RB` (nav label **Player Model**); `/wr-model` preserved as a
WR-defaulting alias. All outputs come from `evaluateWideReceiver` / `evaluateRunningBack`; no values
are hardcoded in components.

## Automated results

- **RB engine:** 146 passed (`npx vitest run src/rb-model`).
- **WR engine:** 124 passed, unchanged (`npx vitest run src/wr-model`).
- **UI (pages):** 42 passed (`npx vitest run src/pages`) — WR regression (13) + WR adapter guard (3)
  + RB adapter guard (3) + RB/switching/long-term/a11y integration (23).
- **Full repository:** 401 passed / 0 failed / 0 skipped (38 files) — `npm test`.
- **Typecheck:** `npm run typecheck` (`tsc -b --noEmit`) clean.
- **Build:** `npm run build` (`tsc -b && vite build`) success.

No engine test was deleted, weakened, or rewritten. No WR or RB formula was touched.

## Visual QA (headless Chromium)

Browser tooling **was** available: the pre-installed Chromium `headless_shell`
(`/opt/pw-browsers`) was driven against the production build served by `vite preview`, using its
native `--screenshot` flag. No browser framework was added (per scope). Screenshots were inspected
for correct position, correct player, correct projection numbers (matched to the engine),
confidence/volatility, fallback display, metadata, and layout overflow.

| View | Width | Result |
|------|-------|--------|
| RB — elite bell cow (default) | 1280 | All sections render; Weekly 26.5, ramp 100%, TD dep 40%, rushing/receiving side-by-side, role-dependence row, metadata complete. No overflow. |
| RB — elite bell cow | 768 | Rushing/receiving remain side-by-side; weekly card wraps cleanly; player rails scroll. No overflow. |
| RB — elite bell cow | 375 | Position selector obvious; player rails scroll horizontally; weekly stats stack to one column; header chips wrap. No page-level horizontal overflow. |
| WR — Marcus Crown (default) | 1280 | `/wr-model` renders the shared shell in WR mode: receiving-only cards (Routes 36.7 / Targets 10.4 / Rec 7.2 / Rec yds 103.9 / Rec TD 0.8), WR component labels, Weekly 21.9, composite 83.7. Unchanged behavior. |

The remaining combinations (every RB fixture × every horizon, plus 1024px) were exercised through
the JSDOM integration tests rather than pixel screenshots. Fixture/horizon selection is client
state (not URL-encoded), so static screenshots capture defaults only; the interactive matrix is
covered by `PlayerModelPage.test.tsx`, which drives the real components and asserts engine-matched
values. No console errors were observed in the rendered pages.

## Fixture verification (from `evaluateRunningBack`, WEEKLY unless noted)

| Fixture | Weekly EFO | ROS EFO | Confidence | Volatility | Status | Fallbacks |
|---------|-----------:|--------:|-----------|-----------|--------|----------:|
| elite bell cow | 26.5 | 265.0 | HIGH | LOW | OK | 0 |
| goal-line specialist | 4.3 | 43.5 | HIGH | MEDIUM | OK | 0 |
| receiving specialist | 12.7 | 126.5 | HIGH | LOW | OK | 0 |
| committee back | 9.9 | 98.7 | HIGH | **LOW** | OK | 0 |
| explosive rookie | 7.9 | 79.4 | MEDIUM | MEDIUM | PARTIAL | 2 |
| aging veteran | 18.7 | 186.8 | HIGH | LOW | OK | 0 |
| injury-return | 7.8 | 103.8 | HIGH | LOW | OK | 0 |
| out player | 0.0 | 0.0 | HIGH | LOW | PARTIAL | 1 |
| missing-data | 4.9 | 59.1 | LOW | MEDIUM | PARTIAL | 21 |
| mobile-QB low pressure | 16.2 | 162.3 | HIGH | LOW | OK | 0 |
| mobile-QB high pressure | 13.7 | 137.1 | HIGH | LOW | OK | 0 |

Model-integrity checks displayed faithfully (not "corrected" in the UI):
- **Committee back** shows the engine's **LOW** volatility.
- **Injury-return** shows workload ramp **72%** and the ROS recovery note; the UI does not invent a
  direct availability explanation the engine did not return.
- **Mobile-QB high pressure** shows lower carries, rushing TDs, Team Context, and Weekly EFO than
  the low-pressure profile.
- **Missing-data** renders all 21 fallbacks (scroll-contained) with no `null`/`NaN`/`undefined`
  text; confidence LOW; status PARTIAL.
- **Out player** shows Weekly/ROS EFO 0 and an "Out" availability chip.

## Checks performed per the §26 checklist

Correct position ✓ · correct player ✓ · correct horizon ✓ · no stale data on switch ✓ · no overflow
(375/768/1280) ✓ · no missing labels ✓ · no fabricated long-term points (deferral notice on 1Y/3Y/
Dynasty) ✓ · correct confidence ✓ · correct volatility ✓ · correct fallback panel ✓ · complete
metadata (schema/model/reference/as-of/status/position) ✓ · no console errors ✓ · no broken WR
behavior ✓.

## Honest limitations

- 1024px and the full fixture×horizon pixel matrix were verified via component tests, not
  screenshots (see note above) — layout there is the same responsive grid proven at 375/768/1280.
- No automated axe/lighthouse a11y scanner is configured in this repo; accessibility was verified
  through role/label/keyboard assertions in the integration tests and manual inspection (semantic
  headings, `aria-selected`/`aria-checked`, roving arrow keys, non-color-only score bars,
  `X.X out of 100` labels). Adding a scanner was out of scope.
