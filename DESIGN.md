# PlayerTicker — DESIGN.md

**Version:** 1.0 · **Date:** July 9, 2026 · **Status:** Implementation-ready planning document. Do not treat any data reference in this document as live or connected.

---

## 1. Product Name and One-Sentence Pitch

**PlayerTicker** — a fantasy football market terminal that tracks player value like a stock ticker, so managers can spot risers, fallers, buy-low windows, and overheated assets before their league reacts.

### Naming rationale

`PlayerTicker` wins because it communicates the entire concept (players + market movement) in one compound word, is brandable, works across redraft/dynasty/best ball, and does not sound like a sportsbook. Domain-style handle: `playerticker.app` or `playerticker.io`.

Alternatives considered (keep on file, do not use unless PlayerTicker fails a trademark/domain check):

| Name | Verdict |
|---|---|
| Dynasty Exchange | Too narrow — excludes redraft |
| Fantasy Market | Generic, poor SEO, unownable |
| Roster Exchange | Sounds like a trade platform, invites wrong expectations |
| MarketShare Fantasy | Clunky |
| The Board | Strong internal shorthand for the market board page; too vague as a brand |
| Asset Board | Cold, B2B energy |
| Stock Up Fantasy | Corny |
| ValueChart | Describes one feature, not the product |

**Decision:** PlayerTicker. "The Board" is reserved as the in-product name for the Player Market Board page.

---

## 2. Executive Summary

PlayerTicker is a mobile-first, dark-mode web application that presents fantasy football players as market assets. Every player has a ticker, a fictional 0–100 market price, movement history, a volatility score, a risk profile, a buy/hold/sell signal with confidence, a mispricing score, and written catalysts that explain *why* value moved.

The MVP is a polished, explorable market terminal running on a clearly labeled **Demo Market**: a deterministic, seeded mock-data engine that simulates daily value movement for 80–150 fantasy-relevant players. No login is required to experience the core product. The architecture is designed so that mock data can later be swapped for approved real sources (Sleeper API, nflverse-style datasets, licensed providers) behind a single data-service abstraction without rewriting the UI.

**What the MVP is:** Landing page, Market Dashboard, Player Market Board, Player Stock Card, Watchlist (local storage), Methodology page, full market system (price, movement, signals, mispricing, volatility, catalysts, thesis), search/filter/sort, and a mock-data engine honest enough that no user could mistake it for live data.

**What the MVP is not:** League import, real stats, AI chat, trade analyzer, accounts, payments, or anything requiring scraped or licensed data we do not have.

**The single biggest product risk**, addressed head-on in this document (§11.11, §28, §38): the retention loop is "what moved today?" — and static mock data never moves. The MVP therefore ships a *simulated daily market tick*, clearly labeled as demo, so the habit loop can be tested honestly before real data exists. If we skip this, the MVP is a screenshot, not a product.

---

## 3. Product Thesis

Fantasy football already has a market. Player values move every day — driven by injuries, snap counts, target shares, depth chart changes, coaching hires, hype cycles, and overreaction. But that market is invisible. Managers experience it as scattered tweets, stale weekly rankings, and gut feel.

Existing tools present fantasy value as **static rankings** (a snapshot) or **crowd trade values** (a consensus number with no explanation). Neither answers the questions that actually drive decisions:

- *Is this player's value rising or falling right now?*
- *Is the market's price for him justified by his underlying usage, or is it hype?*
- *Is this a buy-low window or a falling knife?*
- *Why did his value move?*

PlayerTicker's thesis: **organize fantasy information around movement, mispricing, and risk — not rank order.** A rank tells you where a player sits. A market tells you where he's going and whether the price is wrong. The manager who sees mispricing first wins trades.

The emotional hook is **"What moved today?"** The habit loop:

1. Open the site → Market Dashboard.
2. Scan risers, fallers, buy-low windows, sell-high warnings.
3. Click into a Player Stock Card. Read the thesis and catalysts.
4. Add players to Watchlist / Portfolio.
5. Return tomorrow to see how tracked assets moved.
6. Feel (and gradually earn) an edge over league-mates.

Every number on the site must carry an explanation. The stock metaphor is a decision-making tool, not a costume. The moment a number exists without a "why," we've become the thing we're replacing.

---

## 4. Target Users

| # | User | Motivation | Pain point today | Wants to see in 10 seconds | Why they return | What breaks trust |
|---|---|---|---|---|---|---|
| 1 | **Dynasty grinder** (multi-league, year-round) | Win trades, compound roster value over years | KTC-style crowd values lag reality and never explain themselves | Mispricing leaders, rookie market, age-cliff warnings | Daily value movement; being early on a breakout is their whole identity | Values that don't distinguish 1QB vs Superflex; stale timestamps; numbers with no reasoning |
| 2 | **Redraft manager** (Aug–Jan) | Win this season | Rankings are weekly snapshots; waiver/trade timing is guesswork | This week's risers/fallers, buy-low targets, sell-high warnings on their roster | In-season volatility makes daily checks worthwhile | Dynasty-flavored values presented as redraft advice |
| 3 | **Trade-focused manager** | Fleece their league | Needs a defensible "why" to send with an offer | A player's mispricing score + a screenshot-worthy card to attach to a trade pitch | Every trade negotiation sends them back for ammunition | Signals that flip daily with no explanation; obviously wrong prices on stars |
| 4 | **Casual but engaged player** | Stay competitive without doing homework | Overwhelmed by stat sites and podcast noise | A clean board that says who's up, who's down, in plain language | Five-minute check-in habit; feels informed at low cost | Jargon walls, cluttered UI, anything that feels like a Bloomberg terminal for real |
| 5 | **Fantasy content consumer** | Loves the discourse; shares takes | Content is opinions; wants receipts and visuals | Shareable player cards, hot movers, "overheated" tags | Content fuel; the site becomes their citation | Corny copy, fake certainty, gambling vibes |
| 6 | **League commissioner** | Keep the league engaged | Nothing to circulate between waivers and matchups | League-relevant movers to drop in the group chat | Weekly "market recap" to share | Anything that looks like betting promotion (many leagues have anti-gambling norms) |
| 7 | **Future premium user** | Automated edge | Doing all analysis manually | Their actual roster analyzed as a portfolio | Alerts, league sync, AI thesis on demand | Being paywalled before the free product proved value |

Primary design target for MVP: **users 1–3.** They have the highest tolerance for a demo market, the strongest return habit, and they generate the screenshots that acquire users 4–6.

---

## 5. Core User Problems

1. **Value is invisible.** Player value changes daily; managers only see weekly ranking snapshots.
2. **Consensus has no explanation.** Crowd values (KTC-style) tell you *what* the market thinks, never *why* or *whether the market is wrong*.
3. **Timing is everything and nothing supports it.** Buy-low and sell-high windows are real, short, and currently identified by vibes.
4. **Risk is flattened.** A rank of WR14 hides whether that player is a stable floor asset or a touchdown-dependent volatility bomb.
5. **Format confusion.** One universal value applied across dynasty/redraft/1QB/Superflex misleads users constantly.
6. **Information overload.** Stat sites bury the decision under 40 columns; managers want the decision layer, with drill-down available.
7. **No memory.** No mainstream tool shows a manager how a player's value has *trended* in a legible chart, or lets them track "value since I started watching."

---

## 6. Core User Jobs

Ranked by MVP priority:

| Priority | Job | Answered by |
|---|---|---|
| P0 | "Show me who is rising / falling." | Market Dashboard movers, Board sorting by 24H/7D/30D |
| P0 | "Tell me who is over/undervalued." | Mispricing score + Overheated / Buy-Low panels |
| P0 | "Show me *why* a player's value moved." | Catalysts + Market Thesis on Stock Card |
| P0 | "Help me find buy-low players." | Buy-Low Window asset class + dashboard panel + board filter |
| P0 | "Warn me about sell-high players." | Sell-High Warnings panel, Overheated tag, negative mispricing |
| P0 | "Let me track players I care about." | Watchlist (local storage) with value-since-added |
| P0 | "Help me understand player risk." | Volatility score, Risk factors, Risk score breakdown |
| P0 | "Show me if a player is stable, volatile, young, aging, hyped, injured, or mispriced." | Asset classes + tags |
| P1 | "Let me compare player value movement." | Compare view (placeholder button in MVP) |
| P1 | "Treat my roster like a portfolio." | Fantasy Portfolio (conceptual/local in MVP, full in P1) |

---

## 7. Competitive Landscape and Differentiation

No competitor is insulted here; several are excellent at what they do. The point is that none of them is organized around **movement, mispricing, and explained signals**.

| Category | Representative | What they do well | What PlayerTicker does differently |
|---|---|---|---|
| Expert ranking sites | FantasyPros | Aggregate expert consensus, weekly rankings | Rankings are static snapshots. PlayerTicker's primary object is the *trend line*, not the rank. Rank is one column, not the product. |
| Crowd trade calculators | KeepTradeCut, FantasyCalc | Crowd/market-derived trade values | Consensus values have no explanation and no mispricing concept. PlayerTicker separates *market price* from *fundamental value* and surfaces the gap. |
| Dynasty analysis | Dynasty Nerds, DynastyProcess | Deep dynasty content and datasets | Content-first, article-shaped. PlayerTicker is dashboard-first: the analysis is attached to the asset, not buried in an article feed. |
| Stat/analytics platforms | PlayerProfiler | Deep metrics per player | Metric-first (40 numbers, no verdict). PlayerTicker is decision-first: signal + confidence + why, with metrics as supporting evidence. |
| League platforms | Sleeper, ESPN, Yahoo | Hosting, drafts, chat | Platforms, not intelligence layers. PlayerTicker is the intelligence layer that sits *beside* any platform; future league import connects them. |
| News/projections | Rotoworld-style feeds | Timely news blurbs | News tells you what happened; PlayerTicker's catalysts tell you what it did to *value*. |

**The one-line differentiation:** every other tool answers "how good is this player?" PlayerTicker answers **"is this player's price wrong, which direction is it moving, and why?"**

**Anti-clone guardrails** (restated from product direction; enforced in QA §37):

- No competitor UI, layout, branding, or asset copying.
- No scraping of any proprietary fantasy site, ever, including "just for seed values."
- The market metaphor must earn its keep: if a feature is stock-market cosplay that doesn't improve a fantasy decision, cut it.

---

## 8. MVP Definition

The MVP is **one thing**: a polished fantasy football market terminal running on a clearly labeled, deterministic Demo Market of 80–150 players, explorable without login, with a real return loop (simulated daily tick + watchlist), and a data architecture ready to accept real sources later.

### MVP feature list (all P0, detailed specs in later sections)

1. Landing / Home page
2. Market Dashboard ("what moved today")
3. Player Market Board (sortable, filterable table/cards)
4. Player Stock Card / detail page
5. Market Movers (risers, fallers, buy-low, sell-high, overheated)
6. Watchlist (local storage, value-since-added tracking)
7. Fantasy Portfolio — *conceptual, local-only, manually built* (see §25; the full feature is P1)
8. Search, filters, sorting
9. Market tags / asset classes
10. Buy/Hold/Sell signals with confidence + explanation
11. Value movement charts (sparklines + full chart)
12. Mispricing score
13. Volatility + risk scores
14. Market thesis summaries (template-generated from structured mock data)
15. Methodology / data transparency page
16. Mock data system with simulated daily tick
17. Data-service abstraction ready for future API integration

### MVP success criteria

- A first-time visitor understands the product within 5 seconds of the landing page.
- A user can go from landing → a specific player's thesis in ≤ 3 taps.
- A returning user sees *different numbers than yesterday* (demo tick) and their watchlist gain/loss updates.
- Zero claims of live data anywhere. Every screen carries data-mode context.
- Lighthouse performance ≥ 90 mobile on the Board with 150 players.

---

## 9. MVP Anti-Scope

Explicitly **not** in the MVP. Anyone building from this document should treat additions from this list as scope violations requiring sign-off.

| Excluded | Why | Phase |
|---|---|---|
| Real-time live stats | No licensed provider connected; faking it is disqualifying | P1/P2 |
| League sync (Sleeper/ESPN/Yahoo) | Requires accounts, OAuth, ID mapping at production quality | P1 (Sleeper) / P2 (others) |
| User accounts / auth | Local storage covers the MVP loop; accounts add weeks | P1 |
| Paid subscriptions | Nothing to charge for until core value is proven | Not now |
| AI-generated analysis (live LLM calls) | Template summaries are cheaper, deterministic, and honest for mock data | P1 (cached) |
| Trade analyzer, draft room, mock drafts | Each is its own product | P2 |
| News CMS / articles / community feed | Content treadmill; dashboard is the product | P2 / Not now |
| Real-money anything, betting, gambling | Never | Never |
| Official NFL logos, marks, headshots | Unlicensed | Only if licensed, ever |
| Scraping FantasyPros / KTC / Dynasty Nerds / PlayerProfiler / any proprietary site | Illegal-adjacent, brittle, reputation-ending | Never |
| Notifications / alerts | Requires accounts + infra; placeholder UI only | P2 |
| Full format matrix (all 6 formats × all pages) | MVP ships one default format with visible labeling + a constrained toggle (§13) | P1 completes matrix |

---

## 10. Product Principles

1. **Movement over rank.** The trend line is the primary object; rank is metadata.
2. **Every number has a reason.** Price, signal, mispricing, volatility — each one is one tap away from its explanation. A number we can't explain doesn't ship.
3. **Honest by construction.** Data mode (Demo/Live), freshness timestamp, and confidence are rendered on every value surface, not buried in a footer.
4. **No fake certainty.** Signals carry confidence levels and risk factors. Copy never promises outcomes. "Buy" means "the market appears to be underpricing this asset," never "this will hit."
5. **Useful before login.** The full market is explorable anonymously. Login (later) adds persistence and personalization, never gates the core.
6. **The metaphor serves the decision.** Stock-market language is used exactly as far as it improves fantasy decisions and no further. No "shares," no "dollars," no order books.
7. **Mobile is the primary device.** Design mobile-first; desktop gets density as an enhancement.
8. **Screenshot-worthy by design.** The Player Stock Card is the product's advertisement. It must look good in a group chat at 390px wide.
9. **Format honesty.** The active format (Dynasty · Superflex · Half-PPR by default) is always visible. One universal value for all formats is fantasy malpractice; we don't do it.
10. **Speed is a feature.** Filtering, sorting, and navigation must feel instant. A market terminal that lags is dead.

---

## 11. Core Market System

This section defines the full asset model. Every player in the system carries all of the following.

### 11.1 Player Ticker

- 3 uppercase letters, unique across the player pool. Display always in the mono/technical typeface (§21).
- Generation rule: hand-curated for the mock pool (memorability beats algorithm); algorithmic fallback for scale: first letter of first name + first two consonants of last name, then collision resolution by substituting the next distinct consonant, then a trailing digit as last resort (`JJF`, `JJF2` never ships if avoidable — curate instead).
- Examples: Justin Jefferson `JJF`, Bijan Robinson `BIJ`, CeeDee Lamb `CDL`, Ja'Marr Chase `JMC`, Jahmyr Gibbs `GIB`, Malik Nabers `NAB`, Brock Bowers `BOW`, Josh Allen `ALN`, Ashton Jeanty `JTY`.
- Tickers are search-indexed: typing `BIJ` in search resolves to Bijan Robinson.

### 11.2 Market Price

- Fictional fantasy value index, **0.0–100.0**, one decimal displayed.
- Interpretive bands (shown on Methodology page and in tooltips):

| Band | Meaning |
|---|---|
| 90–100 | Elite fantasy asset (top ~5 overall) |
| 80–89.9 | Premium asset (clear top-15 value) |
| 65–79.9 | Strong starter-level asset |
| 45–64.9 | Solid contributor / flex asset |
| 25–44.9 | Speculative / bench asset |
| 0–24.9 | Deep stash / minimal market value |

- The scale is **relative and format-specific** (a QB's price differs between 1QB and Superflex).
- Never rendered with a currency symbol. Never called a "share price." UI label: **Market Price** or **Value Index**.

### 11.3 Price Movement

Tracked windows: **24H, 7D, 30D, Season, All-time (career-in-system)**. Each window stores absolute delta and percentage delta; UI shows the delta with a directional arrow + color + sign (never color alone — §31).

MVP source: seeded mock history (§28) + simulated daily tick. History resolution: one snapshot per day (a daily market close, not intraday), which honestly matches how fantasy value actually moves and keeps data volume trivial (150 players × 365 points/yr).

### 11.4 Asset Class

Each player has exactly **one primary asset class** (identity) and up to **three market tags** (current conditions). Mixing these two concepts into one field creates contradictions ("Blue Chip" + "Falling Knife" on the same line reads as a bug).

**Primary asset classes (identity, mutually exclusive):**

| Class | Definition (rule-based, §12.10) |
|---|---|
| Blue Chip | Price ≥ 85 AND volatility ≤ 40 AND role security ≥ 80 |
| Growth Stock | Age ≤ 25 AND 30D momentum > 0 AND opportunity score rising |
| Rookie IPO | Rookie season, no NFL sample |
| Dividend Veteran | Age ≥ 29 AND production ≥ 70 AND volatility ≤ 45 |
| Volatile Asset | Volatility ≥ 70 |
| Penny Stock | Price < 20 |
| Standard Asset | Fallback when nothing else fires |

**Market tags (conditions, 0–3 per player):**

`Meme Stock` (sentiment ≫ production), `Falling Knife` (30D ≤ −15% and accelerating), `Overheated` (mispricing ≤ −25), `Buy-Low Window` (mispricing ≥ +20 AND 30D negative), `Injury Discount`, `Age Cliff`, `Breakout Watch`, `Volume King` (opportunity ≥ 90), `Touchdown Bubble` (TD rate ≫ expected), `Role Spike`, `Hype Stock`, `Contract Fog`, `QB Downgrade`, `Schedule Tailwind` (P1).

Every tag has a hover/tap tooltip with a one-line definition and the rule that triggered it.

### 11.5 Buy / Hold / Sell Signal

Values: **Strong Buy · Buy · Speculative Buy · Hold · Monitor · Sell · Strong Sell · Avoid**.

Each signal ships as a structured object, never a bare label:

- `signal` (enum above)
- `confidence`: Low / Medium / High, derived numerically (§12.9)
- `explanation`: 1–2 sentences, plain language
- `supportingFactors[]`: 2–4 bullets referencing actual sub-scores
- `riskFactors[]`: 1–3 bullets
- `formatContext`: which format this signal applies to
- `lastUpdated` timestamp

Signal assignment is rule-based from mispricing + momentum + risk (§12.10). "Speculative Buy" requires positive mispricing AND high volatility or low confidence — it's the honest label for lottery tickets. "Avoid" is reserved for negative mispricing AND high risk AND deteriorating catalysts; it should be rare (< 5% of pool) or it loses meaning.

### 11.6 Volatility Score

- **0–100**, higher = less stable value. Computed as the normalized standard deviation of daily price changes over trailing 30 days, blended 70/30 with a structural volatility prior (TD-dependence, role security, injury history) so rookies and players with thin samples aren't shown as falsely calm.
- Display bands: 0–29 **Low** · 30–54 **Medium** · 55–74 **High** · 75–100 **Extreme**, rendered as a 4-segment meter, never color-only.

### 11.7 Risk Score

- Composite **0–100** (higher = riskier), with a visible breakdown of six sub-risks, each 0–100: **Injury risk, Age risk, Role risk, QB/offense risk, Efficiency-regression risk, Hype risk.**
- Composite = weighted mean (weights on Methodology page: injury .25, role .25, age .15, QB/offense .15, efficiency .10, hype .10).
- The Stock Card shows the composite plus the top 2 contributing sub-risks as named Risk Factors with one-line explanations.

### 11.8 Mispricing Score

The flagship differentiator. Range **−100 to +100**.

- **Positive = undervalued** (fundamentals exceed market price). **Negative = overvalued/overheated.**
- Defined precisely in §12.6: `Mispricing = scale(FundamentalValue − MarketValue)`. It exists because the system computes *two* values per player — what the underlying indicators say he's worth, and what the sentiment-weighted market says he's priced at. The gap is the edge.
- Display: signed number + horizontal diverging meter centered at 0 + plain-language band:

| Score | Label |
|---|---|
| +30 and up | Significantly undervalued |
| +15 to +29 | Undervalued |
| +6 to +14 | Slightly undervalued |
| −5 to +5 | Fairly priced |
| −14 to −6 | Slightly overheated |
| −29 to −15 | Overheated |
| −30 and below | Overpriced / value trap |

- Copy discipline: mispricing is always framed as "the market *may be* under/overvaluing," never "this player *is* worth more." Confidence attaches to it.

### 11.9 Market Catalysts

Structured events explaining movement. Each catalyst: `type` (from a controlled vocabulary), `direction` (bullish/bearish), `magnitude` (minor/moderate/major), `date`, `headline` (≤ 12 words), `detail` (1–2 sentences), `affectedScores[]` (which sub-scores it moved).

Controlled vocabulary (extensible): snap share change, target share change, route participation change, red-zone usage change, teammate injury (opportunity), own injury, injury recovery, depth chart change, rookie competition added, coaching change, scheme change, QB change (up/down), offensive line change, contract news, suspension risk, efficiency spike, efficiency regression, volume decline, role security improvement, unsustainable TD rate, age-curve milestone, hype surge, hype cooldown.

Catalysts are the "why" behind every price move. On the Demo Market, catalysts are authored mock events wired to the seeded price history so charts and stories agree (§28).

### 11.10 Market Thesis

Every player carries a written thesis with a fixed structure:

1. **Where the value stands** (1 sentence: price, class, trajectory)
2. **Why it's moving** (1–2 sentences citing catalysts)
3. **Bull case** (1–2 sentences)
4. **Bear case / main risk** (1–2 sentences)
5. **Verdict** (signal + confidence restated in plain language)

MVP theses are generated by a **deterministic template engine** filling structured fields (not an LLM), then hand-polished for the top ~40 players in the mock pool. Every MVP thesis carries a "Demo analysis · generated from mock data" badge. The template engine is deliberately the same interface a future AI generator will implement (§16), so swapping generators later touches zero UI.

### 11.11 The Demo Market Tick (MVP-critical)

Static mock data kills the return loop. The MVP therefore includes a **simulated daily market tick**:

- A deterministic pseudo-random walk seeded per player (`seed = hash(playerId)`), parameterized by that player's volatility score and current momentum, producing a new "daily close" each calendar day, plus occasional scripted catalyst events from the mock event calendar.
- Deterministic means: every visitor sees identical prices on the same date (computed from the seed + date, no server needed), yesterday differs from today, and the chart, movers, and watchlist deltas all genuinely change daily.
- Labeled everywhere as **Demo Market** with the persistent data-mode banner (§32). The methodology page explains the simulation in one paragraph.
- This is not deception — it's a working scale model, clearly labeled, that lets us validate the habit loop and the entire UI before paying for data.

---

## 12. Market Price Formula

The formula must be explainable to a skeptical dynasty player on the Methodology page. No "AI determines the score." The architecture computes **two values per player, per format**, and derives everything else from them.

### 12.1 Sub-scores (inputs, each normalized 0–100)

| Sub-score | What it measures | MVP source | Future source |
|---|---|---|---|
| Production | Fantasy points per game, recent-weighted | Seeded mock stats | nflverse-style weekly data |
| Usage | Snap %, touches/routes per game | Mock | Play-by-play aggregates |
| Opportunity | Target share, carry share, red-zone share | Mock | Play-by-play aggregates |
| Efficiency | YPRR/YPC-style rates vs positional baseline | Mock | Derived metrics |
| Age Curve | Position-specific age value multiplier | Deterministic curve | Same, refined |
| Positional Scarcity | Value of position rank given replacement level | Deterministic curve | Same, refit annually |
| Role Security | Depth chart grip, competition, contract | Mock (authored) | News/depth chart feeds |
| Offensive Environment | Team pace, QB quality, O-line, play-calling | Mock (authored team grades) | Team-level data |
| Injury Adjustment | Current status + historical durability | Mock | Injury feeds |
| Sentiment / Trend | Hype, trending adds/drops, momentum | Simulated | Sleeper trending API, watchlist behavior |

### 12.2 Fundamental Value (MVP formula)

Per player, per format:

```
FundamentalRaw =
    w1·Production + w2·Usage + w3·Opportunity + w4·Efficiency
  + w5·RoleSecurity + w6·OffensiveEnvironment

FundamentalAdj =
    FundamentalRaw
  × AgeCurveMultiplier(position, age, format)      // dynasty only; 1.0 in redraft
  × InjuryMultiplier(status)                        // e.g., 0.85 questionable, 0.6 IR-short, 0.35 IR-long
  × ScarcityMultiplier(position, positionalRank, format)

FundamentalValue = percentileRank(FundamentalAdj, playerPool) × 100
```

MVP default weights (dynasty): w1=.25, w2=.15, w3=.20, w4=.10, w5=.20, w6=.10. Redraft: w1=.35, w2=.15, w3=.20, w4=.10, w5=.15, w6=.05 (production and now-value up, age irrelevant). All weights live in one config file and print on the Methodology page.

The final **percentile-rank step is essential**: it converts arbitrary raw units into the stable 0–100 index and makes the scale self-calibrating as the pool changes.

### 12.3 Market Value (MVP formula)

```
MarketValue(t) = clamp(
    0.80 · MarketValue(t−1)
  + 0.15 · FundamentalValue(t)
  + 0.05 · SentimentScore(t)
  + CatalystImpulse(t)                              // event-driven jumps
, 0, 100)
```

Market Value is *sticky and sentiment-contaminated by design* — it drifts toward fundamentals but overshoots on hype and lags on quiet decline, exactly like a real fantasy market. This is what makes mispricing a real, non-zero quantity rather than a rounding error.

### 12.4 Displayed Market Price

`MarketPrice = MarketValue`, rounded to one decimal. The Fundamental Value is visible on the Stock Card (labeled "Model Value") so users can see both sides of the mispricing gap.

### 12.5 Advanced future formula (P1+)

- Replace recent-weighting with exponential decay (half-life ≈ 4 weeks in-season, 10 weeks offseason).
- Bayesian shrinkage toward positional priors for small samples (§12.8).
- Sentiment from real signals: Sleeper trending adds/drops, PlayerTicker watchlist add-rate, search velocity on-site.
- Momentum term with mean-reversion damping to prevent runaway feedback.
- Backtesting harness: replay historical seasons, measure whether positive-mispricing players outperformed their market value trajectory over the following 30/60 days. Mispricing must be validated, not just asserted.

### 12.6 Mispricing

```
Mispricing = clamp( k · (FundamentalValue − MarketValue), −100, +100 )   // k ≈ 2.5
```

Reported with confidence (§12.9). When confidence is Low, the UI caps the displayed band language at "slightly" regardless of magnitude.

### 12.7 Format handling

- **Dynasty vs Redraft:** two separate value computations (different weights + age curve on/off). Never one value relabeled.
- **1QB vs Superflex:** QB ScarcityMultiplier switches curves. In Superflex, startable QBs receive a scarcity multiplier ≈ 1.6–2.2× their 1QB value band; elite QBs become top-5 overall assets, matching real market behavior. Non-QB values are re-percentiled against the adjusted pool.
- **PPR vs Half-PPR:** Production and Opportunity sub-scores are computed under the selected scoring; primarily shifts pass-catching RBs and volume WRs a few points.
- MVP computes and stores all six format combinations for the mock pool (cheap at 150 players); the UI defaults to **Dynasty · Superflex · Half-PPR** with the format ribbon always visible (§13).

### 12.8 Special populations

| Population | Handling |
|---|---|
| **Rookies (no NFL sample)** | Fundamental Value from draft capital + landing spot (Opportunity, Environment, Role projections) with confidence hard-capped at Low until 4 NFL games; tagged `Rookie IPO`; volatility floor of 60. |
| **Injured players** | InjuryMultiplier on fundamentals; Market Value reacts via catalyst impulse; `Injury Discount` tag when mispricing goes positive due to injury (the buy-low case); expected-return context on card. |
| **Aging veterans** | AgeCurveMultiplier declines by position (RB cliff ~27–28, WR ~30–31, TE ~31, QB ~36 — curves printed on Methodology page); `Age Cliff` tag within 1 year of curve inflection; `Dividend Veteran` class when production holds. |
| **Small samples (non-rookie)** | Production/Efficiency shrunk toward positional mean proportional to games played (full weight at 8+ games); confidence penalized. |

### 12.9 Confidence

```
Confidence = f( sampleSize, dataFreshness, injuryUncertainty, inputVariance )
```

Numeric 0–100 internally; displayed as Low (<40) / Medium (40–70) / High (>70). Any player with `lastUpdated` older than 7 days is capped at Medium; older than 21 days, Low, with a staleness warning. On the Demo Market, confidence additionally caps at Medium globally — demo data never claims High confidence.

### 12.10 Signal & tag assignment (rule table)

| Condition (evaluated in order) | Signal |
|---|---|
| Mispricing ≥ +25 AND risk ≤ 60 | Strong Buy |
| Mispricing ≥ +12 AND risk ≤ 70 | Buy |
| Mispricing ≥ +12 AND (risk > 70 OR confidence Low) | Speculative Buy |
| Mispricing ≤ −25 AND risk ≥ 65 | Avoid |
| Mispricing ≤ −25 | Strong Sell |
| Mispricing ≤ −12 | Sell |
| |Mispricing| < 12 AND volatility ≥ 70 | Monitor |
| Otherwise | Hold |

Tags fire from the rules in §11.4. All thresholds live in the same config file as formula weights. Signals recompute on each market tick; a hysteresis band of ±3 mispricing points prevents daily signal flip-flopping.

---

## 13. Fantasy Format Support

**MVP default: `Dynasty · Superflex · Half-PPR`** — the format of the most engaged early-adopter segment (dynasty grinders) and the format where value nuance matters most.

- A **Format Ribbon** is pinned in the app header on every value-bearing page: `Dynasty · SF · 0.5PPR ▾`. Tapping opens a compact sheet with three toggles: Dynasty/Redraft, 1QB/Superflex, PPR/Half-PPR.
- All six combinations are precomputed for the mock pool, so the toggle works in MVP without clutter: one control, three switches, instant re-render.
- Selection persists in local storage. Shared/screenshot cards bake the format label into the card itself so a screenshot can never misrepresent format.
- Phasing: MVP ships the toggle functional but visually de-emphasized (default prominent). P1 adds per-format methodology notes and format-specific thesis lines. Standard scoring, TE-premium, and 2QB-distinct-from-SF are P2.
- Hard rule restated: **no universal value across formats.** If a page cannot show format context, it cannot show a value.

---

## 14. Data Strategy and Data Integrity

### 14.1 MVP: Demo Market only

1. The MVP runs entirely on **mock data**: an authored player pool, seeded price history, scripted catalysts, and the deterministic daily tick (§11.11). No external data calls.
2. The app **never claims live data**. A persistent, dismiss-resistant **Data Mode banner** reads: `Demo Market — simulated data for product preview. Not current player information.` It appears on the dashboard, board, and every stock card.
3. **No scraping of proprietary fantasy sites**, in any form, at any phase, including one-time seeding of values. Mock values are authored from the internal formula against authored stat lines.
4. All player values come from the **internal market formula** (§12) applied to mock inputs — the exact pipeline future real data will flow through. We are testing the machine, not just the paint.

### 14.2 Freshness and provenance (every phase)

5. Every `PlayerMarketSnapshot` carries `lastUpdated` (ISO timestamp) — rendered on the stock card, in the board's Last Updated column, and in the dashboard header.
6. Every `MarketSignal` carries a `confidence` level with the derivation rules in §12.9.
7. Every player carries a **data freshness label**: `Fresh` (< 24h) / `Recent` (< 7d) / `Stale` (< 21d) / `Outdated` (≥ 21d, value display degrades to muted styling with warning icon).
8. A **DataSourceStatus** panel (Methodology page + admin) lists each source, its mode (mock/live), last successful update, and coverage.

### 14.3 Future data sources (architected for, not connected)

| Source | Provides | Integration notes |
|---|---|---|
| Sleeper API | Player metadata, trending adds/drops, leagues/rosters/drafts (user-authorized) | Free, documented, ToS-compliant usage; first real integration target. Trending adds/drops become the real SentimentScore. |
| nflverse / nflfastR-style open data | Historical + weekly NFL stats, snap counts | Open data; powers Production/Usage/Opportunity/Efficiency for real. Weekly batch ingestion. |
| DynastyProcess-style open datasets | Values/picks datasets where licenses permit | Verify license per dataset before use; attribution where required. |
| Paid provider (SportsDataIO or similar) | Live stats, injuries, news, projections, licensed images | Cost-gated; only when revenue or funding justifies. Contract review before any "live" labeling. |
| Internal market engine | Fundamental/Market values, signals, tags | Always the system of record for value. External data feeds *inputs*, never overrides outputs. |
| User behavior (watchlists, searches) | On-site sentiment signal | Anonymous/aggregate only; disclosed in methodology. |
| Admin CSV/JSON upload | Manual corrections, catalyst authoring | The bridge phase between mock and automated ingestion (§18.8). |

9. All future integrations must be **approved APIs, open datasets with compatible licenses, licensed providers, or user-authorized imports.** A source that can't be named on the Methodology page doesn't get integrated.
10. **AI analyzes; it never invents.** Any AI-generated text consumes only structured data the app supplies and must surface uncertainty (§16). AI explains the signal; the formula produces the signal.

### 14.4 The mock→live transition contract

The UI consumes a single `MarketDataService` interface (§29). Swapping `MockMarketDataService` for `LiveMarketDataService` must require **zero UI changes**. The Demo Market banner is driven by `DataSourceStatus.mode`, so flipping to live data automatically retires the banner per-source — partial-live states (e.g., real metadata + simulated prices) render a mixed-mode notice. This contract is tested in QA (§37).

---

## 15. Legal, Licensing, and Product Safety Constraints

Binding constraints. Violations are launch blockers.

1. **No scraping proprietary fantasy sites** (FantasyPros, KeepTradeCut, Dynasty Nerds, PlayerProfiler, FantasyCalc, Sleeper's non-public surfaces, or any competitor). Not for values, not for rankings, not "just once for seed data."
2. **No copying competitor UI**, layout, component design, branding, or copy. Vibe references only (§21).
3. **No official NFL marks**: no team logos, wordmarks, uniforms, or licensed player headshots. MVP visual treatment for players: initials avatars on team-color-*inspired* gradient fields (custom palette, not exact Pantone team marks), position glyphs, and abstract silhouettes. Team names as plain text (factual use), never logos.
4. **Player names and public statistics are used factually** — standard fantasy-industry practice — with no implied endorsement. No player likeness imagery until licensed.
5. **Fictional value disclaimer, everywhere values appear**: "Market prices are fictional fantasy value indexes. Not real money, not securities, not tradable instruments."
6. **Not advice, not gambling**: persistent footer + methodology statement: "PlayerTicker provides fantasy sports entertainment information only. It is not financial advice, investment advice, gambling, or betting, and offers nothing of monetary value to buy, sell, or wager."
7. **Language rules**: use *fantasy value, market index, player value, asset profile, market signal*. Prohibited: *shares, invest real money, cash out, odds, wager, stake, returns* (in monetary sense), *buy shares of players*. "Buy/Sell" is permitted only as fantasy roster-move shorthand and is defined as such on first-run tooltip + methodology.
8. **No real-money mechanics ever**: no deposits, no prizes with monetary value, no simulated trading with cash-equivalent framing.
9. **Age/audience posture**: general audiences; nothing that requires gambling-style age gating — and keep it that way.
10. **Privacy (P1+)**: when accounts arrive, minimal data collection, no sale of user data, plain-language policy. MVP collects nothing beyond anonymous analytics + local storage.

---

## 16. AI Analysis Architecture

AI is a **future text layer over a deterministic value engine** — never the engine.

### 16.1 Rules

1. AI must not invent data. Input is a structured payload assembled by the app; output must only reference fields present in the payload.
2. AI generates **market thesis prose and catalyst narratives**, never prices, signals, scores, or tags — those are algorithmic (§12).
3. All AI text is **cached** (keyed by `playerId + snapshotHash + format + templateVersion`) and regenerated only when the underlying snapshot materially changes (price move > threshold, new catalyst, signal change).
4. AI never runs on page view. Generation happens in scheduled batch jobs post-market-tick.
5. AI calls are rate-limited and budgeted; a per-day generation cap with priority ordering (movers first, long-tail players fall back to templates).
6. Expensive AI features (on-demand roster analysis) are login-gated and eventually paid — P2.
7. AI output must include a self-reported confidence and must state when data is insufficient ("Limited sample: 2 games since role change").
8. AI output passes a validation layer: schema check, banned-phrase check (gambling/financial-advice language from §15.7), factual-consistency check against the input payload (numbers quoted must match).
9. **MVP replacement**: the deterministic template engine (§11.10) implements the same `ThesisGenerator` interface. AI is a drop-in upgrade, not a rewrite.
10. All AI-generated text renders with an "AI-generated analysis" badge; template text renders "Generated summary."

### 16.2 Example structured input (thesis generation)

```json
{
  "player": { "internalId": "pt_0042", "name": "Jahmyr Gibbs", "ticker": "GIB",
              "position": "RB", "team": "DET", "age": 24 },
  "format": "dynasty_sf_halfppr",
  "snapshot": {
    "marketPrice": 88.2, "fundamentalValue": 91.5, "mispricing": 8,
    "signal": "Buy", "confidence": "Medium",
    "movement": { "d1": 0.4, "d7": 2.1, "d30": -1.8 },
    "volatility": 48, "riskScore": 44,
    "assetClass": "Growth Stock", "tags": ["Breakout Watch"],
    "lastUpdated": "2026-07-09T06:00:00Z", "dataMode": "demo"
  },
  "catalysts": [
    { "type": "red_zone_usage_change", "direction": "bullish", "magnitude": "moderate",
      "headline": "Red-zone carry share climbed to 58%", "date": "2026-07-02" }
  ],
  "risks": [
    { "type": "role_risk", "score": 55, "detail": "Committee backfield persists" }
  ],
  "statsSnapshot": { "gamesPlayed": 16, "ppgHalfPpr": 17.8, "snapPct": 61 }
}
```

### 16.3 Example output contract

```json
{
  "playerId": "pt_0042",
  "snapshotHash": "a91f…",
  "generator": "ai" ,
  "modelVersion": "thesis-gen-v1",
  "confidence": "medium",
  "insufficientData": false,
  "thesis": {
    "valueSummary": "…",
    "whyMoving": "…",
    "bullCase": "…",
    "bearCase": "…",
    "verdict": "…"
  },
  "citedFields": ["marketPrice","mispricing","catalysts[0]","risks[0]"],
  "generatedAt": "2026-07-09T06:15:00Z",
  "expiresOn": "snapshotChange"
}
```

Validation rejects output whose `citedFields` reference nonexistent data or whose numbers diverge from the payload.

---

## 17. Information Architecture

```
PlayerTicker
├── / ........................ Landing (marketing + market preview)
├── /market .................. Market Dashboard (daily habit page)
├── /board ................... Player Market Board ("The Board")
├── /player/:ticker .......... Player Stock Card (canonical URL uses ticker: /player/GIB)
├── /watchlist ............... Watchlist
├── /portfolio ............... Fantasy Portfolio (MVP: local/manual concept)
├── /methodology ............. Methodology & Data Transparency
├── /legal ................... Disclaimers, terms placeholder
└── /admin ................... (Future, auth-walled) data import & publishing
```

**Navigation model**

- Desktop: slim top nav — logo/wordmark, Market, Board, Watchlist, Portfolio, Methodology, search field, Format Ribbon.
- Mobile: bottom tab bar with 4 tabs + search: **Market · Board · Search · Watchlist · Portfolio**. Methodology lives behind the data-mode badge and footer (always reachable in ≤ 2 taps from any value).
- Global search (players by name or ticker) opens as an overlay from any page.
- Every value element deep-links: tapping any player row/card anywhere goes to `/player/:ticker`. Back preserves scroll and filter state.

**Entity relationships**

```
Player 1─1 PlayerIdentity (multi-ID map)
Player 1─n PlayerMarketSnapshot (per format, per day)
Player 1─n PlayerMarketHistoryPoint
Player 1─n MarketCatalyst
Player 1─1 MarketSignal (current, per format)
Player 1─n RiskFactor
Watchlist n─n Player (local storage, value-at-add captured)
Portfolio 1─n PortfolioHolding ─1 Player
```

---

## 18. Required Pages

### 18.1 Landing Page `/`

**Job:** explain the product in 5 seconds, establish the metaphor, route users into the market fast, and establish trust.

| Section | Content |
|---|---|
| Hero | Headline: **"Fantasy football has a market. Track it."** Sub: "Player values move every week. Spot risers, fallers, buy-low windows, and market overreactions before your league catches up." Primary CTA: **View the Market** → `/market`. Secondary CTA: **Track My Players** → `/watchlist`. Background: the signature "living tape" element (§21.8) — a slow-scrolling row of real ticker chips with movement badges, pulled from the demo tick, subtly animated. |
| Market Movers preview | Live-rendered (from demo tick) top 3 risers + top 3 fallers as compact mover chips; tapping any goes straight into the product. Labeled "Demo Market preview." |
| Why this is different | Three-up: **Movement, not rankings** / **Mispricing, not consensus** / **Every number explained.** One sentence each, no marketing fluff. |
| Featured Stock Card | A full, real (demo) Player Stock Card embedded — the product advertising itself. Rotates daily with the tick. |
| Market categories | Tappable chips: Buy-Low Windows, Overheated, Rookie IPOs, Blue Chips, Most Volatile — each deep-links to a pre-filtered Board. |
| Watchlist teaser | "Track any player. See value change since the day you started watching." Screenshot-style mock + CTA. |
| Methodology teaser | "No black box. See exactly how prices are computed." → `/methodology`. Includes the Demo Market notice prominently. |
| Footer | Fictional-value + not-advice disclaimers (§15), methodology link, legal link. |

Above-the-fold must contain: headline, sub, primary CTA, and at least one moving demo element. First-time visitors skipping the landing (direct `/market` links) lose nothing — the landing is marketing, not gate.

### 18.2 Market Dashboard `/market`

**Job:** the daily habit page. Opens fast, answers "what moved today?" without scrolling on desktop and within two swipes on mobile.

| Section | Spec |
|---|---|
| Market header | "Market Update — Thu, Jul 9" + tick time + Data Mode badge + freshness stamp + Format Ribbon. Sets the "market open" ritual without pretending to be an exchange. |
| Biggest Risers | Top 5 by 24H Δ (tie-break 7D). Mover rows: avatar, name/ticker, price, Δ badge, sparkline, top catalyst headline. |
| Biggest Fallers | Same, inverted. |
| Buy-Low Windows | Top 5 by mispricing (positive) filtered to negative 30D movement. Each row shows mispricing meter + one-line reason. |
| Sell-High Warnings | Top 5 by mispricing (negative) with positive 30D movement. |
| Overheated Assets | Mispricing ≤ −25, sorted ascending. |
| Blue Chips | Current Blue Chip class, price-sorted — the stability shelf. |
| Rookie IPOs | Rookie class sorted by 7D movement. |
| Most Volatile / Most Stable | Two compact columns, volatility extremes. |
| My Watchlist strip | If watchlist non-empty: horizontal scroll of watchlist chips with since-added Δ; else a one-line empty-state teaching prompt. |
| Data freshness footer | Source status summary + link to methodology. |

Panels are horizontally scrollable card rails on mobile, a 2–3 column grid on desktop. Every panel has a "View all on the Board →" link applying the equivalent filter.

### 18.3 Player Market Board `/board`

**Job:** the full sortable market. Desktop = dense table; mobile = card list. Same data, same controls.

**Columns (desktop table):** Player (avatar+name), Ticker, Pos, Team, Age, Market Price, Overall Rank, Pos Rank, 24H, 7D, 30D, Signal, Mispricing, Volatility, Asset Class, Last Updated. Column visibility presets: *Movement* (default), *Value*, *Risk*, plus a custom picker (P1).

**Mobile card (per player):** rank chip, avatar, name + ticker + pos/team, price (large), 7D Δ badge, sparkline, signal badge, mispricing mini-meter, asset class tag. Tap → stock card.

**Controls:** persistent search field (name/ticker); filter bar with Position (multi), Team, Asset Class, Tag, Signal; Format Ribbon (Dynasty/Redraft · 1QB/SF · PPR/½PPR); sort menu (Price, 24H, 7D, 30D, Mispricing ↑/↓, Volatility, Rank); Reset filters. Active filters render as removable chips. Filter + sort state encodes into the URL (`/board?pos=WR&tag=buy-low&sort=d30`) so pre-filtered deep links work from the dashboard and landing.

**Performance:** virtualized list (150 rows trivial now; architecture assumes 500+ later). Sort/filter client-side, < 50ms perceived.

### 18.4 Player Stock Card `/player/:ticker`

The centerpiece. Full spec in §23. Contents summary: identity header (name, ticker, pos/team/age, avatar), price block (Market Price, Model Value, rank, pos rank), movement chart with range tabs (7D/30D/Season/All), signal block (signal, confidence, explanation), meters (mispricing, volatility, risk with breakdown), asset class + tags, catalysts timeline, risk factors, bull/bear cards, market thesis, stats snapshot + recent game log, format notes, Watchlist button, Compare + Share placeholders, freshness badge, demo-data disclaimer.

### 18.5 Watchlist `/watchlist`

**Job:** the return loop. Full spec §25. MVP is local-storage: add/remove anywhere via the watch button; each item stores `priceAtAdd` + `addedDate`; list shows current price, Δ since added (absolute + %), sparkline since added; header shows biggest watchlist riser/faller; alerts button renders as "Alerts — coming with accounts" placeholder; empty state teaches ("Watch a player to start tracking value. Try today's top riser →").

### 18.6 Fantasy Portfolio `/portfolio`

**Job:** "my roster as assets." MVP = manual, local, clearly labeled conceptual. Full spec §25.2. Add players manually (search overlay), see: total portfolio value (sum of prices), allocation by position (donut/stacked bar), exposure by team, risk distribution (low/med/high/extreme counts), top holdings, riskiest holdings, portfolio trend line (sum of holdings' history). Future: league import replaces manual entry (P1 Sleeper, P2 ESPN/Yahoo).

### 18.7 Methodology / Data Transparency `/methodology`

**Job:** trust engine. Sections: What the Market Price is (fictional index, bands table); The formula (weights table, plain-English walkthrough, worked example for one player); Mispricing explained (two-value model); Signals & tags rule table; Confidence & freshness rules; **Demo Market explanation** (what's simulated, why, what changes with real data); Future data sources; What we can't know (explicit limitations list); Not-advice/not-gambling statements; Changelog of formula versions.

Written for a smart skeptic, not a lawyer. Target read time 4 minutes.

### 18.8 Future Admin / Data Import (design only, no MVP UI)

Auth-walled internal tool, P1 build. Workflow: upload CSV/JSON (players, stats, catalysts) → validation report (schema, duplicate detection) → **player identity resolution queue** (unmatched names/IDs flagged for manual mapping against the multi-ID table §27) → staged market recalculation with diff preview (top movers caused by this import) → review AI/template thesis drafts for changed players → **Publish market update** (atomic snapshot swap) → rollback to any prior published snapshot. Every publish is versioned; the public `lastUpdated` derives from publish time.

---

## 19. Core User Flows

1. **First-time visitor, landing:** arrives at `/` → reads hero (≤ 5s comprehension) → sees moving ticker tape + movers preview → taps "View the Market" → dashboard with Demo Market banner → understands data mode without reading fine print.
2. **Daily open:** returning user → `/market` (bookmarked/PWA) → header shows today's date + tick freshness → scans Risers/Fallers → watchlist strip shows their tracked players moved → taps one.
3. **Filter hunt (WR buy-lows):** Board → filter Position=WR → filter Tag=Buy-Low Window → 6 results with mispricing meters → sorts by mispricing desc → opens top result.
4. **Sort by 30D:** Board → sort menu → 30D ↓ → biggest monthly fallers surface → user distinguishes Falling Knife tags from Injury Discounts via tag tooltips.
5. **Stock card read:** `/player/NAB` → price + chart (30D tab) → signal "Buy · Medium confidence" → reads explanation → expands catalysts → reads bull/bear → thesis verdict.
6. **Thesis to action:** thesis verdict matches user's trade idea → taps Share placeholder ("Card sharing coming soon") → screenshots the card instead (card is designed for this).
7. **Add to watchlist:** taps watch button on card → toast "Watching NAB — tracking value from 74.2" → button state flips.
8. **Return visit payoff:** two days later → watchlist shows NAB +1.8 (+2.4%) since added → biggest watchlist riser badge → user taps into card to read the new catalyst.
9. **Trust check:** user doubts a number → taps mispricing meter → tooltip w/ definition + "How is this computed?" → methodology anchor-scrolls to mispricing section → user sees Demo Market status + formula weights.
10. **(Future) League import:** logs in → connects Sleeper → picks league → roster becomes Portfolio holdings → portfolio dashboard shows aggregate value, risk, and this week's roster movers.
11. **(Future) AI market summary:** post-tick job generates "Your market brief" for account holders → cached brief renders on dashboard with AI badge + confidence.
12. **(Future) Receipt:** on a stock card, user taps "Make a call" → picks Buy + horizon 60 days → receipt stored with price-at-call → outcome auto-graded later → shareable receipt card.

---

## 20. Component System

Reusable components, named for the codebase. Props sketched; full typing in build phase.

**Layout & chrome**

| Component | Notes |
|---|---|
| `AppShell` | Theme provider, layout grid, banner slot, nav slots |
| `TopNav` | Desktop nav + search + FormatRibbon |
| `BottomNav` | Mobile 5-tab bar, active-state, safe-area padding |
| `MarketHeader` | Date, tick time, DataModeBadge, freshness |
| `FormatRibbon` | Current format + toggle sheet |
| `DataModeBanner` | Demo/live/mixed mode, persistent, links to methodology |
| `DataFreshnessBadge` | Fresh/Recent/Stale/Outdated pill, tooltip w/ timestamp |
| `PageContainer`, `SectionRail` | Spacing + horizontal-scroll rails |

**Market primitives**

| Component | Notes |
|---|---|
| `TickerChip` | Mono ticker + optional Δ |
| `MarketPriceBadge` | Large price, one-decimal, band-aware styling |
| `MovementBadge` | Δ + arrow + sign + color; `window` prop (24H/7D/30D) |
| `SignalBadge` | Signal enum styling + confidence dot; tap → explanation popover |
| `AssetClassTag` / `MarketTag` | Class vs condition tags, tooltip defs |
| `VolatilityMeter` | 4-segment meter + label |
| `MispricingMeter` | Diverging bar centered at 0, signed value, band label |
| `RiskBreakdown` | Composite + six sub-risk bars |
| `Sparkline` | Inline SVG, 7D/30D, no axes, a11y label |
| `PriceChart` | Full chart, range tabs, catalyst event markers, crosshair |
| `ConfidencePill` | Low/Med/High |

**Composite**

| Component | Notes |
|---|---|
| `PlayerAvatar` | Initials on team-color-inspired gradient (§15.3) |
| `PlayerMarketRow` | Desktop table row |
| `PlayerMarketCard` | Mobile board card |
| `MoverRow` | Dashboard panel row (avatar, Δ, sparkline, catalyst headline) |
| `MarketMoversPanel` | Titled panel + rows + "view all" filter link |
| `PlayerStockCard` | Full detail composition (§23) |
| `CatalystList` / `CatalystItem` | Timeline w/ direction icons, magnitude, date |
| `RiskFactorList` | Named risks + one-liners |
| `BullBearCard` | Paired bull/bear case |
| `MarketThesisCard` | Structured thesis + generator badge |
| `StatsSnapshot`, `GameLogTable` | Compact stats, responsive collapse |
| `WatchlistButton` | Add/remove, toast, price-at-add capture |
| `WatchlistRow` | Since-added Δ emphasis |
| `PortfolioSummary`, `AllocationChart`, `HoldingRow` | Portfolio page |
| `SearchOverlay` | Name/ticker fuzzy search, keyboard nav |
| `FilterBar`, `SortMenu`, `FilterChip` | URL-synced controls |
| `ShareCardPlaceholder`, `CompareButtonPlaceholder` | Disabled-state buttons with "coming soon" tooltips |

**States**

`EmptyState` (illustration + teaching copy + CTA), `LoadingSkeleton` (per row/card/chart shape), `ErrorState` (what happened + retry), `MockDataWarningBanner` (= DataModeBanner demo variant), `MethodologyExplainer` (inline "?" popover linking to methodology anchors).

Component rules: every value-bearing component accepts `lastUpdated` and `dataMode` and renders context when space allows; every color-coded state has a non-color signifier; every metric component exposes an `onExplain` affordance.

---

## 21. Visual Design System

**Feel:** premium fantasy-fintech terminal. Sleeper-grade polish (vibe reference only), Robinhood-grade clarity, a controlled shot of Bloomberg energy. Dark-first. Numbers are the heroes. Nothing casino.

### 21.1 Palette

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0A0E1A` | App background (deep navy, not pure black — keeps charts and glows readable) |
| `bg-surface` | `#111827` | Cards, panels |
| `bg-elevated` | `#1A2333` | Popovers, sticky headers, hover surfaces |
| `border-subtle` | `#232D42` | Hairlines, dividers |
| `accent-up` | `#2DD4A7` | Market teal — positive movement, primary accent, CTAs |
| `accent-down` | `#F0526A` | Controlled red-rose — negative movement (tuned to pass contrast on `bg-surface`, distinct from pure error red) |
| `accent-secondary` | `#7C8CF8` | Violet-blue — links, selected states, secondary data series |
| `warning` | `#F5B34D` | Amber — staleness, overheated, caution tags |
| `text-primary` | `#EDF1F7` | Off-white |
| `text-secondary` | `#95A1B8` | Cool gray labels, metadata |
| `text-muted` | `#5C6880` | Timestamps, disabled |

Rules: teal/red are reserved for *movement and signals* — never decorative. One accent per component. No gradients except player avatars and the mispricing meter's diverging fill. No neon overload: glow effects limited to the live-tick pulse on the dashboard header and price-change flashes.

### 21.2 Typography

| Role | Face | Notes |
|---|---|---|
| Display / headlines | **Space Grotesk** | Technical-modern character; used for page titles, hero, price blocks |
| Body / UI | **Inter** | Workhorse; 14–16px base, 1.5 line height |
| Tickers & numbers | **IBM Plex Mono** | All tickers, prices, deltas, table numerics — with `font-variant-numeric: tabular-nums` so columns align and price changes don't jitter layout |

Type scale (px): 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48. Numbers in tables never below 14. Ticker chips always mono, always uppercase, always letter-spaced +0.05em.

### 21.3 Spacing, shape, elevation

- 4px base unit; component padding in 8/12/16/24 steps; section gaps 32/48.
- Border radius: 10px cards, 8px controls, 999px pills/badges. One radius language, no mixing sharp+round.
- Elevation via border + subtle shadow (`0 4px 24px rgb(0 0 0 / 0.35)`) — dark UIs read elevation from borders more than shadows.
- Cards: `bg-surface` + `border-subtle` 1px; hover raises to `bg-elevated` with 120ms ease.

### 21.4 Iconography

Single stroke-icon set (Lucide-style), 1.5px stroke, 18/20px sizes. Directional movement always icon + sign + color (▲ +2.1 / ▼ −1.8). Position glyphs (QB/RB/WR/TE) as small squared monogram chips with per-position hue (steel blue QB, amber RB, teal WR, violet TE) — desaturated so they never compete with movement colors.

### 21.5 Charts

- Sparklines: 2px stroke, current-trend color, no axes, endpoint dot, area fill at 8% opacity.
- Full price chart: line + soft area, dotted baseline at range-open price, catalyst markers as small diamonds on the line (tap → catalyst popover), crosshair with date+price flag, range tabs (7D/30D/Season/All).
- Y-axis auto-fit with padding; never trick-scale to exaggerate moves — a 1-point move should look small. Honest axes are a trust feature.

### 21.6 Motion

- Standard: 120–200ms ease-out. Price update: brief background flash (teal/red at 12% opacity, 400ms decay) + number crossfade. Sparklines draw-in on first paint only (600ms). Filter changes: list FLIP-reorder ≤ 200ms.
- Prohibited: confetti, slot-machine counters, pulsing CTAs, parallax. `prefers-reduced-motion` disables all non-essential animation (§31).

### 21.7 Mobile layout principles

390px design target. Bottom nav + thumb-reach primary actions. Board = cards, never a squeezed table. Panels = swipeable rails with edge-peek affordance. Sticky compact header (format + data mode) collapses on scroll. Tap targets ≥ 44px.

### 21.8 Signature element

**The Tape**: a persistent, slowly scrolling ticker strip (landing hero + dashboard header) of `TickerChip + MovementBadge` pairs driven by the demo tick. It is the product's identity in one glance — players moving like a market — and it doubles as navigation (every chip is a deep link). It pauses on hover/touch, respects reduced motion (becomes a static grid), and never autoplays faster than readable.

### 21.9 Accessibility contrast rules

All text ≥ 4.5:1 against its surface (the palette above is pre-checked for `text-secondary` on `bg-surface`); movement colors carry redundant arrows/signs; focus rings 2px `accent-secondary` on all interactives. Full a11y spec in §31.

---

## 22. UX and Interaction Design

Restating the binding UX principles with interaction specifics:

1. **5-second comprehension:** landing hero passes a hallway test — headline + moving tape must communicate "players as a market" before any scrolling.
2. **Value before login:** zero auth walls in MVP; later, auth prompts appear only at persistence boundaries ("Save this watchlist to your account?"), never at read boundaries.
3. **Screenshot-worthy card:** the stock card's top fold (identity + price + chart + signal) composes cleanly at 390×~700 with format label and data-mode badge baked in.
4. **Every number has a reason:** all metric components expose tap/hover explanation; two levels — tooltip definition, then methodology deep link.
5. **Every signal has an explanation:** SignalBadge popover shows explanation + top factors + confidence; no bare "Strong Buy" anywhere.
6. **Metaphor with a job:** each market element maps to a fantasy decision (mispricing→trade target, volatility→start/sit trust, catalysts→news triage). Anything that doesn't map gets cut in review.
7. **No fake certainty:** confidence pills everywhere signals appear; Low-confidence signals render visually muted; copy uses "may/appears," never "will."
8. **Mobile first:** every spec above defines mobile before desktop; QA runs mobile first (§37).
9. **Tables desktop / cards mobile:** breakpoint at 768px; identical data + controls both modes.
10. **Fast, obvious filters:** one-tap filter bar, chips show active state, URL-synced, reset always visible when filters active.
11. **Teaching empty states:** every empty state names the action and offers a one-tap example ("Watch today's top riser").
12. **Visible freshness:** timestamp or freshness badge within the visual field of every price.
13. **Labeled mock data:** DataModeBanner + per-card demo badges; screenshots carry the badge automatically.
14. **Format always known:** FormatRibbon pinned; format baked into shareable surfaces.

Interaction details: optimistic UI for watchlist toggles with toast confirmation; back-navigation restores board scroll + filters; search opens with `/` key on desktop; long-press on mobile cards opens a quick-action sheet (Watch / Compare-soon / Share-soon).

---

## 23. Player Stock Card Specification

Layout, top to bottom (mobile single column; desktop two-column with chart+thesis left, meters+catalysts right):

1. **Identity header** — `PlayerAvatar` (initials on team-inspired gradient), name, `TickerChip`, Pos · Team · Age, position glyph. Right-aligned: `WatchlistButton`, overflow menu (Share soon / Compare soon).
2. **Price block** — Market Price (48px mono), 24H `MovementBadge`, secondary row: Model Value (fundamental), Overall Rank, Pos Rank. `DataFreshnessBadge` + demo badge adjacent to price — context is physically attached to the number.
3. **Price chart** — `PriceChart` with range tabs, catalyst diamonds, since-added marker if watchlisted.
4. **Signal block** — `SignalBadge` + `ConfidencePill` + explanation sentence + expandable supporting factors / risk factors lists.
5. **Meter row** — `MispricingMeter`, `VolatilityMeter`, Risk composite (tap → `RiskBreakdown` sheet).
6. **Class & tags** — `AssetClassTag` + up to 3 `MarketTag`s with tooltips.
7. **Catalysts** — `CatalystList` timeline, newest first, 5 visible + expand.
8. **Bull / Bear** — paired `BullBearCard`.
9. **Market Thesis** — `MarketThesisCard`, structured 5-part thesis + generator badge.
10. **Stats** — `StatsSnapshot` (PPG, snap %, opportunity metrics per format) + `GameLogTable` (last 6, collapsible).
11. **Format notes** — 1–2 lines: how value differs in Redraft / 1QB ("In 1QB, ALN drops from 96 to 78 — QB scarcity premium removed").
12. **Footer** — fictional-value + not-advice micro-disclaimer, methodology link, lastUpdated.

Rules: top fold (1–4) is the screenshot unit; everything below is scroll. All sections render skeletons independently. Direct URL `/player/JJF` must render fully server-less from bundled demo data.

---

## 24. Market Board Specification

- **Data grid (desktop ≥ 768px):** virtualized table, sticky header, default sort Market Price ↓. Column set per §18.3 with preset groups (Movement/Value/Risk). Row height 52px, zebra-free (borders only), hover elevate. Click anywhere on row → stock card; watch icon at row end.
- **Card list (mobile):** virtualized, card spec per §18.3, pull-to-refresh re-runs the tick check.
- **Controls contract:** search (name/ticker, fuzzy, ≥ 2 chars), filters (Position multi-select chips, Team dropdown, Asset Class, Tag, Signal), FormatRibbon, sort menu, reset. All state → URL params; hydrate on load; shareable filtered links are a growth feature, treat as first-class.
- **Counts & feedback:** results count always visible ("38 players match"); zero-results state suggests removing the most restrictive filter by name.
- **Ranking display:** Overall Rank and Pos Rank derive from Market Price within the active format — recomputed on format switch, never stored cross-format.
- **Performance budget:** initial board paint < 1.5s on mid-tier mobile; sort/filter interaction < 100ms; scroll 60fps with 150 rows (virtualization keeps DOM ≤ ~30 rows).

---

## 25. Watchlist and Portfolio Specification

### 25.1 Watchlist (P0)

- **Storage:** local storage key `pt.watchlist.v1`: array of `{ playerId, addedAt, priceAtAdd, formatAtAdd }`. Versioned for future account migration (import-on-signup path already shaped).
- **Capture semantics:** price-at-add is recorded in the format active at add time and displayed with that format label; switching formats shows a notice rather than silently recomputing the baseline.
- **List view:** rows with current price, Δ since added (abs + %), sparkline windowed from `addedAt`, signal badge. Header: biggest riser / biggest faller since added. Sort: by Δ since added (default), price, date added.
- **Limits:** soft cap 50 players (UI nudge, not hard block).
- **Alerts:** visible but disabled control — "Price alerts arrive with accounts" — validating demand via tap analytics.
- **Empty state:** teaching copy + one-tap "Watch today's top riser."

### 25.2 Fantasy Portfolio (MVP: conceptual; full: P1)

- MVP scope: manual holdings in local storage (`pt.portfolio.v1`), single portfolio, no lots/quantities — a holding is binary (you roster him or you don't), because fantasy rosters aren't share counts. Metrics: total value (Σ prices), position allocation, team exposure (flag > 3 same-team holdings as concentration note), risk distribution, top 5 holdings, riskiest 3, portfolio trend (Σ of holdings' daily history).
- Labeled "Portfolio (beta) — manual tracking. League import coming."
- P1: Sleeper league import maps rosters → holdings via the identity table; multiple portfolios (one per league, format auto-detected from league settings); portfolio-level movers ("your roster's week").
- Explicit non-goal: no simulated buying/selling with balances. The portfolio mirrors reality; it is not a trading game.

---

## 26. Receipts / Prediction System (Future Feature, P1-design/P2-build)

**Concept:** users make market calls; the system grades them. This converts consumption into skin-in-the-game (reputational, never monetary) and generates the most shareable artifact in fantasy: proof you called it.

- **Call types:** Buy, Sell, Hold, Fade, Breakout, Bust, Top-12 positional finish, Value Crash (−20 within horizon), Value Spike (+20 within horizon), Rookie Breakout, Veteran Decline.
- **Receipt record:** player, call type, horizon (30/60/90 days or season-end), price-at-call, format, timestamp, optional 140-char rationale.
- **Grading:** deterministic rules per call type against market history (e.g., Buy grades on Δ ≥ +8 at horizon; Top-12 grades on end-of-season positional rank). Outcome states: Open → Hit / Miss / Push. No manual grading.
- **Profile stats:** accuracy %, average return per call, best call, current streak, position-specific accuracy.
- **Shareable receipt card:** stamped visual (call, entry price, current/final price, elapsed time, outcome seal) — format-labeled, demo/live-labeled.
- **Safety rails:** requires accounts; strictly reputational; leaderboards opt-in; copy never uses wager language; a "graded on fictional value index" footnote on every receipt.
- **Why it matters:** receipts are also a *data asset* — aggregate call flow becomes a genuine sentiment input to the market engine (disclosed in methodology when activated).

---

## 27. Data Models

TypeScript-shaped interfaces. These are the contracts the mock service and future live services both implement.

```ts
// ---------- Identity ----------
interface PlayerIdentity {
  internal_id: string;          // "pt_0042" — system of record, never changes
  sleeper_id?: string;
  gsis_id?: string;             // NFL GSIS, key for nflverse joins
  espn_id?: string;
  sportradar_id?: string;
  fantasypros_id?: string;      // stored for user-supplied cross-refs only; never scraped
  yahoo_id?: string;
  name_normalized: string;      // lowercase, diacritics stripped, suffixes removed ("kenneth walker iii" -> "kenneth walker")
  aliases: string[];            // "Hollywood Brown" etc.
}

interface Player {
  identity: PlayerIdentity;
  displayName: string;
  ticker: string;               // unique, 3 chars
  position: 'QB' | 'RB' | 'WR' | 'TE';
  team: string;                 // "DET" — plain text abbreviation, no marks
  age: number;
  birthdate: string;            // ISO
  yearsExperience: number;
  status: 'active' | 'injured' | 'suspended' | 'inactive';
  avatarSeed: string;           // drives initials-gradient avatar
}

// ---------- Market ----------
type FormatKey = 'dyn_sf_half' | 'dyn_sf_ppr' | 'dyn_1qb_half' | 'dyn_1qb_ppr'
               | 'rd_sf_half'  | 'rd_sf_ppr'  | 'rd_1qb_half'  | 'rd_1qb_ppr'; // ship 6–8, default dyn_sf_half

interface PlayerMarketSnapshot {
  playerId: string;
  format: FormatKey;
  date: string;                       // daily close, ISO date
  marketPrice: number;                // 0–100, 1 decimal
  fundamentalValue: number;           // "Model Value"
  mispricing: number;                 // −100..+100
  overallRank: number;
  positionRank: number;
  movement: { d1: number; d7: number; d30: number; season: number; allTime: number };
  volatility: number;                 // 0–100
  riskScore: number;                  // composite 0–100
  riskBreakdown: Record<'injury'|'age'|'role'|'offense'|'efficiency'|'hype', number>;
  assetClass: AssetClass;
  tags: MarketTagId[];
  confidence: number;                 // 0–100 internal; banded in UI
  lastUpdated: string;                // ISO timestamp
  dataMode: 'demo' | 'live' | 'mixed';
  snapshotHash: string;               // cache key for thesis generation
}

interface PlayerMarketHistoryPoint {
  playerId: string; format: FormatKey; date: string;
  marketPrice: number; fundamentalValue: number;
}

type AssetClass = 'blue_chip'|'growth_stock'|'rookie_ipo'|'dividend_veteran'
                | 'volatile_asset'|'penny_stock'|'standard_asset';

type MarketTagId = 'meme_stock'|'falling_knife'|'overheated'|'buy_low_window'
                 | 'injury_discount'|'age_cliff'|'breakout_watch'|'volume_king'
                 | 'touchdown_bubble'|'role_spike'|'hype_stock'|'contract_fog'|'qb_downgrade';

interface MarketSignal {
  playerId: string; format: FormatKey;
  signal: 'strong_buy'|'buy'|'speculative_buy'|'hold'|'monitor'|'sell'|'strong_sell'|'avoid';
  confidence: 'low'|'medium'|'high';
  explanation: string;                // 1–2 sentences
  supportingFactors: string[];        // 2–4
  riskFactors: string[];              // 1–3
  ruleFired: string;                  // which §12.10 rule — auditability
  lastUpdated: string;
}

interface MarketCatalyst {
  id: string; playerId: string;
  type: CatalystType;                 // controlled vocabulary, §11.9
  direction: 'bullish' | 'bearish';
  magnitude: 'minor' | 'moderate' | 'major';
  date: string;
  headline: string;                   // ≤ 12 words
  detail: string;
  affectedScores: string[];           // e.g. ["opportunity","roleSecurity"]
  sourceNote: 'authored_demo' | 'ingested' | 'admin';
}

interface RiskFactor {
  playerId: string;
  type: 'injury'|'age'|'role'|'offense'|'efficiency'|'hype';
  score: number; headline: string; detail: string;
}

// ---------- Stats ----------
interface PlayerStatsSeason {
  playerId: string; season: number; games: number;
  ppg: Record<'ppr'|'half_ppr', number>;
  snapPct?: number; targetShare?: number; carryShare?: number;
  redZoneShare?: number; yardsPerRouteRun?: number; yardsPerCarry?: number;
  passingYards?: number; passingTds?: number; rushYards?: number;
  recYards?: number; receptions?: number; totalTds?: number;
  isMock: boolean;
}

interface PlayerStatsGameLog {
  playerId: string; season: number; week: number; opponent: string;
  fantasyPoints: Record<'ppr'|'half_ppr', number>;
  keyLine: string;                    // "7 rec, 104 yds, 1 TD"
  isMock: boolean;
}

// ---------- User-side (local storage in MVP) ----------
interface WatchlistItem {
  playerId: string; addedAt: string;
  priceAtAdd: number; formatAtAdd: FormatKey;
}

interface Portfolio {
  id: string; name: string; format: FormatKey;
  createdAt: string; source: 'manual' | 'sleeper_import' | 'espn_import' | 'yahoo_import';
  holdings: PortfolioHolding[];
}
interface PortfolioHolding { playerId: string; addedAt: string; priceAtAdd: number; }

interface UserPrediction {                 // "Receipt" — P1/P2
  id: string; userId: string; playerId: string; format: FormatKey;
  callType: 'buy'|'sell'|'hold'|'fade'|'breakout'|'bust'|'top12_finish'
          | 'value_crash'|'value_spike'|'rookie_breakout'|'veteran_decline';
  horizon: '30d'|'60d'|'90d'|'season';
  priceAtCall: number; rationale?: string; createdAt: string;
  outcome: 'open'|'hit'|'miss'|'push'; gradedAt?: string; returnDelta?: number;
}

// ---------- System ----------
interface DataSourceStatus {
  sourceId: string; label: string;
  mode: 'mock' | 'live' | 'disabled';
  lastSuccessfulUpdate?: string;
  coverage: string;                   // "150 players, values only"
  health: 'ok' | 'degraded' | 'down';
}

interface AIAnalysisCache {
  playerId: string; format: FormatKey; snapshotHash: string;
  generator: 'template' | 'ai'; modelVersion: string;
  thesis: { valueSummary: string; whyMoving: string; bullCase: string; bearCase: string; verdict: string };
  confidence: 'low'|'medium'|'high'; insufficientData: boolean;
  citedFields: string[]; generatedAt: string;
}
```

**Identity mapping is load-bearing.** Every future integration joins on this table. Rules: `internal_id` is permanent; external IDs are added, never repurposed; name matching is a *suggestion* pipeline into the admin resolution queue (§18.8), never an auto-merge; unresolved players quarantine rather than duplicate.

---

## 28. Mock Data Plan

### 28.1 Pool composition (target ~120 players)

| Segment | Count | Purpose |
|---|---|---|
| Elite anchors (QB/RB/WR/TE studs) | 15 | Blue Chips; sanity-check the top of the scale |
| Strong starters | 35 | The board's meat; realistic mid-tier gradients |
| Rookie IPOs | 15 | Rookie handling, Low confidence, high volatility |
| Injured / Injury Discounts | 10 | Injury multiplier + buy-low mechanics |
| Aging veterans / Age Cliffs | 12 | Age curve + Dividend Veteran class |
| Breakout candidates | 12 | Positive mispricing, Breakout Watch |
| Volatile / TD-dependent | 10 | Volatility + Touchdown Bubble |
| Deep stashes / Penny Stocks | 11 | Bottom of scale, empty-ish cards handled gracefully |

Positional mix ≈ 20 QB / 35 RB / 45 WR / 20 TE. Real player names with clearly labeled mock values (factual name use per §15.4); every stat line flagged `isMock: true`.

### 28.2 Seed table excerpt (authoring targets, dyn·SF·½PPR)

| Player | Ticker | Pos | Class | Price | Mispricing | Signal | Story |
|---|---|---|---|---|---|---|---|
| Josh Allen | ALN | QB | Blue Chip | 96.8 | −3 | Hold | SF QB1 anchor; stability reference |
| Ja'Marr Chase | JMC | WR | Blue Chip | 95.1 | +2 | Hold | Top-of-market calm |
| Bijan Robinson | BIJ | RB | Blue Chip | 93.4 | −8 | Hold | Slightly rich; tests negative mispricing on an elite |
| Justin Jefferson | JJF | WR | Blue Chip | 92.7 | +6 | Hold | Quiet drift up |
| Jahmyr Gibbs | GIB | RB | Growth Stock | 88.2 | +8 | Buy | Red-zone catalyst arc |
| Malik Nabers | NAB | WR | Growth Stock | 84.5 | +14 | Buy | The demo Buy-Low arc (injury recovery) |
| Brock Bowers | BOW | TE | Growth Stock | 82.0 | −18 | Sell | Overheated TE hype; Sell on a good player — proves signals aren't popularity |
| Ashton Jeanty | JTY | RB | Growth Stock | 80.6 | +4 | Hold | Second-year settling |
| (Rookie WR example) | — | WR | Rookie IPO | 55–65 | ±0 | Speculative Buy | Low-confidence rookie mechanics |
| (Aging RB example) | — | RB | Dividend Veteran | 45–55 | −22 | Sell | Age Cliff + name-value gap |
| (TD-spike WR) | — | WR | Volatile Asset | 58 | −27 | Strong Sell | Touchdown Bubble showcase |
| (Injured WR1) | — | WR | Standard | 70 | +24 | Strong Buy | Injury Discount showcase |

Authoring rule: the mock pool must contain at least one clean exemplar of **every** asset class, tag, signal, and confidence band, so QA can visually verify all component states with real routes instead of storybook fixtures.

### 28.3 History & catalysts

- 120 days of daily history per player per format, generated by running the actual market engine over an authored **event calendar** (~60 scripted catalysts across the pool: injuries, role changes, hype waves, coaching news). Charts, catalysts, and theses therefore *agree by construction* — no hand-drawn squiggles that contradict the story.
- The §11.11 deterministic tick extends this history forward daily from launch.
- Plausible 2025-season-style stat lines authored per player (marked mock); rookie entries carry draft-capital fields instead of stats.

### 28.4 Honesty requirements

- Every mock surface inherits `dataMode: 'demo'` → banner + badges render automatically.
- Mock values are calibrated to be *directionally sane* (no WR3 priced above elite QBs in SF) — realistic enough to test judgment-dependent UI, labeled clearly enough that no one mistakes it for current intel.
- Do not date-stamp mock stats as "this week." Stats display shows "2025 season (demo data)."

---

## 29. Technical Architecture Recommendation

### 29.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **React 18 + Vite + TypeScript** | MVP is a fully static SPA (no server required for demo data); Vite = fastest DX. |
| Styling | **Tailwind CSS** + design tokens (§21) as Tailwind theme extension | Enforces the token system in code |
| Routing | React Router, URL-state for board filters | Deep links are a product feature |
| Charts | **Custom SVG sparklines** (tiny, everywhere) + **Recharts** on the detail chart only | Keeps bundle small; Recharts pulled in lazily on the player route |
| State | Local component state + a thin store (Zustand) for watchlist/portfolio/format | No server state in MVP |
| Persistence | localStorage (versioned keys) | §25 |
| Hosting | **Cloudflare Workers static assets** (or Pages) | Free tier, global edge, and — decisively — a native path for the future backend: Workers API routes + **Cron Triggers** for scheduled market ticks/AI batches + KV/D1 for storage. The MVP's static deploy and the P1 backend live on one platform. |
| Future backend | Cloudflare Workers (Hono) + D1/KV, or Supabase if relational needs grow | API keys live server-side only, ever |

(If the team prefers Next.js, the design is compatible — but MVP needs no SSR, and a SPA keeps the mock→live seam cleanest. Decide once, before build.)

### 29.2 Folder structure

```
src/
├── app/                  # shell, routing, providers, theme
├── pages/                # landing, market, board, player, watchlist, portfolio, methodology
├── components/           # per §20, grouped: chrome/, market/, composite/, states/
├── services/
│   ├── marketData/       # MarketDataService interface
│   │   ├── mock/         # MockMarketDataService + demo tick engine
│   │   └── live/         # (future) LiveMarketDataService
│   ├── marketEngine/     # formula: subscores, fundamental, marketValue, mispricing,
│   │                     # signals, tags, confidence — pure functions, config-driven
│   ├── thesis/           # ThesisGenerator interface; templateGenerator; (future) aiGenerator
│   └── storage/          # watchlist/portfolio persistence, versioned migrations
├── data/                 # mock pool, event calendar, seeded history (generated JSON)
├── config/               # formula weights, signal thresholds, tag rules, format defs
├── lib/                  # formatting, date, hashing, prng (seeded)
└── styles/               # tokens, globals
scripts/
└── generate-mock-history.ts   # runs marketEngine over event calendar → data/
```

### 29.3 Key architectural rules

- **`MarketDataService` is the only door.** UI imports the interface; a provider swaps mock↔live. Signature sketch: `getBoard(format, filters)`, `getPlayer(ticker, format)`, `getMovers(format)`, `getHistory(playerId, format, range)`, `getSourceStatus()`.
- **The market engine is pure and shared.** The same functions generate mock history (build-time script), the demo tick (runtime), and future live recalculation (scheduled Worker). One formula, three call sites, zero drift.
- **Config over code** for weights/thresholds — printed on the methodology page *from the same config file* so docs can't lie.
- **No API keys client-side, ever.** MVP has none; the rule is written now so P1 doesn't violate it.
- **Charting strategy:** sparkline component is dependency-free SVG (~1KB); route-split the detail chart.
- **Responsive strategy:** Tailwind breakpoints, 768px table/card switch, container queries where card density varies.
- **Error/loading/empty:** every data-consuming component renders through a `<QueryBoundary>` providing skeleton/error/empty per §20.
- **Testing priorities (ordered):** (1) market engine unit tests — formula math, signal rules, edge populations (§12.8), hysteresis; (2) demo tick determinism (same date+seed → same prices across machines); (3) watchlist persistence + versioned migration; (4) board filter/sort/URL-sync; (5) a11y smoke (axe) on the four core pages; (6) visual regression on the stock card.
- **Deployment:** static build → Cloudflare; preview deploys per branch; the daily tick needs no deploy (computed client-side from date+seed); when live data arrives, Cron Trigger publishes snapshot JSON to KV and the service reads it — same UI.

---

## 30. Performance Requirements

- **Initial load:** ≤ 150KB gz JS on the critical path (landing/dashboard); demo dataset ships as route-split JSON (~200–400KB total, board loads its slice); LCP < 2.0s on mid-tier mobile, Lighthouse mobile ≥ 90.
- **Board:** virtualization mandatory; never mount 150 full cards; sort/filter < 100ms; no layout shift on price flash (tabular-nums + fixed badge widths).
- **Charts:** sparklines are static SVG paths (precomputed points); detail chart lazy-loaded; history capped to displayed range.
- **No AI/API calls on page view** — structurally impossible in MVP (no calls exist); enforced by rule for P1 (cache-only reads on view).
- **No waterfalls:** each route needs at most one data read from the service layer.
- **Caching:** immutable asset hashing; demo data JSON cache-busted only on deploys; future live snapshots served with short max-age + ETag.

## 31. Accessibility Requirements

- WCAG 2.1 AA contrast (§21.9); palette pre-verified for text tokens on surfaces.
- **Never color-only:** movement = arrow + sign + color; signals = text label; meters = segment count + text band.
- Full keyboard support: logical tab order, visible 2px focus ring, `/` opens search, Escape closes overlays, table rows and cards focusable with Enter-to-open.
- Screen readers: board renders as a real `<table>` with headers on desktop; mobile cards use labeled groups; sparkline `aria-label` = "30-day trend: up 4.2 points"; live price flashes are `aria-live="off"` (decorative), values themselves readable.
- Tap targets ≥ 44px; bottom-nav safe-area insets.
- `prefers-reduced-motion`: tape becomes static grid, flashes and draw-ins disabled, FLIP reorder replaced by instant swap.
- Semantic HTML: landmarks per page, one `h1`, buttons are `<button>`, links are `<a>`.
- Responsive text: rem-based scale, supports 200% browser zoom without horizontal scroll on core pages.
- Loading states announced ("Loading market data") via polite live region.

## 32. Trust and Transparency Requirements

Every value surface renders (or is one tap from) the full trust context:

```
Market Price: 82.4      Model Value: 88.1     Mispricing: +14 (Undervalued)
Format: Dynasty · Superflex · Half-PPR
Updated: Jul 9, 2026 · Fresh          Confidence: Medium
Data Mode: Demo Market — simulated data
Signal: Buy — rule M2 (mispricing ≥ +12, risk ≤ 70)   [How is this computed?]
```

Requirements checklist: visible format ✓ (ribbon + baked into cards) · lastUpdated ✓ (badge) · source status ✓ (methodology panel) · confidence ✓ (pill) · mock/live ✓ (banner + badges) · formula ✓ (methodology from live config) · signal reasoning ✓ (`ruleFired` + explanation) · **what we cannot know** ✓ (methodology section listing: practice reports, locker-room intel, coach intentions, future injuries — named explicitly) · missing data ✓ ("No route data for this player" rendered, never silently omitted) · interpretation guidance ✓ (bands tables + not-advice framing).

Anti-patterns banned: precision theater (no fake decimals beyond one), silent recalculation baselines, chart axis manipulation, undated values, unexplained signal flips (hysteresis §12.10 + catalyst required for major moves).

---

## 33. Content and Copywriting System

**Voice:** sharp, fluent in fantasy, confident without promising outcomes. Reads like the smartest manager in your league, not a brokerage and not a bro. No exclamation points in product UI. No gambling vocabulary (§15.7).

**Hero headline options** (A/B candidates):
1. Fantasy football has a market. Track it. *(primary)*
2. Player values move every day. See it happen.
3. Know what moved before your league does.

**Taglines:** "The fantasy football market terminal." · "Movement, not rankings." · "Every value, explained."

**CTA labels:** View the Market · Track My Players · Open the Board · Watch Player · See Why · How This Is Computed · View All Movers

**Empty states:**
- Watchlist: "Nothing on your watchlist yet. Watch a player and we'll track value from the day you added them. Try today's top riser →"
- Board zero-results: "No players match. Removing the *Buy-Low Window* filter would show 42 more."
- Portfolio: "Add the players you roster to see your team as a portfolio — total value, risk mix, and what moved this week."

**Mock data disclaimer (banner):** "Demo Market — simulated player values for product preview. Not current player information. How this works →"

**Methodology page opener:** "No black box. Every price on PlayerTicker comes from a formula you can read on this page — the inputs, the weights, and the rules that assign every signal. Right now the market runs in demo mode: values are generated by our engine from simulated inputs so you can explore the product honestly before live data arrives."

**Buy signal example (NAB):** "Buy · Medium confidence. Nabers' market price is lagging his underlying profile — target share and route participation held elite through the injury window, but the market discounted him −9% over 30 days. Risks: re-injury, QB volatility."

**Sell signal example (BOW):** "Sell · Medium confidence. Bowers remains an elite young TE, but the market price now assumes a target ceiling his current route share doesn't support. Mispricing −18: paying tomorrow's price today. Risk of being wrong: role expands as designed."

**Player thesis example:** see §34.

**Data unavailable:** "We don't have route data for this player yet. Efficiency scoring is using positional averages, and confidence is reduced accordingly."

**Future AI disclaimer:** "This summary was AI-generated from PlayerTicker's structured market data. It explains the numbers on this page; it doesn't produce them. Confidence: Medium."

**Banned copy patterns:** "Invest in your fantasy future!", "Get rich in your league", "Can't-miss", "Lock", "Guaranteed", stock-bro slang (tendies, diamond hands), any 🚀 in product UI.

---

## 34. Example Player Stock Card

> **DEMO MARKET — simulated data for product preview. Not current player information.**

**Malik Nabers** `NAB` · WR · NYG · Age 23  — *Growth Stock* · Tags: `Buy-Low Window` `Injury Discount`

| | |
|---|---|
| **Market Price** | **84.5** ▲ +0.6 (24H) |
| Model Value | 91.2 |
| Overall Rank | #9 · WR4 |
| Movement | 24H +0.6 · 7D +2.3 · 30D **−7.8** |
| Signal | **Buy** · Confidence: Medium |
| Mispricing | **+14** — Undervalued |
| Volatility | 58 — High |
| Risk | 52 (top factors: Injury 68, QB/Offense 61) |
| Format | Dynasty · Superflex · Half-PPR |
| Updated | Jul 9, 2026 · Fresh · Demo Market |

**Catalysts**
- ▲ *Jul 6 — Cleared for full training camp participation* (major, bullish): removes the primary discount on the asset.
- ▼ *Jun 12 — Soft-tissue setback in OTAs* (moderate, bearish): triggered the −7.8 30-day slide; market overcorrected.
- ▲ *May 30 — Offense adds interior line help* (minor, bullish): environment score up.

**Risk factors:** Re-injury risk during camp ramp-up (Injury 68). Quarterback play caps efficiency ceiling (QB/Offense 61).

**Bull case:** Elite target-earner profile at 23; pre-injury route and target shares were top-5 at the position. If health holds, model value implies a return above 90 — a top-3 dynasty WR price.

**Bear case:** Soft-tissue injuries recur; a camp setback re-opens the slide, and the QB environment limits weekly ceilings enough to slow the recovery.

**Market thesis (Demo analysis · generated from mock data):** Nabers is priced at 84.5 after a 30-day, injury-driven decline of nearly 8 points, while his underlying profile — age, target dominance, route share — supports a model value of 91.2. The market moved on the June setback and hasn't fully repriced the July clearance. Bull case: health holds and the price closes the gap toward the model. Main risk: recurrence during camp. Verdict: **Buy, Medium confidence** — a live buy-low window on a premium young asset, not a lottery ticket.

**Format notes:** In Redraft · Half-PPR the injury discount weighs heavier (price 79.8); 1QB dynasty valuation nearly identical (WRs unaffected by SF toggle).

`[★ Watch NAB]` `[Compare — soon]` `[Share card — soon]`

*Market prices are fictional fantasy value indexes. Not financial advice, gambling, or betting.*

---

## 35. Feature Prioritization

### P0 — Required for MVP
Landing page · Market Dashboard · Player Market Board · Player Stock Card · Mock pool (~120) + seeded history + event calendar · **Demo daily tick** · Search/filter/sort with URL state · Market price + movement · Asset classes + tags · Buy/Hold/Sell signals w/ confidence + explanations · Mispricing score · Volatility + risk scores · Template-generated theses · Watchlist (local storage, since-added tracking) · Format ribbon w/ working toggles (6 precomputed combos) · Data freshness + Demo banners · Methodology page · Responsive design (mobile-first) · Component architecture per §20 · Accessibility baseline (§31).

### P1 — Strong post-MVP
User accounts + persistent watchlists (local→account migration) · Fantasy Portfolio full build · Sleeper API integration (metadata + trending → real sentiment) · Real stats ingestion (nflverse-style) via admin import pipeline (§18.8) · Scheduled recalculation (Cron Triggers) · Cached AI thesis generation behind ThesisGenerator interface · Compare players · Shareable player cards (rendered image w/ format + data-mode baked in) · Receipts v1 · Price alerts.

### P2 — Future expansion
ESPN/Yahoo league import · Trade analyzer (portfolio-vs-portfolio mispricing framing) · Draft assistant · Premium tier (AI roster analysis, advanced alerts) · Notifications/PWA push · Mobile app wrapper · Community sentiment surfaces · Multi-sport expansion · TE-premium/custom scoring.

### Not Now
Real-money features / gambling / betting — never · Scraping competitors — never · Full social network · Paid subscriptions before core value proven · League hosting/management · Live game-day scoring.

---

## 36. Build Roadmap

| Phase | Weeks | Deliverable | Exit criteria |
|---|---|---|---|
| 0. Foundations | 1 | Repo, tokens→Tailwind theme, AppShell, nav, routing, QueryBoundary, storage lib | Shell deployed to Cloudflare preview |
| 1. Market engine | 1–2 | Pure-function engine + config, unit tests, mock pool authoring, event calendar, `generate-mock-history` script, demo tick | Engine tests green; deterministic tick verified cross-machine |
| 2. Board + primitives | 1–2 | Market primitives (§20), Board (table + cards), filters/sort/URL sync, search | Board interactive < 100ms; mobile cards shipped |
| 3. Stock Card | 1–2 | Full detail page incl. chart, catalysts, thesis templates | §34 renders from live route; screenshot test passes |
| 4. Dashboard + Watchlist | 1 | Movers panels, watchlist w/ since-added, portfolio-beta page | Return-visit flow (#8, §19) works end-to-end |
| 5. Landing + Methodology + polish | 1 | Landing w/ Tape, methodology from config, a11y pass, perf pass, copy pass | Lighthouse ≥ 90 mobile; axe clean; QA §37 green |
| — MVP launch — | ~6–8 total | | |
| 6. P1 wave 1 | post-launch | Accounts, persistent watchlist, Sleeper metadata + trending | |
| 7. P1 wave 2 | | Stats ingestion + admin pipeline + scheduled recalc → **Live mode for real** | Demo banner retires per-source; mixed-mode notice correct |
| 8. P1 wave 3 | | AI thesis (cached), share cards, compare, Receipts v1 | |

---

## 37. QA Checklist

**Data honesty**
- [ ] Demo banner present on every value-bearing page; per-card demo badges render
- [ ] No string anywhere claims live/current data; grep for banned claims
- [ ] Every price shows lastUpdated + freshness within its visual group
- [ ] Format label visible on every value surface and baked into card top-fold
- [ ] Mock stats labeled "(demo data)"; no "this week" framing

**Market engine**
- [ ] Formula unit tests: weights sum, percentile bounds, format divergence (QB SF > 1QB), age curve direction, injury multipliers
- [ ] Rookies: confidence capped Low, volatility floor 60, Rookie IPO class
- [ ] Signal rule table matches §12.10 exactly; `ruleFired` populated; hysteresis prevents daily flip on ±3 noise
- [ ] Mispricing = 0 when FundamentalValue == MarketValue; symmetric clamps
- [ ] Deterministic tick: same date/seed → identical prices on two machines
- [ ] Every asset class, tag, signal, and confidence band has ≥ 1 exemplar in the pool (renders on a real route)

**UX**
- [ ] Landing 5-second test with 3 cold users
- [ ] Landing → specific player thesis in ≤ 3 taps
- [ ] Board filters/sort URL-sync; back restores scroll + filters
- [ ] Watchlist since-added math correct across format switch (notice shown, baseline preserved)
- [ ] Every metric has working explain affordance → correct methodology anchor
- [ ] Empty, loading, error states render for board, card, watchlist, portfolio

**Legal/safety**
- [ ] No NFL logos/marks/headshots anywhere incl. favicons and OG images
- [ ] Fictional-value + not-advice disclaimers on landing, methodology, card footer, legal page
- [ ] Banned-language grep (shares, wager, odds, cash out, guaranteed) returns zero

**Performance / a11y**
- [ ] Lighthouse mobile ≥ 90 on /market and /board
- [ ] 150-row board virtualized; no jank at 60fps scroll
- [ ] axe clean on 4 core pages; keyboard-only walkthrough of flows 2–8
- [ ] Reduced-motion verified (tape static, flashes off)
- [ ] Color-blind check: movement legible with color removed

---

## 38. Risks and Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Demo-market retention paradox** — users try it, realize values aren't real, don't return | High | High | The tick makes the loop testable, not the product durable. Treat MVP as a *validation instrument*: measure D1/D7 return + watchlist adds, and time the Sleeper/nflverse integration (Phase 7) as the true retention launch. Be explicit in messaging: "live data coming — demo shows you how it'll work." |
| 2 | Mispricing score is wrong often enough to destroy trust | Medium | High | Confidence caps, "may be" framing, hysteresis, and — before live launch — the §12.5 backtest. If backtests fail, mispricing demotes from headline metric to labeled experiment. Never ship a flagship number we haven't validated. |
| 3 | Stock metaphor reads as gambling to leagues/app stores/press | Medium | High | §15 language rules enforced by grep in CI; no odds/wager mechanics ever; methodology's not-gambling statement; receipts strictly reputational. |
| 4 | Legal exposure via player likeness or marks | Low (if rules followed) | High | §15.3–15.4 hard rules; QA gate; initials-avatar system designed to look premium so there's no temptation to "just use headshots." |
| 5 | Formula credibility attacks from sharp users ("your weights are arbitrary") | High | Medium | They are somewhat arbitrary at MVP — say so. Methodology publishes weights + changelog; frame v1 as opinionated and versioned; backtesting is the P1 answer. Transparency converts critics into contributors. |
| 6 | Format matrix complexity creep | Medium | Medium | Six precomputed combos, one ribbon control, no per-page format logic. New formats require config entries, not features. |
| 7 | Data-source ToS/licensing drift (Sleeper terms, dataset licenses) | Medium | Medium | License review checkpoint in Phase 6/7; DataSourceStatus tracks provenance; any source that can't be named publicly is out. |
| 8 | Sentiment feedback loop (our signals move our own sentiment input) | Low now, Medium at scale | Medium | Sentiment weight capped (5% MVP), mean-reversion damping in §12.5, disclosed in methodology when on-site behavior becomes an input. |
| 9 | Scope creep toward all-in-one fantasy platform | High | Medium | §9 anti-scope is a sign-off gate; roadmap phases are additive layers on one core, not new products. |
| 10 | Solo/small-team maintenance burden of authored catalysts pre-automation | Medium | Medium | Event calendar authored once for demo; live catalysts arrive with ingestion (Phase 7), not hand-writing news. |

---

## 39. Open Questions

1. **Name clearance:** trademark/domain search for "PlayerTicker" before brand investment. Fallback shortlist retained (§1).
2. **Default format bet:** Dynasty·SF·½PPR optimizes for early adopters; if analytics show heavy redraft traffic post-launch, does the default flip in-season? Decide with data at week 4.
3. **Mispricing validation bar:** what backtest threshold (hit rate / average forward return of +20 mispricing cohort) qualifies mispricing to keep flagship placement at live launch? Propose: positive-mispricing quintile must outperform negative quintile on 60-day forward Δ across two replayed seasons.
4. **Sleeper ToS confirmation** for trending-data usage at our display scale — verify current terms before Phase 6 build.
5. **Tick timing:** demo tick is date-based (midnight local vs UTC?). Recommend UTC 06:00 "market update" for consistency; confirm.
6. **Avatar system:** are initials-gradients premium enough, or budget a commissioned abstract-portrait illustration set for top 40 players (licensed original art)?
7. **Analytics stack:** privacy-respecting analytics (e.g., self-hosted) vs none at MVP — return-rate measurement is the whole point of the MVP, so something is required; choose tool.
8. **PWA at MVP?** Installability materially helps the daily-open habit; cost is small. Lean yes; confirm in Phase 5.

---

## 40. Final Implementation Notes for Claude Code

Read this section first when the build begins.

1. **Build order = §36.** Do not start with the landing page. Phase 1 (market engine + mock data) unblocks everything; the engine's pure functions and their tests are the foundation the whole product stands on.
2. **The engine is pure functions + one config file.** `config/market.ts` holds every weight, threshold, curve, and rule from §12. The methodology page imports and renders this config — documentation that cannot drift from behavior.
3. **One data door.** All UI reads through `MarketDataService`. If you find yourself importing from `data/` inside a component, stop — that's the seam that makes live data a service swap instead of a rewrite.
4. **Generate, don't hand-author, history.** `scripts/generate-mock-history.ts` runs the real engine over the authored event calendar. If a chart looks wrong, fix the calendar or the engine — never the JSON.
5. **Determinism is a feature.** The demo tick must be reproducible from (playerId seed, date). Write the cross-machine determinism test before the tick UI.
6. **Honesty surfaces are components, not copy.** DataModeBanner, DataFreshnessBadge, ConfidencePill, and format labels are structural — wired to data fields, not hardcoded strings. Flipping `dataMode` must reflow the entire honesty layer automatically.
7. **Every number's explanation ships with the number.** No metric component without an `onExplain` path. If §12 doesn't define a rule for something you're displaying, the display is wrong, not the doc — flag it.
8. **Screenshot test the stock card** at 390px against §34 as the acceptance fixture.
9. **Grep gates in CI:** banned monetary/gambling language (§15.7, §33), "live data" claims, NFL mark filenames.
10. **When in doubt:** movement over rank, honesty over polish, mobile over desktop, one explained number over three unexplained ones.

---

## Self-Audit Against the Quality Bar

- **Would a developer know what to build first?** Yes — §36 Phase 1, §40 note 1: engine before UI.
- **Would a designer know the look and feel?** Yes — tokens, type, motion, signature element, and per-page specs in §21–24.
- **Would a fantasy user understand why this is different?** Yes — movement + mispricing + explained signals vs static ranks (§7), reinforced in landing copy (§18.1, §33).
- **Does the metaphor improve decisions?** Yes, and it's enforced: every market element maps to a fantasy decision (§22.6); decorative metaphor is cut in review.
- **Is the MVP tight enough to build?** Yes — ~6–8 weeks, one format default with a constrained toggle, local-storage persistence, no backend.
- **Data limitations honest?** Yes — Demo Market banner system, freshness/confidence machinery, mock→live contract (§14).
- **Legal/licensing addressed?** Yes — §15 binding constraints + QA gates + CI greps.
- **AI responsible and realistic?** Yes — deterministic engine, AI as cached text layer with validation, template fallback (§16).
- **Mock vs live clearly separated?** Yes — `dataMode` field drives the honesty layer structurally (§40.6).
- **Addictive enough for repeat visits?** The demo tick makes the loop real in MVP; durable retention honestly depends on live data — named as risk #1 with a measurement plan (§38).
- **More than a rankings table?** Yes — rank is one column; the product is trend, gap, and explanation.

*End of DESIGN.md.*
