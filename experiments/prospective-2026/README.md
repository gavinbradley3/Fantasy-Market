# prospective-2026: dated snapshots of the frozen model

Each file in `predictions/` is the unchanged production pipeline's output at a decision instant
taken from the nflverse schedule, written by `npm run backtest:predict`. The outcome seasons a
snapshot will be scored on had not been played when it was recorded. This is the forward test
`docs/PHASE2_VALIDATION_PLAN.md` §2 calls the only clean one.

Nothing here evaluates anything. No production board, workflow or schedule is read or changed,
and the two disabled refresh workflows stay disabled.

| Snapshot | As-of | Recorded | Outcome seasons | Status |
|---|---|---|---|---|
| 2026-W4 | 2026-10-06 | 2026-11-12 | 2027, 2028 | Recorded five weeks after its as-of. Outcomes are in the future. Inputs carry any nflverse stat corrections made since the as-of. |
| 2026-W8 | 2026-11-03 | 2026-11-12 | 2027, 2028 | Recorded nine days after its as-of. Same caveat. |
| 2026-W12 | after Week 12 | not yet | 2027, 2028 | Due once Week 12 is final. Run the command below within a few days of it. |

The 2026 OFFSEASON date is left out on purpose: its first outcome season (2026) was half played
when this archive began, so a snapshot recorded now could not be called prospective.

## Recording the next snapshot

```bash
npm run backtest:fetch -- --config experiments/prospective-2026/config.json   # refreshes games.csv etc. locally
npm run backtest:predict -- --config experiments/prospective-2026/config.json --only 2026-W12
```

Existing files are never overwritten: the predictor skips a date that already has one. Commit the
new file as it is.

## What a snapshot holds

`manifest`: decision id, as-of instant, code SHA, publication id, valuation checksum, the
checksum of every captured input payload, and `predictionChecksum` over the values alone.
`players`: gsis id, position, `dynastyValue`, dynasty composite, position rank, overall rank and
model tier. No market value and no recommendation.

The code SHA is this branch's head. Production code is identical to the frozen reference
`e4dc3a0`: `git diff e4dc3a0 -- src ':!src/validation'` is empty.

## Not archived yet

Baseline C and challenger F at these dates. They are functions of the nflverse stats files, which
are not committed, so they cannot be reproduced exactly after a later stat correction. Freezing
them needs a small dump tool that reads 2024 to 2026 seasons as inputs. That was left out of the
challenger experiment so that nothing in `src/validation` reads a sealed season.
