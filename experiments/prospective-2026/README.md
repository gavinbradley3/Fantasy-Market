# prediction archive, 2026 season

Dated predictions from the frozen incumbent (E) and the research candidates C and F, kept so
they can be scored on seasons that had not been played when they were recorded. Nothing here
evaluates anything. No production board, workflow or schedule is read or changed, and the
production refresh workflows stay disabled.

## Classification

| Class | Rule (`src/validation/archive.ts`) | What it can support |
|---|---|---|
| `PROSPECTIVE` | Captured no more than 72 h after the decision instant, and before the first outcome game kicks off | A forward test |
| `HISTORICAL_RECONSTRUCTION` | Anything else | Descriptive comparison only. Not a forward test |

The 72 h window allows one nflverse rebuild cycle after Monday night. Past it, the inputs can
carry provider corrections made after the decision, and nothing proves the capture preceded
later news.

## Snapshots

| Snapshot | Decision instant | Captured | Gap | Class |
|---|---|---|---|---|
| 2026-W4 | 2026-10-06 12:15 UTC | 2026-11-12 19:56 UTC | 896 h | **HISTORICAL_RECONSTRUCTION** |
| 2026-W8 | 2026-11-03 13:15 UTC | 2026-11-12 19:58 UTC | 223 h | **HISTORICAL_RECONSTRUCTION** |
| 2026-W12 | after Week 12 is final | not yet | | First possible `PROSPECTIVE` snapshot |

Week 4 and Week 8 were first recorded on 2026-11-12 with `backtest:predict` and described in
an earlier version of this file as prospective. That description was wrong. They are
reconstructions of what the unchanged incumbent says at those instants, built from inputs
fetched five and one weeks late. Their files keep their original names. Their classification
lives in `snapshots/<id>/manifest.json`. Their C and F candidates were computed on 2026-11-12
from harness files fetched that day, and no nflverse release stamps were recorded for them.

The 2026 OFFSEASON date is left out: its first outcome season was half played when the
archive began.

## Procedure for every future snapshot

Run within 72 hours of the decision instant: after Week 12, 12:15 UTC on the Tuesday after
Monday night.

```bash
npm run backtest:archive -- --config experiments/prospective-2026/config.json --id 2026-W12
```

In one run it does the following.

1. Records the wall-clock start as `capturedAt`.
2. Downloads the harness inputs fresh and records each nflverse release's own `last_updated`
   stamp.
3. Runs the unchanged incumbent pipeline from an empty capture store.
4. Computes C and F on the incumbent's population, reading only games final at the instant.
5. Classifies the snapshot.
6. Writes `snapshots/<id>/manifest.json` and `candidates.json`.
7. Bundles every input byte into `.local/archive-bundles/prospective-2026/<id>.tar.xz`, with
   its SHA-256 in the manifest.

Then:

8. Commit and push `snapshots/<id>/` at once. The push time on GitHub is the independent
   timestamp; a commit date alone is self-reported.
9. Copy the bundle to durable storage and record the location in `bundle.storedAt` in a
   follow-up commit. **Until that is done the input snapshot exists only in a temporary
   container.** Where to store it is an open owner decision.

The script refuses to overwrite an existing snapshot. A mistake is corrected by a new snapshot
with a new id, never by editing a recorded one.

## What a manifest holds

- `capturedAt`, `completedAt`, the classification, and the hours after the decision instant.
- The code SHA and whether `src` or `scripts` had uncommitted changes.
- The SHA-256 of the incumbent prediction file and of `candidates.json`.
- SHA-256 and size of every harness input file and every incumbent capture payload.
- The bundle's SHA-256, size and storage location.

`candidates.json` holds E's ranks and value, and C's and F's projected points (T1, T2) and
two-season value above replacement. It holds no market value and no recommendation.

## Two cautions

- C and F at a 2026 date are fitted on seasons through 2025. That uses 2024 and 2025 seasons
  as training data, which is how a forward model must work. It does not evaluate anything on
  the sealed 2024–2025 test period and does not tune against it.
- Legacy files in `predictions/` came from `backtest:predict` alone. New snapshots keep their
  incumbent prediction under `snapshots/<id>/predictions/`.
