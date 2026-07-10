# WR UI Integration Plan

A single polished WR player-analysis vertical slice inside the existing PlayerTicker app, driven by
the completed `evaluateWideReceiver` engine and the five fictional fixtures. No formula changes, no
live data, no market-price layer, no long-term fantasy-point fabrication.

## Route / entry point

- **Route:** `/wr-model`, added to `src/app/App.tsx` inside the existing `<AppShell>`.
- **Nav:** a "WR Model" link added to `AppShell` desktop nav (mobile bottom nav is full at 5 items,
  so the WR page is reachable from desktop nav + a landing/methodology link; on mobile it is
  reachable by URL and an on-page context — the bottom nav stays as-is to avoid crowding).
- The global `DataModeBanner` ("Demo Market — simulated…") already renders in `AppShell`, reinforcing
  demo context; the WR page adds its own WR-specific disclosure (§7.1).

## Components to reuse (existing design system)

- Tokens (`tailwind.config.js`): `bg-base/surface/elevated`, `border-subtle`, `up/down/secondary/
  warning`, `text-primary/secondary/muted`, `font-display/body/mono`, `rounded-card/control`,
  `shadow-elevated`.
- `PlayerAvatar` (initials, neutral gradient — no images), `Tooltip`/`ExplainDot`,
  `EmptyState`/`ErrorState`/`LoadingSkeleton` (`components/states`), `Footer`, `ValueDisclaimer`,
  `cn` (`lib/ui`). Confidence/volatility get their own WR badges (the market `ConfidencePill` copy is
  market-specific, so WR badges are new but reuse the same pill styling).

## New components (all under `src/pages/wr/` + `src/pages/WrModelPage.tsx`)

- `WrModelPage` — route container, owns selected fixture + horizon state, runs the engine via
  `useMemo`, renders sections in the §7 order, and provides an error boundary fallback.
- `PlayerSelector` — segmented/scrollable cards (name, archetype, age, team, model Weekly EFO).
- `PlayerSummaryHeader` — identity + confidence/volatility badges + model version + timestamp.
- `ProjectionCards` — Weekly + ROS cards (fantasy points strongest; supporting stats secondary).
- `HorizonSelector` — 5 keyboard-accessible tabs (radiogroup semantics).
- `ComponentProfile` — 8 horizontal score bars with label/full-name/description/weight emphasis and
  a 50 reference marker; never color-only.
- `DriverList` — supporting / limiting factors, each linked to its component chip where mappable.
- `ConfidenceVolatilityPanel` — two distinct panels with definitions + penalty list.
- `FallbackPanel` — restrained warning list, or an explicit "no fallback required".
- `ModelTransparencyFooter` — schema/model/reference versions + timestamp + limitations.

## Data flow (one-way, §12)

```
fixtureRegistry (typed WRMVPInput[])
  → selected fixture input (never mutated)
  → evaluateWideReceiver(input, { selected_horizon })   // public API only
  → WRMVPOutput
  → wrViewModel(output, horizon)  (presentation adapter: labels, formatting,
      component descriptions, horizon names, driver→component mapping, fallback sentences)
  → section components (pure render)
```

The adapter (`src/pages/wr/adapter.ts`) holds **display copy only** — component descriptions, horizon
display names, and a driver-sentence → component lookup that mirrors the engine's explanation
templates (copy, not formula). A test asserts every engine-produced driver maps to a known component
so the copy can't silently drift. React components never call formula modules or recompute anything.

## Page hierarchy (§7 order)

1. Demo disclosure → 2. Player selector → 3. Summary header → 4. Weekly + ROS projection cards →
5. Horizon selector → 6. Eight components → 7. Supporting/Limiting drivers →
8. Confidence + Volatility → 9. Fallback panel → 10. Transparency footer.

Visual hierarchy: player identity > Weekly points > ROS > horizon > components > explanations >
confidence/volatility/fallback.

## Horizon handling

`selected_horizon` is passed to the engine (drives explanation weighting) and to the adapter (drives
component emphasis + wording). Weekly/ROS show real projection cards. One-Year/Three-Year/Dynasty
show the deferred-output notice verbatim and summarize the component profile only — no fabricated
points. The internal composite is shown only as a small, clearly-labeled "horizon profile (internal
diagnostic)" secondary figure, never as price/value/rating.

## Desktop / tablet / mobile

- **Desktop (≥1024px):** two-column region for projections + components; selector as a card row.
- **Tablet (768px):** projection cards may stack; component grid single column of bars.
- **Mobile (375px):** everything stacks; selector horizontally scrollable; horizon tabs horizontally
  scrollable; ≥44px targets; no hover-only info; no horizontal page overflow.

## Testing strategy

Vitest + Testing Library (jsdom), matching the repo. Groups: data integration (all 5 evaluate; Weekly
EFO from engine, not hardcoded; selector switches output), projection assertions (elite/rookie/
veteran/deep-threat per §14.2), horizon behavior (5 controls; drivers re-rank; deferred notice; no
long-term points), adapter driver-mapping guard, and accessibility (keyboard selector/horizon, focus,
accessible score labels, button names). Regression: `npm test`, `npm run typecheck`, `npm run build`.

## Accessibility

Semantic headings; selector + horizon as keyboard-operable tab/radio groups with visible focus;
score bars carry `aria-label` like "Target Earning score: 84.3 out of 100"; no color-only meaning
(labels/icons everywhere); reduced-motion respected (transitions only); timestamps/percentages
formatted for readers.

## Out of scope (not built)

Live APIs, real players, auth, DB, persisted settings, market/intrinsic price, over/under/fair
valuation, trade calculator, roster import, NFL-wide search, RB/TE/QB models, AI explanations, Monte
Carlo/historical charts, deployment changes, and any formula change for cosmetics.

## Integration risks

1. **Driver→component linking** — engine returns plain strings; mitigated by a mirrored copy lookup +
   a drift-guard test (falls back to no chip if unmapped).
2. **JSON fixture import in-browser** — handled by Vite `resolveJsonModule` (already enabled); the app
   registry imports the JSON directly (the fs-based `testutil` stays node-only).
3. **Composite mislabeling risk** — mitigated by never using price/value/rating words; composite shown
   only as a labeled internal diagnostic.
