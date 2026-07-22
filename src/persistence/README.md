# PlayerTicker Persistence (Phase 6)

Durable, local-first storage for the artifacts and provenance produced by the verified
Phase 4/5 pipeline. It answers one question with evidence:

> **Which exact provider artifacts, snapshot, normalized input, and inference result
> produced a published PlayerTicker state?**

Persistence **stores** what the pipeline computed — it never recomputes identities,
normalizes provider data, rebuilds evidence, or reruns valuation formulas.

## Database choice

- **SQLite via Node's built-in `node:sqlite` (`DatabaseSync`).** No native compilation, no
  extra npm dependency, deterministic, easy to test and to migrate later. Chosen over
  better-sqlite3/Prisma/Drizzle to keep this hobby-stage phase local-first and dependency
  free. A small explicit repository layer (`PersistenceStore`) is used instead of an ORM.
- `node:sqlite` is an **experimental** Node feature (emits an `ExperimentalWarning`) and is
  loaded via `createRequire` (not a static `import`) so bundlers that predate it don't try
  to resolve it.
- **Single-process, single-writer** assumptions. Foreign keys are ON, journal mode is WAL,
  and a 5 s busy timeout is set. This is **not** a distributed system — no cross-process
  locking is claimed.

## Location / configuration

`PersistenceStore.open(location)` takes a filesystem path (or `':memory:'`). The caller
chooses the path (e.g. from an env var in a future service); the parent directory is
created if missing. Nothing here reads global config or secrets.

## Migrations

Explicit, versioned SQL migrations (`migrations.ts`). `open()` runs `migrate()`:
fresh-DB creation and repeat runs are both safe (idempotent); the applied version is
recorded in `schema_migrations`; each migration runs in its own transaction so a failure
cannot falsely advance the version; a DB written by a **newer** build (version > this
code's `LATEST_MIGRATION_VERSION`) is rejected with `UNSUPPORTED_DATABASE_VERSION`.

- **v1** — the base schema.
- **v2** — board-level publication. The publication tables are replaced (`publication` now
  identifies a *complete board*; see below).

**Migration policy for legacy v1 publication data.** This branch is unreleased, so v2 does
**not** attempt to reinterpret v1 single-unit publications as boards. The v1 `publication`
and `current_publication` tables are dropped and recreated in board form, which
**invalidates the old current pointer** (it becomes empty). All immutable artifact/run
history (`raw_payload_artifact`, `snapshot_artifact`, `*_input/output_artifact`,
`refresh_run`, `refresh_source_outcome`, `run_inference`) is untouched and remains
readable; only the (structurally incompatible, single-unit) publication rows are discarded.
Re-publish a run with `publishBoard()` to establish a valid current board.

## Entities

| Kind | Table | Identity | Mutability |
|---|---|---|---|
| Raw payload artifact | `raw_payload_artifact` | `payload_checksum` | immutable |
| Canonical snapshot | `snapshot_artifact` | `snapshot_id` | immutable |
| Normalized input | `normalized_input_artifact` | `checksum` (production `normalizedInputChecksum`) | immutable |
| Inference output | `inference_output_artifact` | `checksum` (`outputChecksum`) | immutable |
| Refresh **run** (event) | `refresh_run` | generated `run_id` | append-only |
| Source outcome | `refresh_source_outcome` | `(run_id, request_key)` | append-only |
| Run→inference link | `run_inference` | `(run_id, canonical_id, position)` | append-only |
| **Board** publication | `publication` | `publication_id` = `board-digest(...)` | immutable |
| Current pointer | `current_publication` | singleton `id = 1` | mutable (advances) |

Immutable **artifacts** are content-addressed facts; a **run** is an event that references
them. A run may reuse a pre-existing artifact (identical content → one row).

## Transaction boundaries

`persistRefreshResult()` writes an entire completed refresh in **one** transaction, in
FK-safe order: snapshot → raw envelopes → run → source outcomes → normalized inputs →
outputs → run/inference associations. Any failure rolls the whole run back, so a run is
never recorded as successful with a missing artifact reference. A **`success`** run that
produced **zero** inference associations is rejected inside this transaction
(`INVALID_ARTIFACT_SET`) — a successful run must carry a board.

`store.publishBoard()` validates and advances the current pointer in its **own**
transaction (board row insert → pointer advance; a throw in either rolls both back).

## Board publication semantics

- Publication is **separate from computation**: `refreshSources()` never writes to the DB.
  A caller persists, then explicitly publishes.
- A publication is a **complete board**: the entire, deterministically-ordered set of a
  successful run's player inference associations (`run_inference`). It is **not** a single
  player result. `getCurrentPublication()` returns every entry, each with its normalized
  input + inference output, ordered by `(canonicalId, position)`.
- The publication row stores the run, snapshot, a **board identity** (`board_checksum`), and
  an **`entry_count`**. Retrieval revalidates the complete `run_inference` set against both
  (recomputes the board id and checks the count) — it never trusts the header alone.
- Only a **`success`** run with a snapshot and **≥1** association may publish. **Partial,
  failed, snapshot-less, and empty runs are rejected** (`PUBLICATION_NOT_ALLOWED`); there is
  no override in Phase 6.
- Publishing validates every board entry's `(normalized-input, output)` exists, is intact,
  and links to the run snapshot, then advances the singleton pointer atomically. Readers see
  either the previous complete board or the new complete board — never a mix.
- The previous publication stays in `publication` history (immutable), linked via
  `superseded_publication_id`.

## Board identity

`computeBoardIdentity(schemaVersion, snapshotId, entries)` → `board-digest(canonical)`
where `canonical` is `stableStringify({schemaVersion, snapshotId, entries})` and entries are
sorted by `(canonicalId, position)`. The id is **independent** of player computation/insert
order but **changes** if any entry's input/output, the snapshot, or the entry set changes; a
duplicate `(canonicalId, position)` coordinate is rejected.

## Idempotency & strict retry conflicts

- Content artifacts: writing identical bytes twice → one row; conflicting bytes under the
  same id → `CONFLICTING_ARTIFACT`.
- **Run event records** (`refresh_run`, `refresh_source_outcome`, `run_inference`): a retry
  under the same logical key is compared field-by-field. An **identical** retry is
  idempotent; a **conflicting** one (same key, different semantic content) throws
  `CONFLICTING_ARTIFACT` — it is never silently dropped. (`created_at` is a persistence
  timestamp, excluded from the run comparison; structured source diagnostics are stored as a
  single canonical string, so key-order never causes a false conflict.)
- Publication: the `publication_id` is the deterministic board id, so re-publishing the same
  board reuses one row and one current pointer. A stored publication whose content differs
  from a re-publish under the same id throws `CONFLICTING_ARTIFACT`.

## Partial / failed refresh behavior

- **Failed** run: the run + source outcomes (+ any successful raw envelopes) are persisted;
  no snapshot/input/output is required; zero associations is fine; current is **not**
  advanced.
- **Partial** run: the run and whatever artifacts it produced are persisted; zero
  associations is allowed; it is **not** publishable by default.

## Integrity checks

Reads verify content, they don't trust the row:

- raw payload: `checksumPayload(payload)` must equal the stored checksum;
- snapshot: `digest(serialized)` must equal the stored checksum **and** the content must
  reproduce its `snapshot_id`;
- normalized input: `digest(serialized)` must equal the stored byte checksum;
- output: `digest(serialized)` must equal the stored `outputChecksum`;
- board: the stored `run_inference` set must reproduce the publication's `board_checksum`
  and match its `entry_count`, else `INTEGRITY_VIOLATION`;
- unsupported persisted schema versions are rejected (`UNSUPPORTED_PERSISTED_SCHEMA`);
- the current-board bundle refuses to return if any entry/member is missing or corrupt.

The normalized-input **identity** is the production `normalizedInputChecksum` (a digest of
the AIL's internal canonical projection, which is not reproducible from the input object
alone); byte-integrity of the stored input uses a separate `serialized_checksum`. The
end-to-end "this input → that output" guarantee is proven by the **replay** path, which
re-runs the AIL from persisted raw envelopes (no network) and matches the output checksum.

## Security / data hygiene

Only redacted diagnostics are persisted (transport already redacts them and query-strips
`sourceUrl`). No authorization headers, API keys, tokens, or signed URLs are stored. All
SQL is parameterized — no provider value, request key, checksum, or diagnostic is ever
concatenated into a statement.

## Retention

Phase 6 keeps immutable history **indefinitely**; there is no automated deletion. Old raw
payloads, failed runs, and superseded publications are retained by design.

## Known limitations

- Single-process only; no distributed locking (out of scope).
- `node:sqlite` is experimental.

## How later scheduling (Phase 7+) should call this

A scheduler should: run `refreshSources(...)` → `persistRefreshResult(store, {...})` →
(only on `success`, per policy) `store.publishBoard({ runId })`. It must treat persistence
and publication as **explicit, separate** steps and must not advance publication on a
partial or failed run. Retries should reuse the same `runId` — an identical retry is
idempotent, and a conflicting one fails loudly rather than corrupting state.
