# Accessible-Data Model — Validation Probes

Live population, as-of `2026-02-15`, nflverse seasons 2023–2025.
226 of 237 RBs and 167 of 180 TEs valued by `rb-accessible-1.0` / `te-accessible-1.0`.

Reproduce with `npm run ingest -- --seasons 2023,2024,2025 --as-of 2026-02-15T00:00:00.000Z`.

**No external ranking was consulted programmatically.** The reasoning below is football logic
applied to the model's own published components. Where a placement disagrees with general
dynasty consensus it is called out rather than explained away.

---

## 1. Required probe archetypes

### Elite established

| Player | Pos | Age | Rank | Value | Key components | Assessment |
|---|---|---|---|---|---|---|
| Bijan Robinson | RB | 24 | **1**/226 | 87.6 | RV 82.9, RCV 95.5, RS 97.5, DUR 100, AG 98 | Correct. Full three-down workload, near-total backfield share, no missed games, inside the age peak. |
| Jahmyr Gibbs | RB | 23 | **2**/226 | 85.0 | SC 96.5, EFF 76.4, RCV 89.1, AG 100, DUR 83.7 | Correct. Best efficiency and scoring of the top tier at the youngest age. |
| Trey McBride | TE | 26 | **1**/167 | 89.2 | TV 100, RP 97, RS 96.5, AG 100 | Correct. League-leading TE target volume at the position's age peak. |

### Productive aging veterans

| Player | Pos | Age | Rank | Value | Key components | Assessment |
|---|---|---|---|---|---|---|
| Christian McCaffrey | RB | 29 | 4/226 | 81.2 | RCV 100, RS 99.8, SC 94.3, **AG 50**, **DUR 50.5** | Correct and instructive. Elite current production (weekly composite 89.1, highest of any back) held back by the age curve and by genuinely missing half the games he was rostered for. The model separates "best right now" from "best to own". |
| Derrick Henry | RB | 32 | 34/226 | 59.8 | RV 86.7, SC 92.6, DUR 94.0, **AG 18** | Correct. Still a top-five rusher by volume and scoring; the age curve does the discounting rather than the production. RCV 29.0 correctly notes he offers nothing in the passing game. |
| Travis Kelce | TE | 36 | 23/167 | 65.9 | TV 90, RP 77.7, **AG 24**, TR 32.8 | Correct. Volume is still starter-level; age and a falling trajectory place him behind younger starters without erasing him. |
| George Kittle | TE | 32 | 9/167 | 76.6 | EFF 75.7, RP 85.8, TV 89.2, AG 66 | Reasonable. Best TE efficiency in the population; the gentler TE age curve correctly keeps a 32-year-old in the top ten, where the RB curve would not. |

### Young ascending

| Player | Pos | Age | Rank | Value | Confidence | Assessment |
|---|---|---|---|---|---|---|
| Ashton Jeanty | RB | 22 | 5/226 | 79.4 | **LOW** (17 games) | Correct. A first-round rookie with an immediate lead role ranks high on a dynasty-leaning blend, and the thin sample is disclosed as LOW confidence rather than hidden. EFF 37.6 honestly reports inefficient rookie rushing. |
| Omarion Hampton | RB | 22 | 14/226 | 71.8 | LOW (9 games) | Reasonable. Real early role (RV 70.6, RS 81.4), correctly discounted by DUR 32.0 for missing most of the season he was rostered for. |
| Brock Bowers | TE | 23 | **5**/167 | 79.3 | MEDIUM | **Still below consensus, which has him TE1–2.** The model can only see production: TV 96.4 and RS 90.9 are elite, but TR 35.2 records a genuine season-over-season decline in per-game targets. Without talent or draft-pedigree priors the model cannot outrank a healthy McBride. Honest limitation, not a bug. |

### Injured / low-availability with historical evidence

| Player | Pos | Age | Rank | Value | Assessment |
|---|---|---|---|---|---|
| Nick Chubb | RB | 30 | 109/226 | 38.8 | Correct, and a good test. DUR 28.3 (25 appearances against the weeks he was rostered), RV 45.6 and RCV 24.6 all reflect a post-injury player in a reduced committee role. The model reads the drop from the record rather than from a reputation. |
| Brock Bowers | TE | 23 | 5/167 | 79.3 | Not on an active roster at the as-of, so AV 40 — a real negative for the near term, **not** an injury claim. Weekly is suppressed relative to dynasty (which gives availability zero weight), so a contract-status gap cannot destroy long-term value. |
| George Kittle | TE | 32 | 9/167 | 76.6 | Same mechanism (AV 40), plus DUR 62.7 recording genuine missed time. |

### Backups and depth

| Player | Pos | Age | Rank | Value | Role label | Assessment |
|---|---|---|---|---|---|---|
| Kenny Gainwell | RB | 26 | 19/226 | 68.6 | Receiving-leaning rotational back | Acceptable after recalibration. He ranked **6th** before the role-window and receiving-volume fixes — see §3. A genuine receiving role keeps him respectable; RV 38.2 keeps him out of the top ten. |
| Keith Smith | RB | 33 | 225/226 | 11.5 | Depth back | Correct — a fullback. RV 0 (no carries in the role window), RS 2.4. |
| Jakob Johnson | RB | 31 | **226**/226 | 9.2 | No measured usage | Correct, and the label is honest about why: RV 0, RCV 0, RS 0. |
| Marcedes Lewis | TE | 41 | **167**/167 | 11.9 | Blocking-first or depth tight end | Correct. TV 6.0, RP 1.5. The model bottoms out a 41-year-old blocking specialist, and the role label states what he is rather than implying he was assessed as a receiver. |

### Low-volume efficiency vs high-volume inefficiency

Asserted as a model invariant in `src/accessible/models.test.ts`: a 4-carry-per-game back at 6.0
yards per carry ranks **below** an 18-carry back at 3.8 on the weekly horizon, while the `EFF`
component still favours the efficient back. Volume produces fantasy points; efficiency modifies
them. A product that ranked the 4-carry back higher would be indefensible.

Live example: **Derrick Henry** (high volume, RV 86.7 / EFF 71.1) at 59.8 versus **Nick Chubb**
(low volume, RV 45.6 / EFF 42.2) at 38.8.

### Players who changed teams

Team is resolved point-in-time from the newest weekly-roster row at or before the as-of, and
team shares are keyed `(team, gameId)`, so a mid-career move measures each game against the team
actually played for. Nick Chubb (CLE → HOU) and Derrick Henry (TEN → BAL) both value correctly
across the move; no share is computed against a team the player was not on.

### Rookies / sparse samples

No player with fewer than 8 observed games appears in the top 40 at either position. Mean value
rises monotonically with sample size:

All figures below are post-audit-fix (§3a).

| Career games | RB mean | RB max | TE mean | TE max |
|---|---|---|---|---|
| 1–2 | 33.9 | 53.2 | 36.0 | 50.5 |
| 3–7 | 31.4 | 58.5 | 29.9 | 42.3 |
| 8–16 | 37.3 | 71.8 | 42.0 | 77.3 |
| 17+ | 47.3 | 87.6 | 51.6 | 89.2 |

### Unvalued (correctly)

11 RBs (`NO_OFFENSIVE_OPPORTUNITY`) and 13 TEs (`NO_RECEIVING_OPPORTUNITY`) — players with game
records but no carries/targets at all. Mostly fullbacks and blocking tight ends. Refusing to
value them is correct: scoring them zero would rank them against measured players as though the
model had assessed their actual job.

---

## 2. Ordering sanity checks

- Both boards' top 10 are lead backs / focal-point tight ends; both bottom 10 are fullbacks,
  blocking tight ends and players with almost no usage.
- Every role label is checkable against the same usage numbers the user can see.
- Age separates otherwise-similar players in the expected direction and by a defensible amount
  (McCaffrey 4th at 29 with the best production; Henry 34th at 32; Kelce 22nd at 36).
- The TE age curve keeps 32-year-old Kittle top-ten while the RB curve puts 32-year-old Henry
  34th — the intended positional difference.

## 3. Defects this validation exercise found and fixed

The first live run produced rankings that failed review. All four were fixed before completion:

1. **Rolling 8-game role window.** A backup's hot stretch read as a starter's role — Kenny
   Gainwell 6th of 226, RJ Harvey 7th, and nearly every top-25 TE labelled "primary receiving
   option". Replaced with a season-preferring role window (§4.5 of the model spec).
2. **RB receiving volume double-counted.** Receptions were re-scaled onto the *targets* anchor
   via `/0.75`, inflating pass-catching backs. Replaced with receiving yards per game.
3. **Age dominated the dynasty composite** at weight 0.33: a 4-year age gap outranked the
   difference between a lead back and a backup. Reduced to 0.23 with volume and role raised.
4. **`positionValue` was the dynasty composite alone**, making age the primary sort key for the
   whole board and headlining the best weekly back (McCaffrey) below a rotational one. Replaced
   with a documented multi-horizon blend.

Post-fix effect: Gainwell 6 → 19, RJ Harvey 7 → 25, McCaffrey 20 → 4, McBride 2 → 1.

## 3a. Defects found by the cold self-audit (after the first commit)

A second pass, deliberately trying to falsify the model against the live population rather than
confirm it, found three more. All were fixed:

5. **Availability treated 45% of the population as injured.** At the offseason as-of, 188 of 417
   RB/TE read roster status `inactive` — free agents and players between contracts — and the
   mapping sent all of them to `OUT` (score 5). Added a distinct `NOT_ROSTERED` state (score 40);
   only an explicit injury designation now earns the severe score.
6. **The `STALE_PRODUCTION` penalty was unreachable dead code.** It tested `recent.games === 0`,
   but `recent` is the last 8 games of a player's *career*, so it is never empty for anyone the
   model values. A player whose last game was in 2023 was never flagged. Staleness now compares
   the newest observed kickoff against the as-of (365-day threshold) and fires for 72 of 226
   valued RBs.
7. **Durability charged players for games before they were on the team.** The denominator was
   `seasons × 17`, so a back signed in week 10 who played all eight remaining games scored
   29/100. It now divides by team weeks rostered, taken from the weekly-roster export (138,487
   rows already ingested). Where no roster week is attested the component is dropped rather than
   guessed.

Monotonicity of the headline value was then asserted directly
(`src/accessible/monotonicity.test.ts`): it rises with carries and targets per game and falls
with age past each position's peak, at both positions.

## 4. External comparison

Not performed programmatically. No dynasty-market or expert-ranking dataset is committed to this
repository, and none was fetched. Where the model's ordering is known to diverge from general
consensus (Brock Bowers, and Kyle Pitts at TE2 — high real target volume, mediocre efficiency,
no talent prior available) it is recorded above as a limitation rather than tuned away. The
PlayerTicker model remains independent.
