# WR_VALUATION_MODEL.md

**Document status:** Position-specific model specification. Version 1.0 (MVP specification).
**Governing authority:** `MARKET_MODEL_FOUNDATION_V2.md` (the Foundation). Where this document and the Foundation conflict, the Foundation controls without exception.
**Position scope:** Wide receivers, including rookie WRs and WRs changing teams. Excludes TEs, RBs with receiving roles, and WR-eligible gadget players rostered at other positions.
**Horizons:** Weekly, Rest of Season (ROS), One Year, Three Years, Dynasty.
**Reference league schema:** 12-team, PPR, 1QB / 2RB / 2WR / 1TE / 1FLEX (RB/WR/TE), standard bench. Half-PPR and standard scoring are supported through the per-target scoring vector in Section 12. The reference schema is a quotation convention, never a claim of universal value (Foundation P2).

---

## 1. Document Authority and Scope

### 1.1 What this document defines

This document defines the wide receiver position model: the estimands, signals, formulas, provisional weights, shrinkage rules, interactions, update rules, fallbacks, confidence contributors, volatility contributors, explanation drivers, validation plan, and MVP implementation specification needed to produce:

1. **Expected Fantasy Output (EFO)** for wide receivers — a probability distribution over future WR fantasy scoring per Foundation §4.1 — at all five horizons.
2. **Inputs to Fundamental Player Utility (FPU)** per Foundation §4.2: games-played distributions, role-survival probabilities, career-state transition inputs, and conditional upside/downside scenarios.
3. **WR-specific contributors** to the platform's uncertainty objects (Foundation §17) and volatility objects (Foundation §18).
4. **Structured explanation drivers** per Foundation §22.

### 1.2 What this document intentionally does not define

- **Observed Market Price** for any WR. Market estimation belongs to the market model and is forbidden here (Foundation §4.4, §24.1).
- **The common latent valuation unit implementation** (Foundation §5). This model supplies utility inputs; the latent mapping is platform-wide.
- **Mispricing classification** (Foundation §21). This model never compares its outputs to prices.
- **Replacement baselines and scarcity curves.** Those are league-schema properties (Foundation P15) computed by the shared utility layer; this model consumes them, documented in Section 13.
- **RB, QB, TE, pick, or package models.**

### 1.3 Foundation §2 Interpretation Rule — the ten answers

1. **Estimand:** the set of mathematical objects in Section 3, culminating in the WR Expected Fantasy Output distribution per horizon.
2. **Native unit:** fantasy points per game and per horizon window under a declared scoring vector; component states in probabilities and rates (routes/dropback, targets/route, yards/target, TD/target).
3. **Permitted inputs:** Tier 1 football data (Section 6), prospect priors, injury states, team context — all listed per signal in Section 5.
4. **Forbidden inputs:** current Observed Market Price, trade-calculator outputs, consensus rankings as price signals, social sentiment, market momentum, platform-published values, acquisition frequency, any information unavailable at valuation time (Foundation §24.1). Market sources may contribute only classified factual football events per Foundation §24.3.
5. **Conditioning:** league schema version, scoring vector, horizon, valuation timestamp, information cutoff timestamp.
6. **Uncertainty objects:** State Uncertainty and Forecast Uncertainty are produced directly; contributors to Intrinsic-Estimate Confidence, Data-Quality Confidence, and Explanation Confidence are emitted per Section 16.
7. **Downstream consumers:** Fundamental Player Utility only (for EFO); the confidence and volatility layers (for uncertainty contributors); the explanation layer (for drivers).
8. **Validation:** baselines, metrics, splits, and calibration targets in Section 21, complying with Foundation §25.
9. **Historical reproduction:** all inputs timestamped and versioned; point-in-time snapshots stored per Section 23.7; season replay per Foundation §25.7 is a deferred but planned requirement (Section 24).
10. **Explanation:** structured drivers and templates in Section 20, complying with Foundation §22.

### 1.4 Evidence-tag convention

Every material modeling choice in this document carries one Foundation §23.3 tag, abbreviated:

- **[ES]** Evidence Supported
- **[SPR]** Strong Public Research
- **[IC]** Industry Consensus
- **[EI]** Expert Informed
- **[PH]** Product Hypothesis
- **[TP]** Temporary Placeholder — carries a replacement criterion and must be calibrated before the model exits research status.

All numeric weights, shrinkage constants, caps, and age multipliers in this document are **[TP]** unless tagged otherwise. They are defensible starting values grounded in public research directionally, but none is a fitted production coefficient. The calibration path is defined in Section 21.

---

## 2. Wide Receiver Modeling Thesis

This section is binding. Every formula in this document must be traceable to one of these theses.

**T1 — Routes are the license to earn.** A wide receiver can only earn fantasy points on plays where he runs a route. Route participation is the necessary-condition gate (Foundation §12.3) beneath everything else. A WR with elite per-route skill and 40% route participation is capped by the 40%. [ES — mechanical identity, not an empirical claim]

**T2 — Target earning is the most predictive WR skill.** Targets per route run stabilizes faster than any production metric and carries the most forward-looking information about per-route value (Foundation P6). Earning targets against NFL coverage is a repeatable skill; catching a volatile share of deep balls is not. [SPR]

**T3 — Not all targets are equal.** A target's expected fantasy value varies roughly 3× by depth, field position, and catchability. End-zone and deep targets carry high expected value with high variance; short targets carry lower value with high completion probability. A model that counts targets without weighing them systematically misvalues deep threats and slot receivers in opposite directions. [SPR]

**T4 — Raw fantasy points are an outcome to explain, not a forecast.** Points bundle opportunity (repeatable), efficiency (partially repeatable), and touchdown variance (mostly noise at WR sample sizes). The model decomposes production into these components and forecasts each with its own persistence (Foundation §11.2). [SPR]

**T5 — Touchdowns require heavy regression.** WR touchdown rate per target is among the slowest-stabilizing metrics in football. Expected touchdowns from opportunity mix (end-zone targets, deep targets, team scoring environment) predict future touchdowns better than realized touchdowns do. [SPR]

**T6 — Efficiency matters, is real, and is noisy.** Yards per route run separates good receivers from role-holders, but a season of YPRR is heavily contaminated by target depth, quarterback play, and small samples. Efficiency enters the model shrunk, conditioned, and never as a substitute for role evidence (Foundation P7). [SPR]

**T7 — The quarterback and team create the pie; the receiver earns his slice.** Team dropback volume, offensive quality, and quarterback accuracy scale every WR's opportunity multiplicatively. Quarterback quality is not an additive bonus: it changes target volume, catchability, touchdown environment, and which receiver archetypes get fed (Section 10). [SPR]

**T8 — Role durability is a separate question from role size.** Two receivers with identical 85% route participation can carry very different probabilities of holding it: draft capital, contract, target competition, coaching continuity, and role specialization all shift the survival curve without changing this week's routes. Durability drives multi-year horizons; size drives short ones. [IC]

**T9 — Age modifies probabilities by horizon, never a cliff.** Age has near-zero direct weekly effect, moderate one-year effect through decline and role-loss hazard, and dominant dynasty effect through remaining usable seasons (Foundation P16). The model applies age as horizon-scaled multipliers on development, decline, and role survival — never as a fixed deduction. [SPR]

**T10 — Injury is a state, a history, and an information problem.** Current availability, workload limitation, reinjury hazard, and long-term decline are separate objects with separate horizon effects (Foundation P17). The model never performs medical diagnosis; it grades information confidence. [IC]

**T11 — Small-sample role evidence is real evidence.** A rookie running 90% of routes in Weeks 1–2 has demonstrated something a 40-route sample of YPRR has not: the coaching staff's revealed decision. Role signals update fast; efficiency signals update slowly (Foundation P8). The model must be capable of recognizing a genuine breakout before production stabilizes, at the cost of wider uncertainty. [SPR]

**T12 — Market information never enters.** Nothing in this model consumes what the fantasy market currently believes a WR is worth. If the market knows a factual thing (a confirmed injury, a depth-chart change), that fact enters through the classified-event pathway (Foundation §24.3) — the fact, never the price reaction.

---

## 3. Estimands

Every object below is an explicit mathematical target. "Predict WR value" appears nowhere in this model.

### 3.1 State and participation estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E1 | **P(active)_w** | Probability the WR is active for game week *w* | probability |
| E2 | **RP_w** | Route participation: routes run ÷ team dropbacks, distribution for week *w* | rate [0,1] |
| E3 | **RoleState_t** | Probability vector over the role states of Section 4 at time *t* | probability simplex |
| E4 | **G_h** | Games-active distribution over horizon *h* | count distribution |

### 3.2 Opportunity estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E5 | **TPRR** | Targets per route run, posterior distribution | rate |
| E6 | **TS** | Target share (targets ÷ team targets) — derived check on E2×E5, not independent evidence | rate [0,1] |
| E7 | **D_tgt** | Target-depth mixture: proportions of targets in {behind-LOS, short 0–9, intermediate 10–19, deep 20+} plus end-zone target rate | mixture weights |
| E8 | **TeamDB_w** | Team dropbacks per game distribution | count |

### 3.3 Conversion estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E9 | **P(catch \| depth bucket, QB env)** | Depth-conditioned catch probability | probability |
| E10 | **Y \| catch, depth bucket** | Yards-given-catch distribution per depth bucket | yards |
| E11 | **xTD_rate** | Expected touchdowns per target from opportunity mix (end-zone targets, deep targets, team red-zone environment) | rate |

### 3.4 Output estimands

| ID | Estimand | Definition | Native unit |
|---|---|---|---|
| E12 | **EFO_weekly** | Fantasy-point distribution, next game | fantasy points |
| E13 | **EFO_ROS** | Fantasy-point distribution, remaining season, integrating E1/E4 | fantasy points |
| E14 | **EFO_1yr** | Next-full-season fantasy-point distribution and per-game distribution | fantasy points |
| E15 | **EFO_3yr inputs** | Per-season output distributions ×3, plus role-survival probabilities per season | fantasy points, probabilities |
| E16 | **Dynasty career-state inputs** | Season-by-season role-state transition probabilities for explicit seasons 1–3 and a terminal continuation state (Section 14.5), consumed by Dynasty Fundamental Utility (Foundation §14.2) | probabilities |

### 3.5 Explicit non-estimands

This model does not estimate: Observed Market Price; Intrinsic Asset Value (it feeds it); trade demand; a universal WR ranking; "WR value" of any unqualified kind (Foundation §3).

---
## 4. Wide Receiver State Model

### 4.1 Role states

The model maintains a probability vector over eight WR role states. States describe the coaching staff's revealed deployment decision, not talent.

| State | Code | Operational definition (trailing 4-game evidence, shrunk) |
|---|---|---|
| Inactive / unavailable | S0 | Not active: injury, suspension, healthy scratch, unsigned |
| Rostered depth | S1 | Active, route participation < 25% |
| Rotational receiver | S2 | RP 25–54%, no stable alignment identity |
| Package specialist | S3 | RP 25–54% concentrated in specific personnel groupings (e.g., 4-WR sets, deep-shot packages) |
| Starting receiver, partial | S4 | RP 55–74% |
| Full-time route earner | S5 | RP ≥ 75%, TPRR < 20% |
| Primary target | S6 | RP ≥ 75%, TPRR 20–26% |
| Elite target earner | S7 | RP ≥ 75%, TPRR ≥ 27% |

A ninth flag, **role-threatened** (RT), is a binary modifier attachable to S4–S7 when the durability signals of Section 5.6 indicate elevated demotion hazard (declining route trend, incoming draft capital, benching reports classified per Foundation §11.9). RT does not change the current state; it changes the transition matrix.

**Boundary smoothing.** The RP and TPRR thresholds above are descriptive bins, not hard cliffs (Foundation §12.4). State probabilities are computed by passing the shrunk posterior distributions of RP and TPRR through the bin boundaries, so a receiver with posterior RP mean 0.73 and wide uncertainty holds meaningful probability in both S4 and S5. No player is ever deterministically snapped to one state off a threshold.

### 4.2 Representation: hybrid, and why

**Decision [EI]:** hybrid representation. Continuous posterior distributions for RP and TPRR are the primitives; the discrete state vector is derived from them.

- **Continuous primitives** drive the EFO calculation (Section 12), because the projection chain needs actual rates, not labels.
- **Discrete states** drive three things: (1) the multi-year transition model (Section 14.4–14.5), where a small transition matrix is estimable from historical data while a continuous role-dynamics model is not, for a hobby project; (2) explanation ("moved from Rotational to Full-time route earner" is legible); (3) State Uncertainty measurement (entropy of the state vector is the Section 16 input).

A fully latent-state Bayesian model (HMM over roles) is deferred (Section 24). The MVP derives states deterministically from shrunk continuous posteriors, which is transparent, debuggable, and sufficient.

### 4.3 Transition structure

Between-week transitions within a season are handled by the update rules of Section 18 (evidence-driven, not a fitted weekly Markov chain). Between-season transitions use the age- and durability-conditioned transition matrix of Section 14.4. This split keeps the fitted object small: one annual transition matrix stratified by age band and durability tier, estimable from ~10 seasons of public data.

---

## 5. Signal Families

Format per signal: **Definition · Why it matters · Data tier · Direction · Sample treatment · Missing fallback · Horizon relevance · Failure modes · MVP?**

Data-tier shorthand follows Foundation §8.1. One position-specific note applies throughout:

> **Route data reality [ES]:** Free per-player route feeds (NFL participation data via nflverse) ended during 2023. Post-2023 route counts require a paid source (~$35–80/yr charting subscription) — cheap enough for Tier 2-lite, but the Foundation requires Tier 1 sufficiency. For WRs specifically, pass-play snaps are a strong route proxy because WRs pass-block on a negligible share of dropbacks: **proxy routes = pass snaps × 0.97** [SPR, proxy factor TP]. Snap counts are free and reliable (nflverse). Every route-based signal below therefore carries a defined Tier 1 proxy, and the Data-Quality Confidence penalty of Section 16 applies when the proxy is in use.

### 5.1 Availability and Participation

**5.1.1 Games active (trailing 3 seasons)**
- *Def:* games active ÷ games possible, per season.
- *Why:* base rate for the games-played model; availability is the first multiplicative gate.
- *Tier:* 1 (nflverse). *Direction:* positive.
- *Sample:* beta-binomial shrink toward WR base rate ≈ 0.88 of games [SPR], k = 34 games (two seasons) [TP].
- *Missing:* rookies use draft-capital-conditioned rookie base rate (Section 15).
- *Horizons:* all; dominant weekly/ROS.
- *Failure:* healthy scratches of depth players contaminate injury inference — separate scratch from injury where designations allow.
- *MVP:* yes.

**5.1.2 Current injury designation and practice participation**
- *Def:* official status (Out/Doubtful/Questionable/IR/PUP) plus Wed–Fri practice log.
- *Why:* the single strongest weekly availability signal; practice trend refines Questionable.
- *Tier:* 1 (nflverse injuries feed). *Direction:* negative on P(active).
- *Sample:* n/a — state evidence, mapped to P(active) via the lookup table in Section 8.8.
- *Missing:* stale report ⇒ widen P(active) interval, raise Data-Quality flag; never assume healthy.
- *Horizons:* weekly dominant; ROS via expected return timeline.
- *Failure:* teams manipulate designations; treat Questionable+full-Friday-practice differently from Questionable+DNP.
- *MVP:* yes.

**5.1.3 Snap share (offensive snaps ÷ team offensive snaps)**
- *Def:* per game, trailing windows of 2/4/8 games.
- *Why:* the free, reliable backbone of role measurement and the route proxy input.
- *Tier:* 1. *Direction:* positive.
- *Sample:* shrink per Section 9; 4-game window is the primary role window [TP].
- *Missing:* rare; fall back to depth chart + prior.
- *Horizons:* all.
- *Failure:* run-heavy blowouts distort single games — use pass-play snaps where derivable from pbp alignment, else full snap share.
- *MVP:* yes.

**5.1.4 Route participation (RP)**
- *Def:* routes run ÷ team dropbacks.
- *Why:* T1 — the license to earn. The most forward-predictive role signal at WR [SPR].
- *Tier:* 2-lite (paid charting) with Tier 1 proxy above.
- *Sample:* fast-moving signal; Section 9 uses k_RP = 60 routes for within-season shrink [TP].
- *Missing:* proxy from pass snaps; flag `rp_source = proxy` and apply Section 16 confidence penalty.
- *Horizons:* all; weight declines slightly at dynasty horizon where durability matters more than current size.
- *Failure:* proxy overstates RP for occasional inline/blocking WRs (rare); charting vendors disagree on scramble-drill routes.
- *MVP:* yes.

**5.1.5 Expected route participation next game**
- *Def:* model-projected RP integrating current RP posterior, injury states of teammates, and confirmed depth-chart events.
- *Why:* the weekly EFO chain needs a forward RP, not a trailing average.
- *Tier:* derived. *MVP:* yes (simple version: trailing shrunk RP adjusted by confirmed events per Section 18).

**Deferred from this family:** missed-game injury typology (soft-tissue vs. structural recurrence modeling) — Section 24.

### 5.2 Target Earning

**Redundancy rule [ES]:** target share, TPRR, and RP are mechanically linked: TS ≈ (RP × TPRR) ÷ league target-per-dropback constant. They are one-and-a-half pieces of evidence, not three (Foundation P13). **The model's primitives are RP and TPRR. Target share is a derived consistency check and a fallback when route data are proxied — never a third additive input.**

**5.2.1 Targets per route run (TPRR)**
- *Def:* targets ÷ routes (or proxy routes).
- *Why:* T2 — the core repeatable WR skill; stabilizes in roughly a hundred routes [SPR].
- *Tier:* 1 with proxy routes; 2-lite with charted routes. *Direction:* positive.
- *Sample:* k_TPRR = 100 routes toward archetype-and-draft-capital prior [TP; SPR for stabilization order of magnitude].
- *Missing:* if routes unavailable and proxy fails, fall back to targets per team dropback (targets ÷ team dropbacks), shrunk with k = 120 dropbacks [TP].
- *Horizons:* all; the highest-weighted skill signal at every horizon beyond weekly.
- *Failure:* inflated by scramble targets and broken plays in tiny samples; deflated for deep threats whose routes clear coverage (archetype prior mitigates).
- *MVP:* yes.

**5.2.2 Target share when active (TS)**
- *Def:* targets ÷ team targets, games-active only.
- *Why:* robust, free, and the natural fallback; also the consistency check on RP × TPRR.
- *Tier:* 1. *Sample:* k_TS = 80 targets-of-team [TP].
- *Missing:* n/a (always available).
- *Horizons:* all. *Failure:* conflates role size with per-route earning — exactly why it is not a primitive.
- *MVP:* yes (as check/fallback).

**5.2.3 Target-earning trend**
- *Def:* slope of shrunk TPRR over trailing 6 games, bounded to [−0.05, +0.05] per game [TP].
- *Why:* role and usage changes show up in TPRR before season aggregates move.
- *Tier:* derived. *Horizons:* weekly/ROS mainly.
- *Failure:* chases hot streaks — the bound and shrink exist for this.
- *MVP:* yes.

**5.2.4 First-read target share** — *Tier 3 (not cheaply available at reliable quality). Deferred.* [SPR that it adds signal; unavailable]

### 5.3 Target Quality

**5.3.1 Average depth of target (aDOT)**
- *Def:* mean air yards per target.
- *Why:* determines the yards/TD/catch-probability mixture per target; the archetype axis.
- *Tier:* 1 (nflverse pbp air yards). *Direction:* non-monotonic — it shapes the distribution rather than raising or lowering the mean by itself.
- *Sample:* k = 60 targets toward player-career then archetype mean [TP].
- *Missing:* league-mean depth mixture by archetype.
- *Horizons:* all (as a distribution shaper).
- *Failure:* a lone deep shot in a small sample distorts the mixture — use the four-bucket mixture (E7), not the mean, wherever possible.
- *MVP:* yes.

**5.3.2 Air-yard share**
- *Def:* player air yards ÷ team air yards.
- *Why:* measures claim on downfield intent; combined with TS it is the public WOPR construction (0.7·TS + 0.3·AYshare) [SPR].
- *Tier:* 1. *Sample:* k = 80 team-air-yard games equivalent [TP].
- *Missing:* omit, renormalize Target Quality component.
- *Horizons:* all. *Failure:* T3's empty-air-yards trap — high air-yard share with low catchable rate and low TPRR is a low-value profile. The interaction gate in Section 10.4 enforces this: air-yard share may never raise Target Quality when TPRR is below the 35th percentile.
- *MVP:* yes.

**5.3.3 End-zone and red-zone target share**
- *Def:* player's share of team targets thrown into the end zone; secondarily, targets inside the 20.
- *Why:* the backbone of xTD (T5). End-zone targets are the most TD-predictive opportunity unit at WR [SPR].
- *Tier:* 1 (pbp yardline + air yards). *Sample:* very noisy; k = 25 end-zone targets, shrunk toward the player's overall TS [TP].
- *Missing:* use overall TS as the end-zone share estimate (neutral assumption), flag it.
- *Horizons:* all; largest effect on ROS/one-year TD projection.
- *Failure:* tiny numerators; a 3-for-3 end-zone stretch must not compound with realized TDs (Section 10.9 anti-double-count rule).
- *MVP:* yes.

**5.3.4 Catchable-target rate** — *Tier 2 (charting). Deferred; the QB environment index (5.5.3) absorbs catchability at team level in MVP.*

**5.3.5 Expected fantasy points per target (xFP/tgt)**
- *Def:* model-derived: the Section 12 per-target value integrated over the player's depth mixture and QB environment.
- *Why:* one number summarizing target quality for explanation and validation.
- *Tier:* derived. *MVP:* yes (computed, not sourced).

### 5.4 Efficiency and Conversion

Stability ordering [SPR], governing shrink strength (most→least stable): **catch rate given depth > YPRR > yards after catch rate > yards per target > TD per target.**

**5.4.1 Yards per route run (YPRR)**
- *Def:* receiving yards ÷ routes (or proxy routes).
- *Why:* the best single public efficiency metric; blends earning and conversion.
- *Tier:* 1-proxy / 2-lite. *Direction:* positive.
- *Sample:* moderate-to-heavy shrink, k_YPRR = 250 routes toward archetype prior [TP]. Note overlap with TPRR: YPRR ≈ TPRR × yards/target, so the Efficiency component uses **yards per target given depth** as its primitive and YPRR only as the summary/fallback, avoiding double-counting target earning.
- *Missing:* yards per team dropback, heavier shrink.
- *Horizons:* one-year+ mainly. *Failure:* QB-contaminated; depth-contaminated (deep threats post high-variance YPRR).
- *MVP:* yes.

**5.4.2 Catch rate over depth expectation (CROE-lite)**
- *Def:* actual catch rate minus expected catch rate given the player's target-depth mixture (expected = league catch rate per depth bucket, Tier 1 derivable from pbp).
- *Why:* removes the depth confound that makes raw catch rate useless.
- *Tier:* 1 derived. *Sample:* k = 120 targets [TP].
- *Missing:* assume 0 (league average), widen Forecast Uncertainty.
- *Horizons:* all conversion horizons. *Failure:* still QB-contaminated; the QB env index partially corrects.
- *MVP:* yes.

**5.4.3 YAC over expectation** — *Tier 2 (NGS xYAC intermittently free but unreliable in coverage). MVP uses yards-given-catch per depth bucket from pbp instead, which folds YAC in implicitly. Standalone YAC deferred.*

**5.4.4 First downs per target**
- *Def:* receiving first downs ÷ targets.
- *Why:* stability-weighted usefulness signal; correlates with sustained role trust.
- *Tier:* 1. *Sample:* k = 100 targets [TP]. *MVP:* **no** — excluded for redundancy with yards/target given depth; revisit in calibration. [PH]

**5.4.5 TD conversion (realized TD per target)**
- *Def:* receiving TDs ÷ targets.
- *Why:* included only to be regressed: posterior TD rate = w·realized + (1−w)·xTD_rate with w = n/(n+300 targets) [TP; SPR for very-heavy-regression direction]. Realized TDs barely move the forecast; opportunity mix drives it (T5).
- *Tier:* 1. *MVP:* yes (inside xTD construction only, never as a standalone component input).

### 5.5 Team and Quarterback Context

**5.5.1 Team dropbacks per game**
- *Def:* trailing-season and projected dropbacks/game.
- *Why:* the volume pie (T7); multiplicative in the EFO chain.
- *Tier:* 1. *Sample:* k = 8 games toward league mean adjusted by pass-rate-over-expectation [TP].
- *Missing:* league mean, flag.
- *Horizons:* all. *Failure:* coaching/QB changes break continuity — Section 18 event rules control the reset.
- *MVP:* yes.

**5.5.2 Pass rate over expectation (PROE) and pace** — folded into the team dropback projection as adjusters, not standalone components. *Tier 1 derivable from pbp win-probability context.* *MVP:* yes (inside 5.5.1).

**5.5.3 Quarterback environment index (QBenv)**
- *Def:* a single bounded index in [−1, +1] built from Tier 1 inputs: QB career + trailing-season EPA/dropback (shrunk, k = 300 dropbacks), completion percentage over depth expectation, and sack-avoidance; mapped to three effects — catch-probability shift per depth bucket (±4 pts max at intermediate/deep [TP]), team dropback quality, and TD environment multiplier (±15% max [TP]).
- *Why:* T7 — QB quality must flow through mechanisms, not sit as an additive bonus.
- *Tier:* 1. *Missing:* backup/unknown QB ⇒ QBenv = −0.3 default [TP] with wide uncertainty and a named event sensitivity (Section 17).
- *Horizons:* all; weekly uses the *starting* QB, one-year+ uses a QB-stability-weighted mixture.
- *Failure:* overreacting to QB changes (Section 22 failure F8); archetype interaction handled in Section 10.5.
- *MVP:* yes.

**5.5.4 Target competition index (TCI)**
- *Def:* sum of shrunk TPRR-based target claims of other pass catchers currently on the roster who are expected active, normalized so team claims ≈ 1. High TCI ⇒ this WR's marginal target expansion is capped.
- *Tier:* 1 derived. *Missing:* depth-chart count of viable pass catchers as coarse proxy.
- *Horizons:* ROS through dynasty; drives durability and the ceiling of role expansion.
- *Failure:* stale rosters after trades/injuries — recompute on every confirmed roster event.
- *MVP:* yes.

**5.5.5 Offensive quality / scoring environment**
- *Def:* trailing team points per drive and red-zone trips per game, shrunk toward league mean (k = 10 games [TP]).
- *Why:* scales the TD environment; a target in a 28-ppg offense is worth more than the same target at 15 ppg.
- *Tier:* 1. *MVP:* yes (inside xTD and per-target value).

**5.5.6 Coordinator/scheme continuity** — binary continuity flag + known scheme pass-rate tendency only. Full scheme modeling deferred. *Tier 1 (public coaching data).* *MVP:* yes (as a durability input and an uncertainty widener on coaching change, per Foundation §19.3).

### 5.6 Role Durability

These signals shift *survival* of the current role, not current output. Per Foundation P18, contract and draft capital act only through opportunity durability.

**5.6.1 Route trend (8-game slope of shrunk RP)** — *Tier 1-proxy.* Negative slope in a veteran is the leading demotion indicator. *MVP:* yes.
**5.6.2 Draft capital** — *Tier 1.* Round/pick of the WR himself; teams give drafted players longer leashes [SPR]. Enters as prior strength (Section 15) and as a durability point contribution. *MVP:* yes.
**5.6.3 Contract commitment** — *Tier 1 (OTC via nflverse):* guaranteed money remaining and years of team control. Maps to a 0–1 security score (Section 8.6). *MVP:* yes.
**5.6.4 Incoming target competition** — draft picks spent on pass catchers, confirmed FA signings; event-driven (Section 18). *MVP:* yes.
**5.6.5 Teammate return risk** — injured teammate with a prior target claim expected back; reduces durability of the *temporary* share (Foundation §19.4 reversal policy). *MVP:* yes.
**5.6.6 Role specialization penalty** — S3 package specialists and single-alignment receivers have lower role-survival rates than multi-alignment receivers [IC]. MVP proxy: slot rate between 20–80% (alignment flexibility) where alignment data available (Tier 1 via pbp/participation history, else omit). *MVP:* yes-if-available.
**5.6.7 Coaching continuity** — from 5.5.6. *MVP:* yes.

### 5.7 Age, Experience, and Career Stage

Career-stage classes and their treatment (mechanics in Sections 8.7, 14.4, 15):

| Stage | Definition | Treatment |
|---|---|---|
| Rookie | 0 NFL seasons | Prospect prior regime (Section 15); widest uncertainty; positive development drift |
| Year 2–3 | 1–2 seasons | Largest positive development probability mass [SPR — WR breakouts concentrate here]; priors decay fast with routes |
| Prime veteran | Age 24–28, ≥3 seasons | Strongest priors; slowest updates; development drift ≈ 0 |
| Aging veteran | Age 29+ | Decline hazard and role-loss hazard rise with age; per-route skill declines later than role survival [SPR] |
| Late/low-capital breakout | First sustained S5+ role at age ≥25 or draft round ≥5 | Evidence-forward: recent role evidence outweighs weak prior faster than for early picks (Section 15.6) |
| Established elite | ≥2 seasons in S6/S7 | Elite persistence prior: S7 receivers retain elite target earning at high rates through ~age 29 [SPR] |

No hard age cliff exists anywhere in this model (T9). Age enters as: (a) development/decline drift on TPRR and depth-conditioned efficiency; (b) role-survival hazard in the annual transition matrix; (c) uncertainty width. Starting multiplier table in Section 8.7 [TP].

### 5.8 Injury and Physical Risk

Separated objects per T10:

1. **Current availability** — 5.1.2, feeds P(active).
2. **Expected workload limitation** — first 1–3 games post-return, RP capped at min(prior RP, ramp schedule: 65%/85%/100% of prior RP) for major injuries [TP; IC].
3. **Reinjury hazard** — MVP: coarse tiering only. Soft-tissue injury in past 8 weeks ⇒ +8pp miss probability next 4 weeks [TP]; season-ending structural injury ⇒ next-season games prior shifted down one tier. No diagnosis modeling.
4. **Long-term decline risk** — only for confirmed major lower-body structural injuries (Achilles, multi-ligament): efficiency prior shifted −0.5 SD for the following season, decaying over two seasons [TP; SPR directionally].
5. **Information confidence** — every injury input carries the Foundation §11.9 source classification; vague reports raise State Uncertainty rather than move point estimates.

*Tier:* 1 (official reports). *MVP:* items 1–3 and 5; item 4 in simplified form.

### 5.9 Prospect and Prior Information

Applies to rookies and any WR with < 300 career NFL routes.

| Input | Tier | Role |
|---|---|---|
| Draft capital (pick number) | 1 | Primary prior axis [SPR — strongest single public prospect signal] |
| Age-adjusted college production (final-season receiving-yard market share, age-discounted) | 1 (public college stats) | Secondary prior axis [SPR] |
| Breakout age (first season ≥ 20% college dominator/market share) | 1 derived | Tertiary [SPR] |
| Early declare | 1 | Small positive prior adjustment [SPR] |
| Athletic testing (combine) | 1 | Small; tie-breaker only [SPR — weak incremental value after capital + production] |
| Competition level (P5 vs G5) | 1 | Adjusts production input, not standalone |
| Early NFL deployment (camp/preseason first-team routes, Week 1–4 RP) | 1 | The prior-killer: overrides prospect priors on the Section 15.4 decay schedule |

**Rule:** prospect inputs exist only inside the prior. They never appear as live-season additive bonuses, and there is no "rookie boost." The speed at which NFL routes displace the prior is the entire mechanism (Section 15.4).

---
## 6. MVP Signal Set

Sixteen core inputs survive. Everything else in Section 5 is deferred, derived, or folded into these.

| # | Signal | Source (type) | Refresh | Why it survived | What it displaced and why |
|---|---|---|---|---|---|
| 1 | Snap share / pass-play snaps | nflverse (free) | weekly | Free, reliable role backbone; route proxy input | — |
| 2 | Route participation (charted or proxy) | charting sub or proxy | weekly | T1: the necessary-condition gate | Full participation/alignment data: cost |
| 3 | TPRR | derived from 2 + targets | weekly | T2: most predictive WR skill | First-read TS: unavailable at hobby cost |
| 4 | Target share when active | nflverse | weekly | Free fallback + consistency check | — |
| 5 | Target-depth mixture + aDOT | nflverse pbp | weekly | Shapes the per-target value distribution | Charted route types: cost |
| 6 | Air-yard share | nflverse pbp | weekly | Downfield claim; WOPR-adjacent evidence base | — |
| 7 | End-zone / red-zone target share | nflverse pbp | weekly | Backbone of xTD (T5) | Realized TD rate as a driver: noise |
| 8 | YPRR (regressed) + yards/target by depth | derived | weekly | Best public efficiency summary | Raw yards/target: depth-confounded |
| 9 | CROE-lite (catch rate over depth expectation) | derived from pbp | weekly | Depth-corrected hands/separation proxy | Charted catchable-target rate: cost |
| 10 | Team dropbacks (incl. PROE/pace adj.) | nflverse pbp | weekly | The volume pie (T7) | Standalone pace: redundant |
| 11 | QB environment index | nflverse pbp | weekly + events | Mechanism-based QB effect (T7) | Generic "QB grade" bonus: forbidden by design |
| 12 | Target competition index | derived | weekly + events | Caps expansion; drives durability | Full joint teammate model: deferred (§24) |
| 13 | Age + experience stage | nflverse | annual | T9 horizon scaling | — |
| 14 | Draft capital + prospect prior bundle | nflverse/public college | annual (rookies) | Best available prior for low-sample WRs | Athletic testing as standalone: weak incremental value |
| 15 | Injury state bundle (status, practice, ramp, coarse hazard) | nflverse injuries | daily in-season | Availability gate + T10 separation | Diagnosis-level modeling: out of scope |
| 16 | Contract security + coaching continuity | OTC via nflverse, public | on event | Durability inputs (P18) | Full cap modeling: overkill |

**Games-played probability** and **role trend** are derived objects computed from #1/#2/#13/#15, not separate sourced inputs.

**Refresh cadence:** items 1–12 weekly (Tuesday, after stat finalization); item 15 daily Wednesday–Sunday in season; items 13–14 annually; item 16 event-driven. Full recompute cost is trivial (hundreds of players × deterministic formulas).

**Data contract note (Foundation §8.2):** each of the 16 requires a completed data-contract row before production. The MVP registry template is part of the Section 23 deliverables. The legal gate (§8.5): nflverse is openly licensed for this use; the charting subscription requires terms-of-service review for derived-model use before Tier 2-lite promotion — until reviewed, the proxy path is the production path.

---

## 7. Core MVP Formula

### 7.1 Two-track architecture — and which track produces EFO

The model runs two coupled tracks:

- **Track A — Component forecast chain (produces EFO).** Expected Fantasy Output comes from the multiplicative opportunity chain of Section 12: P(active) × team dropbacks × RP × TPRR × per-target outcome distributions. **EFO is never computed from the weighted composite score.** This is the more defensible component forecast the prompt and Foundation P6/§11 require.
- **Track B — Component scores and the horizon-weighted WR Composite.** Eight bounded component scores (0–100 each) summarize the evidence per family. Their horizon-weighted combination — the **WR Composite** — serves three governed purposes only: (1) it parameterizes the *priors and adjustments* inside Track A (durability → role-survival probabilities; age/development → drift terms); (2) it is the explanation and sanity-check summary; (3) it feeds the multi-year state-transition conditioning of Section 14.4. The WR Composite is a diagnostic object. It is not an estimand, not a value, and never leaves the position model as a headline number.

This division prevents the classic failure where a single blended score both explains and generates the forecast, making errors untraceable.

### 7.2 Component scores

Each is a bounded 0–100 score built in Section 8 from shrunk inputs, where 50 = league-average full-roster WR (roughly the WR48–60 band of active receivers) [TP anchor].

1. **Route Role Score (RR)** — size and recency of the route franchise.
2. **Target Earning Score (TE)** — per-route target claim.
3. **Target Quality Score (TQ)** — value mixture of the targets earned.
4. **Efficiency Score (EF)** — depth-corrected conversion.
5. **Team Context Score (TC)** — volume, QB environment, scoring environment.
6. **Role Durability Score (RD)** — survival of the role.
7. **Age & Development Score (AD)** — career-stage drift and horizon-scaled decline.
8. **Availability Score (AV)** — games-played expectation and injury state.

### 7.3 Provisional horizon weights [TP — all values]

Weights govern the WR Composite per horizon. Each column totals 100.

| Component | Weekly | ROS | One Year | Three Years | Dynasty |
|---|---|---|---|---|---|
| Route Role | 20 | 18 | 15 | 12 | 10 |
| Target Earning | 20 | 20 | 20 | 18 | 17 |
| Target Quality | 10 | 10 | 10 | 8 | 8 |
| Efficiency | 5 | 7 | 8 | 8 | 8 |
| Team Context | 15 | 12 | 10 | 6 | 4 |
| Role Durability | 3 | 15 | 20 | 22 | 23 |
| Age & Development | 2 | 3 | 12 | 21 | 26 |
| Availability | 25 | 15 | 5 | 5 | 4 |
| **Total** | **100** | **100** | **100** | **100** | **100** |

### 7.4 Reasoning for the major horizon differences

- **Availability 25 → 4:** this week's game is dominated by whether he plays; over a dynasty horizon, availability converges to the games-played hazard already inside Durability and Age. Keeping it high at long horizons would double-count injury.
- **Team Context 15 → 4:** the current offense is largely known this week and almost unknowable in year three (QB changes, coaching turnover). Long-horizon team effects live inside Durability (transition risk), not Context (current environment). This follows Foundation §13.1's horizon definitions directly.
- **Role Durability 3 → 23:** a role can't be lost mid-game; it is the central question of whether year-three routes exist. It overtakes Route Role because *current* size decays in relevance as the horizon extends.
- **Age & Development 2 → 26:** T9. Near-zero weekly effect; dominant dynasty effect through remaining usable seasons and development probability. Its dynasty weight exceeds every football-state component because at that horizon most value variance across comparable WRs is career-shape variance [SPR directionally].
- **Target Earning stays high everywhere (20 → 17):** TPRR is both the best current-output signal and the most persistent skill; it decays least across horizons.
- **Efficiency rises then plateaus (5 → 8):** single-week efficiency is nearly pure noise; multi-year, shrunk efficiency separates skill tiers, but it never rivals earning because it stabilizes slower and is more context-contaminated.
- **Route Role declines gently (20 → 10):** current routes matter at every horizon (they anchor the state), but their information content about year three is mediated by durability.

Calibration replaces this table per the Section 21 plan; the promotion rule is Foundation §25.13.

---

## 8. Component Construction

Conventions for all components: inputs are shrunk per Section 9 *before* entering formulas; every sub-weight is [TP]; each score is clamped to [0, 100]; percentile transforms are against the active-WR universe (WRs with ≥ 10% snap share in the trailing 4 team games, plus rostered injured WRs carried at their pre-injury percentile with a staleness flag); missing-input behavior per Section 19.

**Percentile convention:** `pct(x)` maps a shrunk input to its percentile in the active-WR universe, expressed 0–100. Percentiles are computed against a *frozen weekly snapshot* of the universe so that one player's score doesn't move because another player's data arrived late (Foundation §20.4 spirit, applied internally).

### 8.1 Route Role Score (RR)

```
RR = 0.60 × pct(shrunk RP, trailing 4 games)
   + 0.25 × pct(shrunk RP, trailing 8 games)
   + 0.15 × route_trend_score
route_trend_score = 50 + 1000 × bounded_slope   # slope in RP/game, bounded ±0.05 ⇒ score 0–100
```
- Two windows balance responsiveness and stability; the 4-game window leads per P5/P8.
- *Caps:* if `rp_source = proxy`, RR is capped at 92 [TP] — proxied data never certifies an elite route franchise.
- *Update:* weekly.

### 8.2 Target Earning Score (TE)

```
TE = 0.75 × pct(shrunk TPRR, season-to-date with k=100 routes)
   + 0.15 × pct(shrunk TS when active)          # consistency/fallback term
   + 0.10 × tprr_trend_score                    # bounded as in 8.1
```
- TS at 0.15 is deliberate: it is mechanically correlated with RP×TPRR, so its weight is small and exists mainly to stabilize proxy-route cases. Version 1 always uses 0.75/0.15/0.10 regardless of route source. Alternative weights require a model-version change and are not permitted in the MVP.
- *Floor rule:* a WR with < 50 career routes takes TE from the prior blend of Section 15, not from observed TPRR.

### 8.3 Target Quality Score (TQ)

```
xFP_per_target = Σ_buckets [ mix_b × ( P(catch|b,QBenv) × (ppr_pt + E[yards|b]×0.1) + xTD_contrib_b×6 ) ]
TQ_raw = pct(xFP_per_target)
TQ = min( TQ_raw , gate_cap )
gate_cap = 100 if pct(TPRR) ≥ 35 else 60      # empty-air-yards gate, Section 10.4 [TP]
```
- `mix_b` = shrunk four-bucket depth mixture (E7); `xTD_contrib_b` from end-zone/deep target shares and team scoring environment (5.3.3, 5.5.5).
- Air-yard share enters through the mixture and end-zone shares, not as a separate additive term — this is the anti-double-count design.

### 8.4 Efficiency Score (EF)

```
EF = 0.55 × pct(CROE_lite, k=120 targets)
   + 0.45 × pct(shrunk yards-per-target-given-depth, k=250 route-equivalents)
```
- Both primitives are depth-corrected, so EF measures conversion skill, not role or depth.
- *Cap:* |EF − 50| ≤ 35 until the player has ≥ 200 career routes [TP] — no rookie posts EF 95 off six games.

### 8.5 Team Context Score (TC)

```
TC = 0.45 × pct(projected team dropbacks/game)
   + 0.35 × qbenv_score                        # QBenv in [−1,1] → 50 + 50×QBenv
   + 0.20 × pct(team points per drive, shrunk)
```
- Weekly horizon additionally multiplies TC's dropback term by the opponent pass-funnel adjustment (opponent dropbacks allowed over expectation, shrunk k = 8 games [TP]).

### 8.6 Role Durability Score (RD)

Point-built score, base 50, bounded [0, 100]:

```
RD = 50
   + 12 × contract_security          # 0–1: guarantees remaining & team control (5.6.3)
   + 10 × draft_capital_security     # 0–1: R1=1.0, R2=0.75, R3=0.5, R4-5=0.3, R6-7/UDFA=0.1
   +  8 × route_trend_sign           # +1 rising / 0 flat / −1 falling (8-game)
   −  1 × TCI_pressure               # 0–15 pts: target competition above team-normal [TP scale]
   −  8 × incoming_competition_flag  # confirmed Day-1/2 rookie WR or veteran signing at same alignment
   −  6 × teammate_return_flag       # temporary-share holder, per §19.4 reversal policy
   −  5 × specialization_flag        # S3 / single-alignment profile
   +  5 × coaching_continuity_flag   # +5 continuity / −5 confirmed new OC with scheme change
   + elite_persistence_bonus         # +8 if ≥2 seasons in S6/S7 [SPR-informed, TP value]
```

### 8.7 Age & Development Score (AD)

AD converts career stage into a horizon-relevant drift score. Starting age curve [TP values; SPR shape]:

| Age band | Development drift (annual Δ on TPRR percentile) | Role-survival multiplier (annual) | AD base |
|---|---|---|---|
| 21–22 | +8 | 0.97 | 72 |
| 23 | +6 | 0.98 | 70 |
| 24–26 | +2 | 1.00 | 65 |
| 27–28 | 0 | 0.99 | 58 |
| 29–30 | −3 | 0.95 | 46 |
| 31–32 | −6 | 0.88 | 34 |
| 33+ | −9 | 0.78 | 22 |

```
AD = age_base
   + 6 × year2_3_flag                 # concentrated breakout window [SPR]
   + 4 × early_breakout_flag          # sustained S5+ before age 23
   − 6 × late_low_capital_flag_if_unproven   # removed once ≥1 full season at S5+
```
- The drift and survival columns feed Track A (Section 14.4) directly; AD-the-score only summarizes them for the composite and explanation. Survivorship-bias caveat per P16: these multipliers must be re-estimated on cohorts including washed-out players, not survivors only (Section 21.6).

### 8.8 Availability Score (AV)

```
P(active)_w from designation table:
  none/full practice: 0.98 | Questionable+limited: 0.72 | Questionable+DNP Fri: 0.45
  Doubtful: 0.12 | Out/IR/PUP/Susp: 0.00   [TP; calibrate against designation outcomes]

G_season prior: Beta-binomial, mean 0.88×17, strength k=34 games,
  updated by trailing-3-season games and current injury tier (5.8).

AV(weekly) = 100 × P(active)_w × ramp_factor        # ramp per 5.8 item 2
AV(longer) = 100 × E[G_h] / games_possible_h
```

---
## 9. Shrinkage and Sample-Size Rules

### 9.1 Universal form

Every rate input uses the same transparent estimator:

```
reliability w = n / (n + k)
regressed_metric = w × observed + (1 − w) × prior
```

where `n` is the metric's exposure unit (routes, targets, games, dropbacks) and `k` is the metric-specific stabilization constant. This is the standard shrinkage/stabilization form [SPR]; the k values are [TP] with a defined calibration path (Section 21.5): choose k per metric to minimize out-of-sample MAE of the regressed metric predicting its own next-8-week value, on 2016–2024 data.

### 9.2 Stabilization constants (starting values, all [TP])

| Metric | Exposure unit | k | Prior target |
|---|---|---|---|
| Route participation (in-season) | routes | 60 | preseason role projection → career RP |
| TPRR | routes | 100 | prior blend (Section 15) → archetype mean |
| Target share | team targets when active | 80 | RP×TPRR-implied TS |
| Depth mixture / aDOT | targets | 60 | player career → archetype mixture |
| End-zone target share | end-zone targets | 25 | player overall TS |
| CROE-lite | targets | 120 | 0 (league average) |
| Yards/target given depth | route-equivalents | 250 | archetype mean |
| YPRR (fallback summary) | routes | 250 | archetype mean |
| Realized TD/target | targets | 300 | xTD_rate |
| Team dropbacks | team games | 8 | league mean + PROE tendency |
| Team points/drive | team games | 10 | league mean |
| QB EPA/dropback | dropbacks | 300 | career QB value → league backup mean |
| Games active | games | 34 | WR base rate 0.88 |

### 9.3 Prior hierarchy

Priors follow Foundation §12.7's hierarchy, position-specialized: **league WR mean → archetype mean (Section 11) → player career → current season.** A metric shrinks toward the *most specific prior that itself has adequate sample*: a 7th-year veteran's TPRR shrinks toward his own 3-season career TPRR (itself lightly shrunk toward archetype); a rookie's shrinks toward the prospect-prior blend of Section 15.

### 9.4 Asymmetric prior strength by career stage

- **Established veterans (≥1,500 career routes):** career prior gets an effective bonus sample of +150 routes — strong priors update slowly [P5].
- **Fringe/journeyman players (< 600 career routes across 3+ seasons):** no bonus; their history is itself weak evidence.
- **Rookies/near-rookies:** Section 15's decay schedule replaces this table.

### 9.5 What updates fast vs. slow (binding ordering)

Role participation (k=60) > target earning (k=100) > depth mixture (k=60 but low-stakes) > catch conversion (k=120) > yardage efficiency (k=250) > TD conversion (k=300). Any implementation that lets TD results move the forecast faster than route results is non-compliant with T5/P6.

---

## 10. Interaction Rules

Only interactions with a football mechanism are included (Foundation §12.2). Each row states its type: **gate** (necessary condition), **multiplicative** (exposure chain), **cap**, **prior-modifier**, or **uncertainty**.

| # | Interaction | Type | Rule |
|---|---|---|---|
| 10.1 | RP × TPRR | multiplicative | The EFO chain multiplies them (Section 12). They are never added. A high TPRR on RP < 40% produces low expected targets *and* raised uncertainty, because thin-route TPRR is unstable. |
| 10.2 | RP × target value | gate | No route, no target value. P(active)=0 or RP≈0 zeroes the week regardless of every other score. Probabilistic gate per §12.3. |
| 10.3 | Target volume × efficiency | multiplicative + cap | Per-target efficiency scales expected targets; EF may not lift a player's EFO by more than +20% over the volume-implied baseline at any horizon [TP] — efficiency refines volume, never replaces it. |
| 10.4 | Target depth × catchability | cap | The empty-air-yards gate of 8.3: high-depth mixtures with sub-35th-percentile TPRR or strongly negative CROE cap TQ at 60. Depth without earning or hands is not quality (T3). |
| 10.5 | QB quality × archetype | prior-modifier | QBenv's catch-probability shift is depth-weighted: deep buckets get 2× the shift of short buckets [TP]. A field-stretcher's output is therefore more QBenv-sensitive than a slot receiver's — mechanically, not by label. |
| 10.6 | Team pass volume × target share | multiplicative | Dropbacks enter the chain multiplicatively; a target-share point in a 38-dropback offense ≠ one in a 30-dropback offense. |
| 10.7 | Age × role security | prior-modifier | The age-band role-survival multiplier (8.7) multiplies the RD-implied survival probability in the transition model. An aging WR with elite durability signals declines slower than age alone implies; an aging WR with falling routes compounds. |
| 10.8 | Injury × RP | cap + uncertainty | Post-return ramp caps projected RP (5.8); vague injury info widens the RP interval instead of moving its mean. |
| 10.9 | End-zone share × realized TDs | anti-double-count | xTD uses opportunity mix; realized TDs enter only through the w = n/(n+300) blend inside xTD. They may never also adjust EF or TQ. One TD spike moves exactly one number, slightly. |
| 10.10 | Draft capital × early NFL evidence | prior-decay | Section 15.4: capital sets prior strength; routes destroy it on schedule. Capital never adds points to a live-season score. |
| 10.11 | Competition × durability | cap | TCI caps the *projection* of role expansion: projected RP and TPRR may not drift above current posterior mean by more than (1 − TCI_pressure/15) × normal drift [TP]. Crowded rooms suppress breakout projection speed. |

No other interactions are permitted in MVP. Candidates must pass Foundation §12.5 governance.

---

## 11. Archetype Handling

### 11.1 Decision: yes, minimally, measurable-proxy only

Archetypes exist in this model for exactly two jobs: (1) supplying shrinkage priors (Section 9.3), and (2) parameterizing the QBenv depth-sensitivity interaction (10.5). They never gate, boost, or label a player in a way that overrides observed evidence. [PH for the specific taxonomy; IC for the need]

### 11.2 MVP archetype assignment (deterministic, from Tier 1 data)

Assigned from shrunk aDOT and slot rate (where alignment available; else aDOT only), trailing season:

| Archetype | Proxy definition | Prior notes |
|---|---|---|
| Downfield stretcher | aDOT ≥ 13.5 | Lower catch-rate prior, higher yards/target variance, higher TD/target prior, QBenv-sensitive |
| Possession/intermediate | aDOT 8.5–13.5, slot < 50% | League-baseline priors |
| Slot target earner | slot ≥ 50%, aDOT < 11 | Higher catch-rate prior, lower aDOT mixture, TPRR prior slightly higher |
| Manufactured-touch | aDOT < 4.5 with rush attempts ≥ 1/game | YAC-driven yards prior; TD prior from short-area usage; flag for scheme dependence in RD |
| High-volume alpha | any of the above **plus** TPRR ≥ 27% & RP ≥ 80% (= S7 state) | Elite persistence prior (8.6 bonus) |
| Rotational/package | RP < 55% | Wide-uncertainty priors; specialization RD penalty |

Players are blends: assignment is soft (weights proportional to proximity to each definition), preventing threshold cliffs (§12.4). Red-zone-specialist is intentionally **not** an archetype — it is unstable season to season and its signal already lives in end-zone target share [SPR].

---

## 12. Expected Fantasy Output Construction

### 12.1 Scoring vector

```
score(rec, yds, td, ruYds, ruTd) = ppr_pt×rec + 0.1×yds + 6×td + 0.1×ruYds + 6×ruTd
ppr_pt ∈ {1.0, 0.5, 0.0} per league schema
```

### 12.2 Weekly EFO — Monte Carlo chain (Track A)

The weekly distribution is generated by simulation (N = 2,000 draws; deterministic seed per player-week for reproducibility, Foundation §25.7):

```
for each sim:
  active   ~ Bernoulli( P(active)_w )                 # E1; if 0 → score 0
  drops    ~ NegBinom( E[TeamDB_w], φ_team )          # E8, opponent-adjusted
  rp       ~ Beta( shrunk RP posterior × ramp )       # E2, 10.8 cap applied
  routes   = drops × rp
  targets  ~ Binomial( routes, shrunk TPRR )          # E5
  for each target:
    bucket ~ Categorical( shrunk depth mixture )      # E7
    catch  ~ Bernoulli( P(catch | bucket, QBenv) )    # E9
    yards  = catch × draw( Y | bucket )               # E10, empirical per-bucket dists
    td     ~ Bernoulli( xTD_rate_b )                  # E11 allocation by bucket & EZ share
  rush     ~ archetype rush model (manufactured-touch only; else 0)
  score    = scoring vector applied
output: full empirical distribution → mean, sd, quantiles (p10/p25/p50/p75/p90)
```

Per-bucket catch probabilities and yards-given-catch distributions are estimated once per season from league-wide pbp (Tier 1) and adjusted by player CROE-lite and QBenv — small, bounded shifts (±4 catch-probability points; ±10% yardage scale [TP]).

**Compliance note:** touchdowns come from xTD (opportunity mix), receptions and yards from the chain. Nothing in this pipeline touches the WR Composite score. Independence of targets within a game is a documented MVP approximation (Foundation §25.15) — it understates game-level variance slightly; the negative-binomial dropback layer partially compensates. [TP approximation, stress-test required]

### 12.3 ROS EFO

```
EFO_ROS = Σ over remaining weeks w:
  P(active)_w × E[weekly chain | week-w team context]
with:
  games integration from G_h (E4)
  RP/TPRR posteriors drifted toward their season-stable levels (no per-week matchup detail
    beyond opponent pass-funnel; full weekly schedule simulation deferred)
  teammate-return and ramp schedules applied on their calendar
Distribution obtained by simulating seasons (N = 1,000): draw games-active pattern,
then weekly chain per active week.
```

### 12.4 One-Year EFO

Same season simulator with three changes: (a) RP/TPRR start from *next-season projected* posteriors — current posterior + AD development drift + RD-implied role survival draw; (b) team context uses QB-stability-weighted QBenv mixture and reverts dropbacks toward league mean (k=8 applied at 0.5 strength for cross-season [TP]); (c) G from the annual beta-binomial.

### 12.5 Three-Year and Dynasty inputs

For each explicit season s ∈ {1, 2, 3}:

```
role_state_s ~ annual transition matrix( current state, age band, RD tier )   # Section 14.4
if survives to S4+: run season simulator with age-drifted rates
outputs per season: EFO_s distribution, P(role ≥ S4), P(retired/out of league)
terminal (s ≥ 4): continuation value = season-3 expected utility × survival_s3
                  × Π geometric decay (Section 14.5)
```

These per-season distributions and survival probabilities are the E15/E16 handoff to Dynasty Fundamental Utility. The WR model stops here; discounting to utility happens in the shared layer with the WR model supplying its recommended decay parameters (14.5).

---

## 13. Fundamental Player Utility (handoff specification)

The WR model **supplies**; the shared utility layer **computes**. Per Foundation §4.2 and P15, this section defines the interface, not the utility math.

**WR model supplies per horizon:** the EFO distribution (weekly points quantiles or per-season distributions); games/usable-weeks distributions; role-state probabilities; conditional scenarios (Section 17 event sensitivities) for option-value assessment.

**Shared layer consumes with:** league-schema replacement baselines (the points-per-week of the best freely available WR alternative, computed by format — never a position-label constant); lineup requirements and flex eligibility; startable-week probability = P(WR's week exceeds the user-format start threshold); marginal points above replacement integrated over usable weeks; scarcity from the projected marginal-advantage distribution; nonlinear elite advantage where the latent unit defines it.

**Binding restatement:** this document defines no 0–100 display value, no latent-unit mapping, and no universal WR score. The WR Composite of Section 7 is internal. Any implementation that publishes the WR Composite as "WR value" violates Foundation §3 and this section.

---

## 14. Horizon-Specific Logic

### 14.1 Weekly

Dominated by the gate chain: P(active) → expected RP (with ramp) → matchup-adjusted team dropbacks → current TPRR posterior. QBenv uses the *confirmed starting QB only*; an unconfirmed QB situation triggers a bimodal weekly distribution (both QB scenarios simulated, mixture-weighted by start probability) rather than an averaged mush. Age and contract weights near zero (T9, P18). No schedule beyond this opponent.

### 14.2 Rest of Season

Adds: games-remaining distribution; teammate return calendar (§19.4 reversals scheduled, not guessed); target-competition trajectory (confirmed roster events only); opponent pass-funnel aggregate for remaining schedule; QB stability probability (probability current starter keeps the job, from performance + draft capital + contract, coarse 3-tier [TP]).

### 14.3 One Year

Adds: development/decline drift; role-survival through one offseason (coaching change, free agency, draft); contract-year and team-transition flags; regression of team environment toward mean. The single most important one-year discipline: **current-season efficiency regresses hard; current-season role and earning carry forward with drift.** [SPR]

### 14.4 Three Years — annual transition matrix

MVP transition model: a single annual matrix over collapsed states {S0–S1 (out/depth), S2–S4 (partial), S5 (full-time), S6–S7 (primary/elite)}, stratified by age band (≤23, 24–28, 29+) and RD tier (RD < 40, 40–65, > 65). That is 4×4 × 3 × 3 = 144 cells, estimable from ~10 years of public data with hierarchical pooling toward the age-band margin [TP; estimation plan §21.6]. Applied recursively for seasons 2–3 with age advancing.

### 14.5 Dynasty

Explicit seasons: 3. Beyond that, terminal continuation per Foundation §14.6: continuation value proportional to season-3 utility × survival, with recommended geometric decay δ = 0.85/season and sensitivity reporting at δ ∈ {0.80, 0.90} [TP]. The WR model's dynasty deliverable is the labeled set of season distributions + survival curve + decay recommendation — Dynasty Fundamental Utility and Dynasty Intrinsic Asset Value are computed downstream (§14.2–14.3 of the Foundation). **No market popularity, trade demand, or age *preference* (as opposed to age *hazard*) enters any of it** — the market's taste for youth is a Dynasty Market Price phenomenon (Foundation §14.4) and is structurally unreachable from here.

Option value: conditional upside scenarios (QB upgrade, competitor departure — Section 17) are passed as named scenarios so the utility layer can price football-derived option value per Foundation §4.3. The WR model does not itself add option-value points.

---

## 15. Rookie and Low-Sample WR Handling

### 15.1 Prior construction (pre-draft rookies)

```
prospect_prior_percentile =
  0.55 × draft_capital_score        # smooth function of pick number, log-scaled [SPR]
+ 0.30 × age_adjusted_production    # final-season receiving market share, age-discounted
+ 0.10 × breakout_age_score
+ 0.05 × athletic_testing_score
```
Mapped to prior distributions over TPRR, depth mixture, and rookie-season RP (from historical rookie cohorts by capital band [TP tables, buildable from nflverse]). Competition level adjusts the production input (G5 discount ≈ 0.85 [TP]). Early declare adds +2 percentile [TP].

### 15.2 Post-draft, pre-routes

Landing spot updates the prior: TCI of the drafting team, projected team dropbacks, QBenv, and confirmed depth-chart placement adjust *expected RP* — not talent priors. Draft capital *spent by the team* is itself role evidence (a top-40 pick is a revealed intent to play him) [SPR].

### 15.3 Camp and preseason

Foundation §19.3 default skepticism. Admissible: first-team route participation in preseason games (counted, not narrated), confirmed depth-chart releases. Inadmissible: highlight clips, coach praise, beat-writer hype. Admissible items move expected Week-1 RP with a cap of ±15pp from the capital-implied baseline [TP].

### 15.4 Prior decay schedule (the core mechanism)

```
prior_weight = K_prior / (K_prior + career_routes)
K_prior by draft capital: R1: 250 | R2: 200 | R3: 150 | R4–5: 100 | R6–7/UDFA: 60   [TP]
posterior = prior_weight × prospect_prior + (1 − prior_weight) × observed (shrunk per §9)
```

Higher capital ⇒ stickier prior, in both directions: a struggling first-rounder keeps benefit-of-the-doubt longer, and a hot UDFA earns belief faster. By ~400–500 routes (roughly one full season), evidence dominates for everyone. This *is* the "Draft Capital × Early NFL Evidence" interaction (10.10). There is no other rookie mechanism — explicitly no rookie boost, no hype term.

### 15.5 Specific policies

- **Rookies before meaningful routes:** valued from prior + expected-RP path; State Uncertainty at maximum band; weekly EFO gated by expected RP which may be near zero even for high picks.
- **Injured rookies:** prior frozen (no decay without routes); availability model per 5.8; uncertainty widened, value not zeroed.
- **Year 2 receivers:** prior_weight recomputed on actual career routes; the Year-2–3 development drift (8.7) applies; a Year-2 WR with 200 quiet rookie routes retains meaningful prior mass — one bad rookie year does not erase draft capital.
- **Undrafted/late-round breakouts:** low K_prior means their route and TPRR evidence dominates quickly (T11). The known bias to fight is *under*-rating them (F7, Section 22); the mitigation is exactly this fast decay.
- **Veterans changing teams:** not a prior reset. Skill posteriors (TPRR, CROE, depth tendencies) travel with the player; role posteriors (RP, TS) re-anchor to the new team's TCI and depth chart with State Uncertainty raised one band for 4 weeks [TP]; team context switches immediately. Per Foundation §19.2, a new team is never assumed better.

---
## 16. Confidence Model Inputs

The WR model does not build the platform Confidence Model (Foundation §17); it emits named contributors. Every output row carries these fields.

### 16.1 Contributors by confidence object

| Foundation object | WR contributors emitted |
|---|---|
| State Uncertainty (§17.2) | entropy of the role-state vector; RP posterior interval width; injury-information grade; depth-chart staleness days; unconfirmed-QB flag; weeks-since-team-change |
| Forecast Uncertainty (§17.3) | per-horizon EFO distribution width (already produced by simulation); rookie/low-route flag; bimodal-scenario flag (14.1); TD-dependence share of projected points (players whose value concentrates in xTD carry wider outcome distributions) |
| Intrinsic-Estimate Confidence (§17.4) | career routes observed; games observed; prior_weight (how prospect-dependent the estimate is); rp_source = proxy flag; disagreement index = \|pct(TPRR) − pct(production per game)\| (earning and output telling different stories); count of [TP] parameters binding on this player's estimate |
| Data-Quality Confidence (§17.6) | per-signal freshness stamps; proxy-route flag; missing-input list with fallback used; provider disagreement flags |
| Explanation Confidence (§17.7) | whether movement decomposes cleanly (one driver ≥ 50% of movement) or is distributed (Section 20.5 honest-incompleteness case) |

### 16.2 MVP WR confidence rubric

A simple 0–100 **WR Evidence Adequacy** score for internal triage (not user-facing without the composite governance of §17.10):

```
adequacy = 100
  − 30 × prior_weight                       # prospect-dependent estimates
  − 15 × (rp_source == proxy)
  − 15 × injury_ambiguity (0–1 graded)
  − 10 × unconfirmed_QB_flag
  − 10 × (weeks_since_team_change ≤ 4)
  − 10 × disagreement_index_scaled (0–1)
  −  5 × stale_depth_chart_flag
floor 0                                                     [TP weights]
```

Per Foundation P10/§17.8: adequacy never subtracts value anywhere. It widens intervals, restricts downstream classification, and drives explanation warnings. Any code path that multiplies EFO or a component score by adequacy is non-compliant.

---

## 17. WR Volatility and Event Sensitivity

Foundation §18 objects, WR-specific contributors. Scoring-week variance (Fantasy Output Volatility) is already delivered by the Section 12 distribution and is **never** relabeled as asset volatility (§18.3).

### 17.1 Intrinsic Value Revision Volatility contributors

Expected dispersion of *future revisions* to the WR's intrinsic estimate as football evidence arrives. WR drivers, each emitted as a flag/scale:

- fragile route role (S2–S4 states, or S5+ with falling trend);
- low sample (prior_weight > 0.4);
- unresolved QB situation;
- rookie/Year-2 development window (their estimates legitimately move most);
- teammate return pending (temporary share holder);
- expiring contract / cut-candidate structure;
- narrow specialization (S3);
- injury with uncertain recovery.

MVP output: a 3-tier revision-volatility band (Low/Med/High) from a point count over these flags [TP], plus the named drivers. Asymmetry (§18.2) is preserved by emitting the upside and downside event lists separately, below.

### 17.2 Event Sensitivity scenarios (scenario-based, per Foundation §18.1, object 4)

For each WR, the model computes conditional EFO deltas for whichever scenarios apply, by re-running the Section 12 chain with the scenario's parameter change:

| Scenario | Parameter change [TP magnitudes, per-case where computable] |
|---|---|
| Starting QB injury | QBenv → backup value; dropbacks re-projected |
| QB upgrade (confirmed acquisition) | QBenv → new value; staged confirmation per §19.3 coaching/trade rules |
| Target competitor injury | TCI reduced; this WR's TPRR posterior mean +Δ proportional to vacated claim × alignment overlap; flagged reversible |
| Target competitor return | inverse of above, on the known calendar |
| Route expansion (confirmed promotion) | RP posterior re-centered on deployment evidence |
| Role demotion | RP re-centered down; RT flag on |
| Player traded | Section 15.5 team-change rules |
| Contract extension | contract_security ↑ ⇒ RD ↑ ⇒ transition matrix shift |
| Team drafts WR early | incoming_competition_flag; RD −8; TCI ↑ |
| Coaching change | uncertainty ↑ immediately; scheme tendency shift; confirmation deferred (§19.3) |

Each emitted as: scenario name, direction, EFO delta (per relevant horizon), and probability *not estimated* in MVP (scenario sensitivity is conditional; probabilities of the events themselves are deferred except where schedule-known, like teammate return dates).

---

## 18. Update Rules

Governing principle: update size = information content (Foundation P5, §19.1). Role evidence moves fast; result evidence moves slow (§9.5).

### 18.1 Standing reactions

| Event | Update |
|---|---|
| One strong game (production spike, role flat) | Efficiency inputs update through their k's only — a 3-140-2 line on 5 targets moves TPRR by its 5-target weight and xTD barely. Component-score movement cap: ±4 points per component per week absent role change [TP]. Explanation notes the spike as observed event, not state change. |
| One weak game (role intact) | Symmetric to above. |
| Route expansion (RP jump ≥ 15pp sustained 2 games, or confirmed depth-chart move) | Role evidence: RP posterior re-centers within 2 weeks (k=60 does this naturally); RR cap lifted; state vector shifts. This is the §19.2 "clear depth-chart change supported by actual deployment" case — smoothing bypass permitted. |
| Target spike without routes (10 targets on 45% RP) | TPRR updates on its k; RP does not move on targets. Flag disagreement; raise revision-volatility band. No RR movement. |
| 3–4 games of sustained target earning | TPRR posterior has ~120–200 routes of new evidence — this legitimately moves TE materially. This is the designed T11 breakout-recognition path. |
| TD spike (e.g., 2 long TDs on 4 targets) | xTD moves by the 4-target weight of the n/(n+300) blend ≈ 1.3% weight — near-nothing. Enforced contrast with the route-expansion row above: the prompt's canonical pair behaves correctly by construction. |
| QB change (confirmed) | QBenv switches immediately (§19.2); depth-bucket catch probabilities and TD environment shift; receiver skill posteriors untouched. Weekly bimodality if start unconfirmed. |
| Injury (confirmed) | Horizon-split per §19.2: weekly availability now; ROS recovery timeline; 1yr+ per 5.8 hazard tiers. |
| Player trade | 15.5 veteran-change rules, immediate (§19.2). |
| Teammate injury | TCI recompute; affected WR TPRR prior shifts by vacated-claim share; reversal scheduled per §19.4. |
| Preseason hype / camp reports | §19.3 skepticism: countable first-team routes admissible (±15pp Week-1 RP cap); narratives inadmissible. Unconfirmed camp signal decays to zero by Week 3 if deployment doesn't confirm (§19.4). |
| Camp depth-chart release (official) | Expected RP re-anchors; uncertainty stays wide until real-game confirmation. |
| Contract event | RD inputs update immediately (§19.2 major contract event); no direct output change beyond durability/transition effects (P18). |

### 18.2 Maximum update sizes (smoothing rules) [TP]

- Component scores: ±4/week without a §19.2 confirmed structural event; unlimited with one (the bypass).
- RP posterior mean: natural k=60 dynamics; no additional cap (role is supposed to move fast).
- xTD rate: realized-TD channel capped by its n/(n+300) weight; opportunity channel (end-zone share) capped by k=25.
- QBenv: recomputed on events; between events drifts only via its k=300 EPA shrink.
- Every §19.4 reversible update carries its reversal trigger in the stored record.

---

## 19. Missing Data and Fallbacks

Foundation §8.4/P23: missingness reduces confidence before it distorts value; silent zero imputation prohibited.

| Missing item | Fallback | Confidence effect |
|---|---|---|
| Route data (charted) | Proxy routes = pass snaps × 0.97 | rp_source=proxy; RR cap 92; −15 adequacy |
| Route data AND snap data | Depth chart + prior RP; state uncertainty max band | Data-Quality flag critical; ROS+ estimates only, weekly restricted |
| Target depth / air yards | Archetype-default depth mixture | −10 adequacy; TQ marked prior-driven |
| Catchability inputs (always, in MVP) | QBenv team-level absorption | documented MVP limitation |
| Rookie NFL history | Section 15 prior regime | prior_weight reported |
| Vague injury info | P(active) interval widened around designation-table value; mean unchanged | injury_ambiguity graded |
| QB projection missing (unclear starter) | Bimodal simulation (14.1); if fully unknown, QBenv = −0.3 default | unconfirmed_QB flag |
| Stale team context (> 14 days old in-season) | League-mean reversion at 25% strength [TP] | stale flag; freshness stamp |
| Stale depth chart | Last-confirmed + RT-style uncertainty raise | stale_depth_chart flag |
| Provider disagreement (e.g., snap counts differ) | Higher-reliability source per registry; else average + flag | provider_disagreement flag |

Every fallback writes which path was taken into the output record (Section 23.6) so explanations and audits can see it. No fallback silently substitutes zero for any rate.

---

## 20. Explanation Contract

Per Foundation §22: attributions, not causes; honest incompleteness; movement decomposition.

### 20.1 Required driver fields per WR output

```
primary_positive_driver     { component, signal, direction, magnitude_band }
primary_negative_driver     { same }
movement_drivers[]          { driver, share_of_movement, evidence_type }   # evidence_type ∈
                            { model_attribution, observed_event, inferred_state, unresolved }
role_change_flag            { from_state, to_state, evidence }
confidence_warnings[]       { proxy_routes | low_sample | injury_ambiguity | unconfirmed_qb | ... }
next_evidence[]             { the 1–3 observations that would most move this estimate }
```

### 20.2 Language rules

Use: "contributed to," "is consistent with," "the model estimate changed through," "increased the probability of." Never: "caused," "will," "proves." (Foundation §22.2.)

### 20.3 Example templates

**Role promotion (observed event + inferred state):**
> ROS estimate rose. Observed: route participation increased from 51% to 84% over the last two games following [teammate]'s injury (observed event). The model now assigns 71% probability to a full-time role while [teammate] is out (inferred state). This share is flagged reversible: [teammate]'s expected return in Week 12 is the largest scheduled negative driver. Next evidence: route participation in the next two games; any practice-report change on [teammate].

**TD spike, correctly muted (model attribution):**
> Weekly production exceeded projection by 19 points, driven by two touchdowns on four targets (observed event). The rest-of-season estimate moved only slightly: touchdown conversion carries a very small update weight at this sample size, and route participation and target earning were unchanged (model attribution). Unresolved: whether the end-zone usage in this game reflects a designed role change; two more games of end-zone target share would resolve it.

**Low-confidence rookie (unresolved uncertainty):**
> This estimate is 62% prior-driven: [player] has 74 career routes. The projection reflects Round 1 draft capital and strong age-adjusted college production more than NFL evidence. Evidence adequacy is Low. Next evidence: route participation in Weeks 1–3 — sustained deployment above 70% would shift the estimate materially in either direction depending on target earning.

**Distributed movement (honest incompleteness, §22.5):**
> The one-year estimate declined modestly. No single driver accounts for the majority of the movement; small negative contributions came from target-earning trend, a quarterback-environment downgrade, and rising target competition (model attribution, distributed). No structural event occurred.

---

## 21. Validation Plan

Scaled for a hobby project; compliant in structure with Foundation §25. Everything runs on free historical nflverse data, 2016–2024, on a laptop.

### 21.1 Estimand-first declarations (Foundation §25.2)

Primary validation targets and metrics:

| Target | Primary metric | Secondary |
|---|---|---|
| Next-week WR points | MAE vs. baselines | rank correlation (Spearman) among active WRs |
| Next-4-week points | MAE | interval coverage of p10–p90 |
| ROS points | MAE, rank corr | top-12/24/36 finish probability calibration (Brier + reliability curve) |
| Next-season points | MAE, rank corr | same finish-probability calibration |
| Games active | calibration of the beta-binomial | — |
| Target share / RP next-4-weeks | MAE of the regressed estimates | validates the k table (§9.2) |

### 21.2 Baselines (all must be beaten to promote; Foundation §25.11)

1. Previous-season fantasy PPG (naive).
2. Current-season PPG to date.
3. RP × target share linear kicker (the "cheap opportunity model").
4. Public consensus projection (one free source, archived weekly).
5. Simple age-adjusted prior-production model.

If the MVP cannot beat baselines 1–3 out of sample, it does not ship. Beating baseline 4 is the aspiration, not the gate, for v1 [EI — consensus projections are strong; a transparent model that ties them while explaining itself still clears the product bar of the Foundation's final rule].

### 21.3 Split design (Foundation §25.4)

Rolling-origin by season: train/calibrate k's and weights on seasons up to Y, validate on Y+1, roll Y across 2018–2024. No random row splits. One sealed season (most recent complete) held out for final pre-release evaluation only, access-logged (§25.5, single-reviewer hobby version: a written log).

### 21.4 Calibration checks (§25.10)

P(active) by designation bucket; games-played distribution; top-N finish probabilities; EFO interval coverage (target: p10–p90 covers ~80% of outcomes; document deviation).

### 21.5 Parameter calibration path (retires the [TP] tags)

- k constants: grid search per §9.1's declared criterion, per metric.
- Horizon weights (§7.3): because Track B doesn't produce EFO, weights are calibrated against their actual jobs — RD/AD parameters against role-survival and transition outcomes; the composite against rank-correlation with horizon outcomes as a diagnostic.
- Age table (§8.7): re-estimated from cohort transitions **including washed-out players** (P16 survivorship control): denominator = all WRs at age A with state ≥ S4, numerator = those retaining ≥ S4 at A+1.
- Transition matrix (§14.4): hierarchical pooled estimation, 2013–2024.

### 21.6 Ablations and stability (§25.11, §25.13)

Remove each component family; measure MAE/rank/calibration deltas. Components that add nothing measurable are cut (the prompt's own cost gate). Stability: week-over-week rank churn among top-48 WRs must stay under a declared threshold absent structural events [TP threshold, set after first replay].

### 21.7 Archetype error review (§25.17)

Error decomposition by archetype and cohort: rookies, age-29+, slot vs. downfield, low-capital breakouts, injured-return players, weak-offense WRs. Recurring category bias triggers prior revision, not silent reweighting (§25.14).

### 21.8 Deferred validation infrastructure

Full season replay (§25.7) is the declared eventual enhancement: the MVP stores point-in-time snapshots from day one (Section 23.7) precisely so replay becomes possible without archaeology. Mispricing backtests (§25.8) are out of scope here — they belong to the platform once the market model exists.

---

## 22. Failure Modes and Mitigations

| # | Failure | Mitigation in this design |
|---|---|---|
| F1 | Overvaluing empty volume (targets/air yards without conversion or routes) | TQ gate cap (8.3/10.4); TPRR as primitive over raw targets; CROE in EF |
| F2 | Overreacting to touchdowns | n/(n+300) realized-TD weight; xTD from opportunity; single-number rule 10.9 |
| F3 | Overrating targets earned on low routes | RP×TPRR multiplicative chain — low RP caps expected targets regardless of TPRR; uncertainty raised on thin-route TPRR (10.1) |
| F4 | Double-counting target opportunity | TS demoted to check/fallback (5.2); air yards inside the mixture only (8.3); YPRR vs TPRR overlap resolved by using yards/target-given-depth in EF (5.4.1) |
| F5 | Underrating role loss | Route trend in RR and RD; RT flag; §19.2 deployment-confirmed demotions bypass smoothing |
| F6 | Overtrusting draft capital | Prior decay schedule 15.4 — capital is starting weight, routes destroy it; F6 is bounded by K_prior |
| F7 | Missing late-round breakouts | Low K_prior for low capital ⇒ evidence dominates fast; T11 role-first updating; archetype error review 21.7 monitors it |
| F8 | Overreacting to QB changes | QBenv shifts bounded (±4 catch pts, ±15% TD env); receiver skill posteriors never touched by QB events; staged confirmation for coaching changes |
| F9 | Slot vs. outside mishandling | Depth-bucket mixture as the core value mechanism (not a slot penalty); archetype priors; QBenv depth-weighting 10.5 |
| F10 | Age-curve bias (survivorship) | 21.5 cohort estimation including washouts; age as multiplier never cliff |
| F11 | Injury-information error | Information-confidence grading (5.8.5); vague info widens, never moves means; no diagnosis modeling |
| F12 | Stale depth chart | Freshness stamps; staleness flags; §19 fallback row; recompute on confirmed roster events |
| F13 | Missing/inconsistent route data | Documented proxy with validation (proxy vs. charted comparison on 2016–2023 overlap is a required pre-launch test); RR cap; adequacy penalty |
| F14 | Market leakage into intrinsic estimates | No market input exists anywhere in Sections 5–19; §24.3-only pathway for market-revealed facts; circularity audit hook in Section 23.8 |
| F15 | Composite score quietly becoming the forecast | Two-track architecture 7.1; compliance test in Section 25 (case 15); code review rule: EFO module imports no composite module |

---
## 23. MVP Implementation Specification

The exact first build. One developer, AI-assisted, Python, laptop-scale.

### 23.1 Required data inputs (all free at launch)

| Feed | Source | Cadence |
|---|---|---|
| Play-by-play (targets, air yards, yardline, EPA, receptions, yards, TDs) | nflverse `load_pbp` | weekly |
| Snap counts | nflverse `load_snap_counts` | weekly |
| Weekly player stats | nflverse `load_player_stats` | weekly |
| Injuries + practice reports | nflverse `load_injuries` | daily in-season |
| Depth charts | nflverse `load_depth_charts` | weekly + events |
| Rosters, age, draft | nflverse `load_rosters`, `load_draft_picks` | annual + events |
| Contracts | nflverse `load_contracts` (OTC) | on event |
| College production (rookie priors) | cfbfastR / public stats | annual |
| Historical participation (routes, 2016–2023) | nflverse `load_participation` | one-time, for calibration + proxy validation |

Optional Tier 2-lite upgrade: one charting subscription for current-season routes, behind a source adapter (Foundation §8.3) so the proxy path stays the tested fallback.

### 23.2 Calculation sequence (weekly run)

```
1. Ingest feeds → point-in-time snapshot (23.7)
2. Identity resolution → canonical WR list
3. Compute raw signals (Section 6 sixteen)
4. Shrinkage pass (Section 9 table) → posteriors
5. Prior blend for low-sample players (Section 15.4)
6. Derive: proxy routes, TPRR, depth mixture, xTD, TCI, QBenv
7. Component scores (Section 8) → WR Composite per horizon (Track B)
8. Role-state vector (Section 4)
9. EFO simulations per horizon (Section 12, Track A)
10. Confidence contributors (16), volatility band + event sensitivities (17)
11. Explanation drivers (20)
12. Write versioned output records; diff vs. prior week → movement decomposition
```

### 23.3 Component formulas and weights

As specified in Sections 8 (formulas), 7.3 (horizon weights), 9.2 (k table), 15 (priors) — no additional formulas exist outside this document.

### 23.4 Refresh cadence

Weekly full run Tuesday; daily availability-only update Wednesday–Sunday (steps 1, 3-injury, 8-partial, 9-weekly only); event-triggered partial runs for §19.2 events.

### 23.5 Storage

SQLite (or flat parquet) with tables: `snapshots`, `signals`, `posteriors`, `components`, `states`, `efo_quantiles`, `confidence`, `events`, `explanations`, `versions`. Every row carries: model_version, data_version, valuation_timestamp, information_cutoff_timestamp. Total volume is trivial (< 1 GB/season).

### 23.6 Output record (WR contribution to Foundation §27 contract)

Per player-horizon: identity + schema version + timestamps; EFO quantiles (p10/25/50/75/90) and mean; per-stat expectations (rec, yds, TD); G distribution; role-state vector; component scores + composite (flagged internal); prior_weight; confidence contributors (16.1); adequacy score; revision-volatility band + event sensitivities; explanation fields (20.1); fallback log; [TP]-binding count.

### 23.7 Point-in-time discipline

Raw feed pulls are archived immutably before any processing, keyed by pull timestamp. This is cheap now and priceless when season replay (§25.7) arrives. Non-negotiable even in MVP [per Foundation P25].

### 23.8 Tests (pre-launch gate)

1. Unit tests per component formula (fixed fixtures → expected scores).
2. Shrinkage monotonicity: more sample ⇒ posterior closer to observed.
3. Gate tests: P(active)=0 ⇒ weekly EFO ≡ 0; RP≈0 ⇒ near-zero targets.
4. Anti-double-count: injecting a 2-TD game moves xTD < 2% and EF/TQ not at all.
5. Proxy validation: proxy routes vs. charted routes, 2016–2023, r and bias by archetype; publish the error table.
6. Circularity audit (Foundation §24.4): static check that no module imports market data; no consensus/ADP field exists in the schema.
7. Determinism: same snapshot + seed ⇒ identical outputs.
8. Fallback coverage: every Section 19 row exercised by a fixture.
9. The 15 acceptance cases of Section 25 as integration fixtures.

### 23.9 Explicitly not required for MVP

Charted route data; Bayesian inference libraries; ML frameworks; real-time ingestion; paid APIs; any AI/LLM call in the valuation path (LLMs may assist development, never computation); joint QB–WR distributions; weekly schedule simulation beyond pass-funnel; the market model; the latent-unit mapping; season replay (snapshots only).

---

## 24. Deferred Enhancements

Each is optional future research. None is a hidden MVP dependency — the Section 23 build references none of them.

| Enhancement | Unblocks | Precondition |
|---|---|---|
| Charted routes + route types (Tier 2-lite) | Better RP/TPRR precision; alignment durability signal | License review (§8.5); adapter built |
| First-read target share | Earlier breakout detection | Affordable reliable source appears |
| Separation / coverage metrics | Efficiency decontamination | Tier 2 licensing |
| Catchable-target charting | Replace QBenv team-level absorption | Same |
| Data-driven archetype clustering | Replace 11.2 deterministic table | ≥2 seasons of platform data + ablation win |
| Survival models (Cox / discrete-time hazard) for role loss | Replace 14.4 matrix | Matrix ships first and sets the baseline |
| Full Bayesian updating (posterior sampling) | Replace k-shrinkage | Only if calibration shows k-form inadequate — simpler wins ties |
| Joint QB–WR outcome distributions | Correlated-outcome utility (§25.15) | Platform demand from package/roster layer |
| Injury recurrence modeling by injury type | Replace 5.8 coarse tiers | Historical injury-type dataset with rights |
| Season replay engine | Full §25.7 compliance | Snapshot archive matured (already collecting) |
| Weekly full-schedule simulation | Sharper ROS | Marginal; after baseline wins |

---

## 25. Acceptance Tests

Expected behavior is the test. Each becomes a fixture in 23.8.9.

| # | Case | Expected model behavior |
|---|---|---|
| 1 | Elite target earner, poor recent TD luck (S7, 28% TPRR, 1 TD in 8 games) | xTD near opportunity-implied level, far above realized; ROS/1yr estimates barely dented; explanation names TD conversion as a small negative model attribution with regression note |
| 2 | Low-route receiver, high target share (RP 45%, TS 22%) | TPRR posterior high but uncertainty wide (10.1); expected targets capped by RP; TQ/TE strong, RR weak; revision volatility High; next_evidence = route expansion |
| 3 | Full-time receiver, weak earning (RP 88%, TPRR 13%) | State S5 not S6; steady low-ceiling EFO; RD moderate; explanation: role size secure, per-route claim below starter norm |
| 4 | R1 rookie, zero routes (pre-Week 1) | Estimate ~100% prior-driven; prior_weight ≈ 1; adequacy Low; weekly EFO gated by expected RP; no boost anywhere |
| 5 | R6 rookie earning full-time routes (3 weeks, RP 85%) | K_prior=60 ⇒ evidence dominates within ~150 routes; TE reflects observed TPRR quickly; T11 path demonstrably faster than for case 4's profile |
| 6 | Productive veteran, declining routes (top-12 PPG, RP 82%→64% over 8 games) | Route trend drags RR and RD; RT flag; 1yr/3yr estimates fall while weekly stays strong; horizon divergence flagged per Foundation §13.3 |
| 7 | Deep threat, high air yards, low catchability (aDOT 16, CROE −6%) | TQ gate cap engaged if TPRR percentile < 35; EF low; wide outcome distribution; F1 does not fire |
| 8 | Slot receiver, high catch rate, low depth (aDOT 6.5, catch 78%) | CROE-lite ≈ neutral (depth-expected catch rate is high); value flows from PPR receptions in the chain; not overrated by raw catch rate, not underrated by aDOT |
| 9 | Receiver loses QB (season-ending injury to starter) | QBenv → backup immediately; bounded shift (F8); skill posteriors unchanged; event logged; explanation separates observed event from model attribution |
| 10 | Receiver gains QB upgrade (confirmed trade for elite QB) | QBenv up within bounds; TD environment and deep catch probability rise; no generic bonus; integration-delay note per §19.2 |
| 11 | Teammate injury opens targets | TCI drop; TPRR prior shift proportional to vacated claim; ROS up; reversal scheduled to teammate return; RD unchanged (temporary share flagged) |
| 12 | Injured receiver, uncertain return ("week-to-week," vague) | P(active) interval widens around designation value; mean not moved by vagueness; injury_ambiguity graded; ROS integrates return-date distribution |
| 13 | TD spike on limited usage (2 TDs, 4 targets, RP 40%) | Near-zero estimate movement (18.1 canonical pair); contrast with case 5 verified in the same fixture run |
| 14 | Stable veteran, low volatility (age 27, S6, 3 years contract, stable QB) | Revision-volatility Low; short event-sensitivity list; strong priors; small weekly updates; adequacy High |
| 15 | Market-hyped receiver, no football evidence (offseason hype, RP/TPRR mediocre) | Model unmoved — hype has no input channel to move through (F14); estimate reflects football posteriors only; the *absence* of any hype-tracking field is the test |
| 16 | Veteran changes teams (good WR to crowded room) | Skill travels, role re-anchors to new TCI (15.5); State Uncertainty up one band 4 weeks; team context switches immediately; no automatic upgrade |
| 17 | Proxy-route regime (charting feed removed) | rp_source=proxy everywhere; RR caps engage; adequacy −15; outputs continue; Data-Quality flags visible — Foundation §28 case 18 analog |

---

## 26. Practical Hobby MVP Implementation Contract

### 26.0 Authority and implementation boundary

This section is the complete, binding specification for the first coded WR MVP.

Sections 1–25 remain the research rationale and future roadmap. A developer implementing the first MVP must follow this section when an earlier section describes a more complex method.

The first MVP is intended to be:

- useful for comparing wide receivers;
- transparent enough to explain its outputs;
- deterministic and easy to test;
- buildable from normalized JSON or CSV data;
- extendable later without rewriting the entire application.

The first MVP does **not** require:

- a fitted Bayesian model;
- play-level or target-level Monte Carlo simulation;
- annual Markov transition matrices;
- live paid charting feeds;
- automated historical backtesting infrastructure;
- market price, trade value, or mispricing classification;
- production-grade statistical calibration.

Those items are future upgrades and must not block the first working version.

### 26.1 MVP deliverables

The coded WR engine must accept one normalized player input record and return:

1. eight WR component scores from 0–100;
2. one internal composite for each of five horizons;
3. expected weekly receiving statistics and fantasy points;
4. ROS expected fantasy points;
5. a confidence score and label;
6. a volatility score and label;
7. up to three positive and three negative explanation drivers;
8. a fallback log;
9. version and timestamp metadata.

The engine must run from fixture data before any live API integration is attempted.

### 26.2 Canonical conventions

- Percentages and rates are stored as decimals from `0.00` to `1.00`.
- Percentile scores and components are stored from `0` to `100`.
- Fantasy scoring defaults to full PPR: one point per reception, 0.1 points per receiving yard, and six points per receiving touchdown.
- Calculations use full precision internally.
- Displayed component scores use one decimal place.
- Displayed fantasy outputs use one decimal place.
- Missing numerical values never silently become zero.
- All component outputs are clamped to `[0,100]`.
- Weights are decimal fractions and must sum to `1.00`.

### 26.3 Required normalized input

```ts
interface WRMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: 1|2|3|4|5|6|7|null;
  career_routes: number;

  // Current role and opportunity
  route_participation_last4: number | null;   // 0–1
  route_participation_last8: number | null;   // 0–1
  targets_per_route_run: number | null;       // 0–1
  target_share: number | null;                // 0–1
  projected_team_dropbacks: number | null;    // per game

  // Target quality and efficiency
  expected_fantasy_points_per_target: number | null;
  catch_rate_over_expected: number | null;    // decimal; 0.04 = four percentage points
  depth_adjusted_yards_per_target: number | null;
  average_depth_of_target: number | null;      // yards
  expected_td_rate_per_target: number | null; // 0–1

  // Team environment
  qb_environment_score: number | null;         // 0–100
  team_points_per_drive: number | null;

  // Availability and role durability
  injury_status: "HEALTHY"|"QUESTIONABLE"|"DOUBTFUL"|"OUT"|"IR"|"PUP"|"SUSPENDED"|"UNKNOWN";
  practice_status: "FULL"|"LIMITED"|"DNP"|"UNKNOWN";
  expected_games_remaining: number;
  contract_security: number | null;            // 0–1
  competition_pressure: number | null;         // 0–1; higher is worse
  route_role_change: "PROMOTED"|"DEMOTED"|"STABLE"|"UNKNOWN";

  // Optional history used for trend and fallbacks
  previous_route_participation: number | null;
  previous_targets_per_route_run: number | null;
  career_targets_per_route_run: number | null;
  career_expected_fantasy_points_per_target: number | null;

  scoring?: {
    points_per_reception: number;
    points_per_receiving_yard: number;
    points_per_receiving_td: number;
  };

  as_of_timestamp: string;
}
```

No additional field is required for the first MVP.

### 26.4 Percentile reference table

Version 1 uses a configuration file containing WR reference distributions for:

- route participation;
- TPRR;
- target share;
- expected fantasy points per target;
- catch rate over expected;
- depth-adjusted yards per target;
- projected team dropbacks;
- team points per drive.

The first implementation may ship with a fixed fixture-based reference table. It does not need to scrape or recalculate league percentiles automatically.

Use empirical percentile rank with average-rank tie handling. Clamp all percentile results to `[0,100]`.

If a reference distribution is unavailable, use the neutral percentile `50` and record a fallback penalty of five confidence points.

### 26.5 Fallback rules

Apply fallbacks in this exact order.

| Field | Primary | First fallback | Final fallback | Confidence penalty |
|---|---|---|---|---:|
| RP4 | `route_participation_last4` | RP8 | `0.50` | 8 |
| RP8 | `route_participation_last8` | RP4 | `0.50` | 8 |
| TPRR | current TPRR | career TPRR | `0.18` | 10 |
| Target share | current target share | `RP4 × TPRR`, capped at `0.35` | `0.12` | 6 |
| xFP/target | current value | career value | league reference median | 8 |
| CROE | current value | none | `0.00` | 5 |
| Depth-adjusted Y/T | current value | none | league reference median | 5 |
| aDOT | current value | none | `10.0` yards | 3 |
| xTD/target | current value | none | `0.05` | 5 |
| Team dropbacks | projection | league reference median | `34.0` | 5 |
| QB environment | current score | neutral | `50` | 8 |
| Points/drive | current value | league reference median | `1.90` | 5 |
| Contract security | current value | draft-round mapping | `0.40` | 4 |
| Competition pressure | current value | neutral | `0.50` | 4 |

Draft-round security mapping:

```text
Round 1 = 1.00
Round 2 = 0.80
Round 3 = 0.65
Rounds 4–5 = 0.45
Rounds 6–7 = 0.25
Undrafted/unknown = 0.20
```

Every fallback must be recorded. The calculation continues unless player identity, age, or expected games remaining is missing.

### 26.6 Simple shrinkage

Version 1 uses only two shrinkage rules.

#### TPRR

```text
sample_weight = career_routes / (career_routes + 150)
prior_weight = 1 − sample_weight
shrunk_TPRR = sample_weight × current_or_fallback_TPRR
            + (1 − sample_weight) × prior_TPRR
```

Prior TPRR:

```text
Round 1 = 0.21
Round 2 = 0.20
Round 3 = 0.19
Rounds 4–5 = 0.18
Rounds 6–7/UDFA/unknown = 0.17
```

When career routes are at least 300, use the ordinary formula above; do not add additional prospect blending.

#### Efficiency metrics

For CROE and depth-adjusted yards per target:

```text
sample_weight = career_routes / (career_routes + 250)
shrunk_metric = sample_weight × observed_metric
              + (1 − sample_weight) × neutral_prior
```

Neutral priors are `0.00` for CROE and the league reference median for depth-adjusted yards per target.

No other MVP signal is shrunk.

### 26.7 Trend scores

```text
route_delta = RP4 − previous_route_participation
route_trend_score = clamp(50 + 200 × route_delta, 0, 100)
```

If previous route participation is missing, use `50`.

```text
tprr_delta = shrunk_TPRR − previous_targets_per_route_run
tprr_trend_score = clamp(50 + 300 × tprr_delta, 0, 100)
```

If previous TPRR is missing, use `50`.

### 26.8 Component formulas

All component formulas below are binding.

#### Route Role — RR

```text
RR = clamp(
  0.60 × pct(RP4)
+ 0.25 × pct(RP8)
+ 0.15 × route_trend_score,
0,100)
```

#### Target Earning — TE

```text
TE = clamp(
  0.75 × pct(shrunk_TPRR)
+ 0.15 × pct(target_share)
+ 0.10 × tprr_trend_score,
0,100)
```

#### Target Quality — TQ

```text
TQ_raw = pct(expected_fantasy_points_per_target)
```

Apply a deep-target reliability cap:

```text
if average_depth_of_target >= 15
and shrunk_TPRR < 0.18
and catch_rate_over_expected < 0:
    TQ = min(TQ_raw,65)
else:
    TQ = TQ_raw
```

#### Efficiency — EF

```text
EF_raw = 0.55 × pct(shrunk_CROE)
       + 0.45 × pct(shrunk_depth_adjusted_yards_per_target)
```

If `career_routes < 200`, clamp EF to `[20,80]`. Otherwise clamp it to `[0,100]`.

#### Team Context — TC

```text
TC = clamp(
  0.45 × pct(projected_team_dropbacks)
+ 0.35 × qb_environment_score
+ 0.20 × pct(team_points_per_drive),
0,100)
```

#### Role Durability — RD

```text
role_change_adjustment = +12 for PROMOTED
                       = -12 for DEMOTED
                       = 0 otherwise

age_security_adjustment = +5 when age <= 25
                        = 0 when age 26–28
                        = -5 when age 29–30
                        = -10 when age >= 31

RD = clamp(
  50
+ 20 × contract_security
- 20 × competition_pressure
+ role_change_adjustment
+ age_security_adjustment,
0,100)
```

#### Age and Development — AD

| Age | Base score |
|---|---:|
| 21–22 | 78 |
| 23 | 74 |
| 24–26 | 68 |
| 27–28 | 58 |
| 29–30 | 45 |
| 31–32 | 30 |
| 33+ | 18 |

Add five points when `nfl_seasons_completed` is one or two. Clamp to `[0,100]`.

#### Availability — AV

```text
HEALTHY = 98
QUESTIONABLE + FULL = 85
QUESTIONABLE + LIMITED = 70
QUESTIONABLE + DNP/UNKNOWN = 45
DOUBTFUL = 15
OUT/IR/PUP/SUSPENDED = 0
UNKNOWN = 75
```

`AV` is the selected value above.

### 26.9 Horizon composites

Component order is always `RR, TE, TQ, EF, TC, RD, AD, AV`.

| Horizon | RR | TE | TQ | EF | TC | RD | AD | AV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Weekly | .22 | .22 | .10 | .06 | .15 | .05 | .02 | .18 |
| ROS | .20 | .22 | .10 | .08 | .12 | .13 | .05 | .10 |
| One Year | .17 | .22 | .10 | .09 | .10 | .18 | .10 | .04 |
| Three Years | .13 | .20 | .09 | .09 | .06 | .21 | .18 | .04 |
| Dynasty | .10 | .18 | .08 | .08 | .04 | .23 | .25 | .04 |

```text
composite[horizon] = Σ component × horizon_weight
```

The composite is internal. It is not a market price and is not displayed as a universal value.

### 26.10 Expected Fantasy Output

The first MVP uses deterministic expected values, not Monte Carlo simulation.

```text
Pactive = AV / 100
expected_routes = projected_team_dropbacks × RP4
expected_targets = expected_routes × shrunk_TPRR
```

Expected catch rate:

```text
base_catch_rate = 0.68 - 0.012 × max(average_depth_of_target - 8, 0)
expected_catch_rate = clamp(base_catch_rate + shrunk_CROE, 0.35, 0.85)
```

Expected yards per reception:

```text
expected_yards_per_reception = clamp(
  7.0 + 0.55 × average_depth_of_target
      + shrunk_depth_adjusted_yards_per_target,
6.0,22.0)
```

Expected statistics:

```text
expected_receptions = expected_targets × expected_catch_rate
expected_receiving_yards = expected_receptions × expected_yards_per_reception
expected_receiving_tds = expected_targets × expected_td_rate_per_target
```

Weekly expected fantasy points:

```text
active_game_fantasy_points =
    expected_receptions × points_per_reception
  + expected_receiving_yards × points_per_receiving_yard
  + expected_receiving_tds × points_per_receiving_td

weekly_EFO = Pactive × active_game_fantasy_points
```

ROS expected fantasy points:

```text
expected_active_games_remaining = expected_games_remaining × Pactive
ROS_EFO = expected_active_games_remaining × active_game_fantasy_points
```

One-Year, Three-Year, and Dynasty EFO distributions are deferred. For the first MVP, return their component composites only.

### 26.11 Confidence

Begin at 100 and subtract fallback penalties from Section 26.5.

Also subtract:

```text
15 when career_routes < 100
8 when career_routes is 100–299
10 when injury_status is UNKNOWN
10 when route_role_change is UNKNOWN
5 when team is null
```

```text
confidence_score = clamp(100 − total_penalties,0,100)
```

Labels:

```text
HIGH = 80–100
MEDIUM = 60–79.999
LOW = 0–59.999
```

Confidence never changes EFO or component values. It only communicates reliability.

### 26.12 Volatility

Volatility is a transparent heuristic score.

```text
volatility_score =
    20 × (1 − RP4)
  + 20 × min(average_depth_of_target / 20, 1)
  + 20 × min(prior_weight, 1)
  + 15 when injury_status is QUESTIONABLE or UNKNOWN
  + 15 when route_role_change is PROMOTED, DEMOTED, or UNKNOWN
  + 10 when career_routes < 200
```

Clamp to `[0,100]`.

Labels:

```text
LOW = 0–32.999
MEDIUM = 33–65.999
HIGH = 66–100
```

This is revision/output instability, not a medically precise injury-risk score.

### 26.13 Explanation logic

For each component, calculate:

```text
component_deviation = component_score − 50
weighted_driver = component_deviation × horizon_weight
```

For the selected horizon:

- rank positive drivers by largest positive weighted driver;
- rank negative drivers by most negative weighted driver;
- return up to three of each;
- omit drivers with absolute weighted contribution below `1.0`.

Explanation templates must use plain language, for example:

- “Strong route participation supports the projection.”
- “Target earning is below the WR reference group.”
- “Current availability materially lowers the weekly outlook.”
- “Age and role durability reduce the long-term outlook.”

Never claim that the model proves future performance.

### 26.14 Exact calculation order

1. Validate the required schema.
2. Apply field fallbacks and create the fallback log.
3. Apply TPRR and efficiency shrinkage.
4. Calculate route and TPRR trend scores.
5. Convert the required signals to percentiles.
6. Calculate RR, TE, TQ, EF, TC, RD, AD, and AV.
7. Calculate all five horizon composites.
8. Calculate Weekly and ROS expected statistics and fantasy points.
9. Calculate confidence and volatility.
10. Generate explanation drivers.
11. Validate ranges and return the output record.

Do not add smoothing, event simulation, role-state transition matrices, or Monte Carlo logic to the first MVP.

### 26.15 Output schema

```ts
interface WRMVPOutput {
  schema_version: "wr-mvp-1.0";
  model_version: string;
  player_id: string;
  player_name: string;
  as_of_timestamp: string;

  components: {
    RR: number;
    TE: number;
    TQ: number;
    EF: number;
    TC: number;
    RD: number;
    AD: number;
    AV: number;
  };

  composites: {
    WEEKLY: number;
    ROS: number;
    ONE_YEAR: number;
    THREE_YEAR: number;
    DYNASTY: number;
  };

  weekly: {
    probability_active: number;
    expected_routes: number;
    expected_targets: number;
    expected_receptions: number;
    expected_receiving_yards: number;
    expected_receiving_touchdowns: number;
    expected_fantasy_points: number;
  };

  ros: {
    expected_active_games: number;
    expected_fantasy_points: number;
  };

  confidence: {
    score: number;
    label: "LOW"|"MEDIUM"|"HIGH";
    penalties: string[];
  };

  volatility: {
    score: number;
    label: "LOW"|"MEDIUM"|"HIGH";
  };

  explanations: {
    positive_drivers: string[];
    negative_drivers: string[];
  };

  fallback_log: Array<{
    field: string;
    fallback_used: string;
    confidence_penalty: number;
  }>;

  status: "OK"|"PARTIAL";
}
```

Store every output historically. Display components, Weekly and ROS expectations, confidence, volatility, and explanations. Keep horizon composites internal until the wider utility and market layers are built.

### 26.16 Minimum tests before moving on

The WR MVP is considered finalized when these tests pass:

#### Formula tests

1. Every component stays within `[0,100]`.
2. All five horizon weight rows sum to `1.00`.
3. A healthy full-time WR projects more routes than an otherwise identical part-time WR.
4. Higher TPRR raises expected targets and fantasy points.
5. An OUT player has `Pactive=0` and Weekly EFO of zero.
6. A missing field uses the documented fallback and records the penalty.
7. A low-sample rookie is pulled more strongly toward the draft-round prior than an established veteran.
8. A deep, low-catch, low-target-rate receiver triggers the TQ cap.
9. Changing the scoring vector changes fantasy points but not football-stat expectations.
10. Identical input produces identical output.

#### Five acceptance fixtures

Create fixed JSON fixtures for:

1. elite full-time target earner;
2. low-route/high-TPRR receiver;
3. Round-1 rookie with little NFL usage;
4. declining veteran;
5. deep threat with low catch efficiency.

For each fixture, save the complete expected output generated by the approved implementation. Future code changes must reproduce those outputs unless `model_version` changes.

No formal backtesting, calibration study, or second independent implementation is required before coding the rest of the hobby MVP.

### 26.17 Deferred upgrades

The following may be added after the first WR engine works:

1. live data adapters;
2. paid route data;
3. Monte Carlo EFO distributions and quantiles;
4. explicit role-state probabilities;
5. multi-year EFO simulation;
6. fitted priors and shrinkage constants;
7. rolling-origin backtesting;
8. automatic percentile-universe refresh;
9. event-driven smoothing and reversal logic;
10. market price and mispricing layers.

These upgrades must be introduced through new model versions. They are not defects in the first MVP.

*End of WR_VALUATION_MODEL.md v1.2 — practical hobby MVP contract.*
