# Staging review: board as of 2026-11-12T14:37:00.000Z

Status: **PENDING_OWNER_REVIEW**. Not approved for production. Production `site-data` is unchanged.

Produced by the Phase 1 branch (`claude/phase1-inseason-refresh`) from live nflverse releases, nflverse only
(Sleeper unreachable from the build environment), derived window 2024–2026, career seasons 2017–2025.

## Identity

| | |
|---|---|
| Valuation checksum (content only) | `9de1b5fe731c856e9dde4e5ab03cf613afbf53aeec6c5e3b211761fe3dfc3e9a` |
| Board / publication id | `board-b36ab31ffd91137e` |
| Snapshot | `snap-69a86b4a05360bef` |
| Published at (metadata) | 2026-11-12T14:45:37.346Z |
| Run id (metadata) | run-manual-2026-11-12T14:44:34.956Z-1 |

A separate replay from the captured payloads, into a fresh database, produced the same board id and the same
valuation checksum with a different publish time and run id.

## Coverage

| Position | Entries | Valued |
|---|---|---|
| QB | 104 | 93 |
| RB | 228 | 177 |
| TE | 182 | 147 |
| WR | 339 | 265 |

## Acceptance checks (verification.json)

- Newest regular-season game: 2026-11-05T00:00:00.000Z (Week 9 boundary), 7.61 days before the as-of. No game after the as-of in the snapshot.
- 2026 observations: 9455 game records, weeks 01, 02, 03, 04, 05, 06, 07, 08, 09; 566 of 853 board players have 2026 games.
- Team vs latest 2026 weekly roster: 709/709. 144 entries are on no 2026 roster and publish no team and no value.
- Team vs latest 2026 game (independent dataset): 556/566; differences are players whose roster moved after their last game.
- Seasons completed: brock purdy 4, josh allen 8, c.j. stroud 3, patrick mahomes 9.
- Leakage: 1990 fact stamps and 853 inputs checked, 0 violations, 0 excluded future facts.
- Failed sources: nflverse participation (nflverse:participation?season=2026) required=False code=UNEXPECTED_STATUS; sleeper identity (sleeper:identity) required=False code=NETWORK.

## Ranking change against production (published 2026-09-12)

Verdict **REVIEW_REQUIRED**:
- rank correlation 0.875 is below 0.9
- only 69.0% of the previous top 100 remain in the top 100 (minimum 80%)
- 32 of the previous top 100 moved more than 40 places or became unranked (maximum 5)

Spearman 0.875 over 534 players ranked on both boards. 148 players are newly ranked and 41 are no longer ranked.

Most of the change is expected: production was valued on 2025 alone; staging adds 2024 and nine weeks of 2026.
Causes traced for the largest moves:
- 2026 usage. Barkley's role window is his last 8 games, 7 of them in 2026 (11 carries/game) and his 2026/2025 trajectory scores 18. Pitts has 4.1 targets/game in 2026 against 6.9 in 2025. Sutton, Harrison and Thomas show similar 2026 declines.
- IR now read correctly. Jalen Hurts is on injured reserve at the as-of, so QB availability falls from 98 to 9. That costs 3.2 dynasty-composite points; because QB composites sit within ~10 points of each other (audit B6), it moves him 70 places.
- Seasons completed corrected. Purdy (45 career starts, 4 completed seasons) qualifies as a young committed starter; Daniels likewise.
- New 2026 players. Rookies and returning players with 2026 games appear (Watson, Tate, Boston, Concepcion).

Owner decision needed: whether these in-season movements are acceptable for a dynasty board, given that the
box-score models weight the most recent season heavily (role window = latest season, or the last 8 games before
a season reaches 8). That is existing methodology, unchanged here, and a question for the validation framework.

### Largest moves among the previous top 100

| Production rank | Staging rank | Pos | Player |
|---|---|---|---|
| 91 | 334 | RB | saquon barkley |
| 73 | 277 | RB | tyrone tracy jr. |
| 80 | 278 | TE | jake ferguson |
| 76 | 244 | WR | courtland sutton |
| 32 | 197 | RB | christian mccaffrey |
| 31 | 175 | TE | kyle pitts |
| 70 | 213 | TE | juwan johnson |
| 79 | 222 | RB | kenny gainwell |
| 92 | 234 | WR | jakobi meyers |
| 99 | 237 | WR | jerry jeudy |
| 97 | 230 | WR | marvin harrison jr. |
| 72 | 201 | WR | michael pittman |
| 84 | 195 | QB | sam darnold |
| 89 | 200 | RB | rico dowdle |
| 25 | 129 | WR | wan'dale robinson |
| 78 | 180 | WR | brian thomas jr. |
| 65 | 160 | RB | treveyon henderson |
| 67 | 153 | WR | ladd mcconkey |
| 43 | 128 | RB | omarion hampton |
| 27 | 105 | QB | jaxson dart |
| 12 | 82 | QB | jalen hurts |
| 66 | 133 | WR | quentin johnston |
| 86 | 148 | WR | romeo doubs |
| 24 | 81 | QB | justin herbert |
| 45 | 102 | WR | jaylen waddle |

### New in the staging top 100 (not ranked in production)

| Staging rank | Pos | Player |
|---|---|---|
| 10 | QB | deshaun watson |
| 51 | WR | carnell tate |
| 56 | WR | denzel boston |
| 78 | WR | kc concepcion |
| 85 | RB | jonah coleman |
| 90 | WR | omar cooper jr. |
| 93 | WR | caleb douglas |

To approve this exact board for a production refresh, dispatch `Refresh board` with
`approve_ranking_change = 9de1b5fe731c856e9dde4e5ab03cf613afbf53aeec6c5e3b211761fe3dfc3e9a` after re-enabling it. A run that produces any other board
is refused again.
