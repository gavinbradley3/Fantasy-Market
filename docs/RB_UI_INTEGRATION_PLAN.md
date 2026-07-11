# RB UI Integration Plan

Integrate the completed, deterministic **RB MVP engine** (`src/rb-model/`, `evaluateRunningBack`)
into the existing model-analysis experience so that one polished page serves **both** Wide
Receivers and Running Backs. No formula changes, no live data, no market layer, no long-term
fantasy-point fabrication. UI integration only.

Engine baselines consumed unchanged:
- WR engine `bb09c34` — `evaluateWideReceiver`.
- WR UI `e12264a` — `/wr-model`.
- RB engine `17d52f4` — `evaluateRunningBack` (146 RB / 124 WR / 375 repo tests, 0 failures).

## 1. Current WR UI architecture

- **Route:** `/wr-model` → `WrModelPage.tsx`, rendered inside the shared `AppShell`. Desktop nav
  has a `WR Model` link. The global `DataModeBanner` already reinforces demo context.
- **Page (`src/pages/WrModelPage.tsx`):** holds `fixtureId` + `horizon` state, evaluates the
  selected fixture defensively (`evaluate()` never throws to render), pre-computes Weekly EFO for
  every fixture, then renders a fixed vertical section order.
- **WR-specific modules (`src/pages/wr/`):**
  - `registry.ts` — typed list of the 5 WR fixtures (id + archetype + `WRMVPInput`), default id,
    `getFixture`.
  - `adapter.ts` — display copy/formatting only: `COMPONENT_ORDER`/`COMPONENT_META`, `HORIZONS`
    metadata, `emphasizedComponents`/`componentWeight` (from `HORIZON_WEIGHTS`),
    `DRIVER_TO_COMPONENT` (engine sentence → component, guarded by `adapter.test.ts`),
    `fallbackSentence`, confidence/volatility definitions + tone maps, formatters.
  - `ui.tsx` — presentation primitives: `SectionCard`, `StatCell`, `WrBadge`, `ScoreBar`
    (0–100 bar with a 50 reference marker + non-color-only glyph + accessible label).
  - `sections.tsx` — `DemoDisclosure`, `PlayerSummaryHeader`, `ProjectionCards`, `HorizonSelector`,
    `HorizonContext`, `DriverSections`, `ConfidenceVolatilityPanel`, `FallbackPanel`,
    `ModelTransparencyFooter`.
  - `ComponentProfile.tsx`, `PlayerSelector.tsx` — the eight score bars and the roving
    keyboard card selector.
- **Tests:** `src/pages/WrModelPage.test.tsx` (13) + `src/pages/wr/adapter.test.ts` (3).
- **Responsive/accessible today:** roving-arrow tablists for the player and horizon selectors,
  `aria-selected`, `role="img"` accessible labels on score bars, horizontally-scrollable rails,
  no color-only meaning, `max-w-5xl` shell.

Nearly every primitive (`SectionCard`, `StatCell`, badge, `ScoreBar`) and every section shell
(`HorizonSelector`, `HorizonContext`, `DriverSections`, confidence/volatility, fallback,
transparency) is already **position-agnostic in behavior** — only the *copy* and the
*projection stat cards* are WR-specific.

## 2. Proposed shared architecture

A **shared model-page shell** + **shared sections** driven by two position **presentation
adapters** that each produce (a) one shared view model and (b) one position-specific projection
section. Exactly one place in the app switches on position (a module registry lookup); no shared
component contains a `position === …` branch.

```
position selector
  → position module registry            src/pages/player-model/registry.ts
    → position fixture registry          src/pages/{wr,rb}/registry.ts
      → selected fixture input
        → public engine                  evaluate{WideReceiver,RunningBack}
          → position presentation adapter src/pages/{wr,rb}/view.ts + adapter.ts
            → shared view model           SharedPlayerModelView
              → shared model-page shell   src/pages/player-model/PlayerModelPage.tsx
                → shared sections          src/pages/player-model/sections.tsx
              → position projection node   src/pages/{wr,rb}/*Projection.tsx
```

Typed discriminated union at the boundary:
```ts
type SupportedPosition = 'WR' | 'RB';
```
Shared fields live on `SharedPlayerModelView`; the volatile, position-shaped projection payload is
never merged into it — each module renders its own projection `ReactNode`, so there is no
"every-field-nullable" soup.

## 3. Files to reuse (as-is)

- Engines and fixtures: all of `src/wr-model/`, `src/rb-model/` (never edited).
- `src/pages/wr/registry.ts`, `src/pages/wr/adapter.ts` (+ `adapter.test.ts`) — kept intact so the
  WR adapter guard test keeps passing.
- `PlayerAvatar` (`components/market/primitives`), `Tooltip` (`components/ui/Tooltip`), design
  tokens in `tailwind.config.js`, `DataModeBanner`.

## 4. Files to refactor

- `src/pages/wr/ui.tsx` primitives → moved/generalized into `src/pages/player-model/ui.tsx`
  (`SectionCard`, `StatCell`, `Badge`, `ScoreBar`). The `ScoreBar` accessible-label format is kept
  byte-identical so existing WR label assertions still pass.
- `src/pages/WrModelPage.tsx` → thin wrapper that renders the shared `PlayerModelPage` with
  `defaultPosition="WR"` (preserves the `/wr-model` route and the direct-render test).
- WR sections/selector/component-profile behavior → absorbed by the shared sections; WR keeps only
  its projection section (`WrProjection.tsx`) and a `buildWrView` adapter (`view.ts`).
- `src/app/App.tsx`, `src/components/chrome/AppShell.tsx` → add `/player-model`, keep `/wr-model`,
  relabel nav to `Player Model`.

## 5. Files to add

- `src/pages/player-model/`: `types.ts`, `ui.tsx`, `PositionSelector.tsx`, `PlayerSelector.tsx`,
  `sections.tsx`, `registry.ts`, `PlayerModelPage.tsx`.
- `src/pages/wr/`: `view.ts` (`buildWrView`), `WrProjection.tsx`.
- `src/pages/rb/`: `registry.ts`, `adapter.ts` (+ `adapter.test.ts`), `view.ts`, `RbProjection.tsx`.
- Tests: extend `WrModelPage.test.tsx`; add `src/pages/PlayerModelPage.test.tsx`.
- Docs: this plan + `docs/RB_UI_QA_REPORT.md`.

## 6. Route strategy

**Option A (chosen): shared route.** `/player-model?position=WR|RB`. Position is reflected in the
query string so a position is bookmarkable/shareable. `/wr-model` is preserved as an alias that
renders the same shell defaulting to WR (backward compatible; the existing test renders
`WrModelPage` directly). Nav label becomes position-neutral: **Player Model**.

## 7. Position selector behavior

Compact segmented control near the top (after the disclosure, before the player selector). Two
options, full accessible names `Wide Receiver` / `Running Back`. Keyboard operable
(roving arrow keys + Enter/Space), visible selected state (`aria-checked`), no TE/QB controls. On
switch: select that position's default player, **preserve the current horizon** (all five exist for
both positions), and reset the fixture safely if an id is not valid for the new position. A concise
note states component scores are position-specific and must not be compared across WR and RB.

## 8. WR regression risks & mitigations

- **Direct-render test** imports `WrModelPage` default export → kept as a wrapper around the shared
  page defaulting to WR.
- **Exact-string assertions** (`100.0 · HIGH`, `No fallback data was required`, `63.0 · MEDIUM`,
  score labels, deferral notice text, tablist name `select a wr profile`) → all preserved; WR copy
  and the WR `ScoreBar` label format are unchanged.
- **WR values** come only from `evaluateWideReceiver` — never hardcoded, never re-derived.
- **`adapter.test.ts`** guard → `wr/adapter.ts` exports unchanged.

## 9. RB-specific UI requirements

- Eight RB components (WRK, OQ, RE, RU, TC, RD, AD, AV) with §14 descriptions, reusing the WR
  horizontal-bar treatment (no gauges, never color-only).
- Position-specific projection section: primary Weekly card (expected fantasy points, probability
  active, workload ramp, **UI-derived** expected total opportunities = carries + targets), a rushing
  section, a receiving section, and an ROS card with the ramp-recovery note (shown only when
  ramp < 1). A conditional-stat disclosure explains that weekly football stats are conditional on
  the player being active while expected fantasy points already fold in inactivity probability.
- RB role-dependence/context row: TD dependence, receiving dependence, competition pressure (model
  input), QB rush pressure (model input) — restrained treatment, labeled as model inputs.
- Explanations, confidence, volatility (with TD/receiving dependence), fallbacks, and transparency
  reuse the shared sections with RB copy. Engine output is shown faithfully (e.g. the committee
  fixture's LOW volatility and the injury-return fixture's absence of a direct availability driver
  are **not** "corrected").
- Selector shows the 7 core archetypes prominently; the 4 remaining scenarios (out, missing-data,
  both mobile-QB) live under a secondary **Test scenarios** group so the main selector stays clean.

## 10. Responsive behavior

`max-w-5xl` shell. Position selector always obvious; player rails and horizon rail scroll
horizontally on narrow screens; rushing/receiving sections stack at ≤768px and sit side-by-side on
desktop; component bars use a 1-col→2-col grid; fallback rows wrap; ≈44px touch targets; no
page-level horizontal overflow at 375/768/1024/1280; no hover-only information.

## 11. Accessibility strategy

Semantic headings (player name `h1`, section titles `h2`); position/player/horizon selectors are
keyboard-operable with correct `aria-selected`/`aria-checked`; visible focus rings; score bars carry
accessible `X.X out of 100` names; probability/ramp announced as percentages; no color-only
distinctions; reduced-motion respected (transitions only); readable status/warning text.

## 12. Testing strategy

- Keep all engine tests untouched. Keep `wr/adapter.test.ts`; add `rb/adapter.test.ts` guard.
- Extend `WrModelPage.test.tsx` for WR regression through the shared shell.
- Add `PlayerModelPage.test.tsx`: all 7 primary RB fixtures render; edge fixtures reachable; values
  come from `evaluateRunningBack` (compared against the engine, not constants); RB component labels;
  RB Weekly/ROS; fallback display; per-fixture projection assertions (§25.3); position switching
  (§25.4); long-term deferral for both positions (§25.5); accessibility (§25.6).
- Run: `npx vitest run src/rb-model`, `… src/wr-model`, `… src/pages`, `npm test`,
  `npm run typecheck`, `npm run build`.

## 13. Out of scope (explicit)

Live NFL data; production data adapters; databases; auth; market price; trade value; ADP;
over/undervalued labels; roster imports; real-player search; RB-vs-WR rankings; TE/QB support;
One-Year / Three-Year / Dynasty fantasy-point projections; AI-generated explanations; historical
charts; any formula tuning; unrelated deployment changes.
