# WR UI Vertical Slice — QA Report

Route: `/wr-model` (inside the existing `AppShell`; linked from the desktop top nav as "WR Model").
All outputs come from `evaluateWideReceiver`; no values are hardcoded in components.

## Automated results

- **WR UI tests:** 16 passed (`src/pages/wr/adapter.test.ts` + `src/pages/WrModelPage.test.tsx`).
- **WR engine tests:** 124 passed (unchanged — no formula edits).
- **Full repository:** 229 passed / 0 failed / 0 skipped (22 files).
- **Typecheck:** `tsc -b --noEmit` clean. **Build:** `vite build` success.

## Manual QA matrix (25 combinations, headless Chromium)

Driven live at 1280px; every combination inspected for correct player, correct horizon, correct
projections, confidence, volatility, fallback display, deferral notice, driver counts, and console
errors. `WkEFO`/`ROS` are the model's Weekly / ROS fantasy points (constant across horizons by design
— the horizon changes component emphasis and driver ranking, not the two available projections).

| Fixture | Horizon | Wk EFO | ROS | Confidence | Volatility | Fallback | Deferral notice | +/− drivers |
|---|---|--:|--:|---|---|---|---|---|
| Elite | Weekly | 21.9 | 218.6 | 100.0 HIGH | 13.3 LOW | none | — | 3 / 0 |
| Elite | ROS | 21.9 | 218.6 | 100.0 HIGH | 13.3 LOW | none | — | 3 / 0 |
| Elite | One Year | 21.9 | 218.6 | 100.0 HIGH | 13.3 LOW | none | shown | 3 / 0 |
| Elite | Three Years | 21.9 | 218.6 | 100.0 HIGH | 13.3 LOW | none | shown | 3 / 0 |
| Elite | Dynasty | 21.9 | 218.6 | 100.0 HIGH | 13.3 LOW | none | shown | 3 / 0 |
| Low-route | Weekly | 7.6 | 76.1 | 100.0 HIGH | 41.9 MEDIUM | none | — | 3 / 1 |
| Low-route | ROS | 7.6 | 76.1 | 100.0 HIGH | 41.9 MEDIUM | none | — | 3 / 1 |
| Low-route | One Year | 7.6 | 76.1 | 100.0 HIGH | 41.9 MEDIUM | none | shown | 3 / 1 |
| Low-route | Three Years | 7.6 | 76.1 | 100.0 HIGH | 41.9 MEDIUM | none | shown | 3 / 1 |
| Low-route | Dynasty | 7.6 | 76.1 | 100.0 HIGH | 41.9 MEDIUM | none | shown | 3 / 1 |
| Rookie | Weekly | 6.2 | 61.6 | 63.0 MEDIUM | 62.3 MEDIUM | **yes** | — | 1 / 1 |
| Rookie | ROS | 6.2 | 61.6 | 63.0 MEDIUM | 62.3 MEDIUM | **yes** | — | 3 / 1 |
| Rookie | One Year | 6.2 | 61.6 | 63.0 MEDIUM | 62.3 MEDIUM | **yes** | shown | 3 / 1 |
| Rookie | Three Years | 6.2 | 61.6 | 63.0 MEDIUM | 62.3 MEDIUM | **yes** | shown | 3 / 1 |
| Rookie | Dynasty | 6.2 | 61.6 | 63.0 MEDIUM | 62.3 MEDIUM | **yes** | shown | 3 / 1 |
| Veteran | Weekly | 11.0 | 110.4 | 100.0 HIGH | 33.0 MEDIUM | none | — | 3 / 2 |
| Veteran | ROS | 11.0 | 110.4 | 100.0 HIGH | 33.0 MEDIUM | none | — | 3 / 3 |
| Veteran | One Year | 11.0 | 110.4 | 100.0 HIGH | 33.0 MEDIUM | none | shown | 3 / 3 |
| Veteran | Three Years | 11.0 | 110.4 | 100.0 HIGH | 33.0 MEDIUM | none | shown | 3 / 3 |
| Veteran | Dynasty | 11.0 | 110.4 | 100.0 HIGH | 33.0 MEDIUM | none | shown | 3 / 2 |
| Deep threat | Weekly | 7.7 | 77.5 | 100.0 HIGH | 24.4 LOW | none | — | 3 / 2 |
| Deep threat | ROS | 7.7 | 77.5 | 100.0 HIGH | 24.4 LOW | none | — | 3 / 2 |
| Deep threat | One Year | 7.7 | 77.5 | 100.0 HIGH | 24.4 LOW | none | shown | 3 / 2 |
| Deep threat | Three Years | 7.7 | 77.5 | 100.0 HIGH | 24.4 LOW | none | shown | 3 / 2 |
| Deep threat | Dynasty | 7.7 | 77.5 | 100.0 HIGH | 24.4 LOW | none | shown | 3 / 2 |

Observations:
- Weekly EFO matches the approved engine values exactly (21.9 / 7.6 / 6.2 / 11.0 / 7.7).
- The deferral notice appears on **One Year / Three Years / Dynasty** for every player and never on
  Weekly / ROS; no fabricated long-term fantasy points anywhere.
- The fallback panel appears only for the rookie (RP8 + contract-security), consistent with its
  PARTIAL status; every other fixture shows "No fallback data was required."
- Driver counts change with horizon (e.g. rookie 1/1 at Weekly → 3/1 at longer horizons; veteran 2→3
  negatives), confirming horizon-sensitive explanation weighting.
- Deep-threat volatility is displayed faithfully as **24.4 LOW** — the model result was not altered to
  match a subjective "should be higher" expectation.
- **0 unexpected console errors** across all combinations. (The only console noise is the market app's
  background Sleeper metadata call failing behind the sandbox proxy; it degrades gracefully and is
  unrelated to the WR page.)

## Responsive verification

Horizontal-overflow check (`scrollWidth > clientWidth`):

| Width | /wr-model | /market | /board |
|---|---|---|---|
| 375px | no overflow | — | — |
| 768px | no overflow | no overflow | no overflow |
| 1024px | no overflow | — | — |
| 1280px | no overflow | — | — |

A pre-existing latent header issue (the top-nav + search + format-ribbon cluster overflowed the
viewport at 768–1023px) surfaced when the sixth "WR Model" nav link was added. Fixed at the source:
the header nav now shrinks and scrolls internally (`flex-1 min-w-0 overflow-x-auto`), so **no page
overflows at any width on any route**. Verified the fix also resolved the same overflow on
`/market` and `/board` at 768px.

- **Mobile (375px):** selector scrolls horizontally; projection cards and component bars stack; fallback
  detail wraps; bottom nav present; no hover-only information.
- **Tablet (768px):** projections/components move to two columns; no overflow.
- **Desktop (1280px):** two-column projection + component regions; full nav visible.

## Accessibility verification

- Player selector and horizon selector are `role="tablist"` with roving `tabIndex` and Arrow-key
  navigation (tested: ArrowRight on the elite tab selects Jalen Spark; ArrowRight on Weekly selects
  Rest of Season and sets `aria-selected`).
- Every component score bar carries an accessible label, e.g. *"Availability score: 98.0 out of 100.
  Weight at this horizon 18 percent."* (tested).
- All interactive controls are `<button>` elements with discernible names; visible focus rings come
  from the app's global `:focus-visible` style; no meaning conveyed by color alone (each score bar
  pairs color with a numeric value and an up/neutral/down glyph).
- Confidence and volatility are rendered as two distinct panels with separate definitions; LOW
  confidence is never implied to mean low value.
- Transitions only (tab/selection); the app respects `prefers-reduced-motion` globally.

## Unresolved issues

None blocking. Known non-issue: the market app's Sleeper metadata fetch logs a benign network error in
this sandbox (no outbound access); it is out of scope for this slice and already degrades gracefully.

## Verdict

**PASS — WR UI VERTICAL SLICE COMPLETE.**
