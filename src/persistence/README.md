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
| Publication | `publication` | `publication_id` | immutable |
| Current pointer | `current_publication` | singleton `id = 1` | mutable (advances) |

Immutable **artifacts** are content-addressed facts; a **run** is an event that references
them. A run may reuse a pre-existing artifact (identical content → one row).

## Transaction boundaries

`persistRefreshResult()` writes an entire completed refresh in **one** transaction, in
FK-safe order: snapshot → raw envelopes → run → source outcomes → normalized inputs →
outputs → run/inference associations. Any failure rolls the whole run back, so a run is
never recorded as successful with a missing artifact reference.

`store.publish()` advances the current pointer in its **own** transaction.

## Publication semantics

- Publication is **separate from computation**: `refreshSources()` never writes to the DB.
  A caller persists, then explicitly publishes.
- Only a **`success`** run may publish. **Partial and failed runs are rejected**
  (`PUBLICATION_NOT_ALLOWED`); there is no override in Phase 6.
- Publishing validates the complete `(snapshot, normalized-input, output)` artifact set
  exists and is internally consistent, then advances the singleton current pointer
  atomically. Readers see either the previous complete state or the new complete state —
  never a mix.
- The previous publication stays in `publication` history (immutable), linked via
  `superseded_publication_id`.

## Idempotency

- Content artifacts: writing identical bytes twice → one row; conflicting bytes under the
  same id → `CONFLICTING_ARTIFACT`.
- Run persistence: pass a stable `runId` to make a retry safe — `INSERT OR IGNORE` on the
  run, source outcomes, and associations means no duplicates.
- Publication: the `publication_id` is deterministic (`pub-digest(runId|outputChecksum)`),
  so re-publishing the same result reuses one row and one current pointer.

## Partial / failed refresh behavior

- **Failed** run: the run + source outcomes (+ any successful raw envelopes) are persisted;
  no snapshot/input/output is required; current is **not** advanced.
- **Partial** run: the run and whatever artifacts it produced are persisted; it is **not**
  publishable by default.

## Integrity checks

Reads verify content, they don't trust the row:

- raw payload: `checksumPayload(payload)` must equal the stored checksum;
- snapshot: `digest(serialized)` must equal the stored checksum **and** the content must
  reproduce its `snapshot_id`;
- normalized input: `digest(serialized)` must equal the stored byte checksum;
- output: `digest(serialized)` must equal the stored `outputChecksum`;
- unsupported persisted schema versions are rejected (`UNSUPPORTED_PERSISTED_SCHEMA`);
- the current-publication bundle refuses to return if any member is missing or corrupt.

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
- Publication targets one player result `(snapshot, normalized-input, output)`; multi-result
  publication bundles are a later concern.

## How later scheduling (Phase 7+) should call this

A scheduler should: run `refreshSources(...)` → `persistRefreshResult(store, {...})` →
(only on `success`, per policy) `store.publish({...})`. It must treat persistence and
publication as **explicit, separate** steps and must not advance publication on a partial
or failed run.
