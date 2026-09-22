# Isolated experimental role-evidence gate

This candidate implements provisional role-evidence rules for isolated evaluation. It does not authorize production use, establish predictive accuracy, or assign zero dynasty value to players with uncertain roles.

## Explicit versions and boundaries

| Identity | Meaning |
|---|---|
| `playerticker.experimental.in-season-participation-independent/v1` | Original ungated experiment, unchanged and replayable |
| `playerticker.experimental.in-season-participation-independent/v2-role-gated` | New explicit configuration; v1 source plan plus role eligibility gate |
| `playerticker.experimental.role-evidence-opportunities/v1` | Faithful implementation of reviewed proposal-1, experimental thresholds |
| `playerticker.experimental.role-references/v1` | Validated external reference bundle |
| `playerticker.experimental-evaluation/2` | Gated diagnostic result schema |

No date, environment setting, missing participation, or ordinary replay enables v2. Supplying role references with v1 is rejected, not silently ignored. Production source requirements, inference, formulas, admission, windows, ranks, publication and workflows are unchanged. No dependency was added. Both experiments remain non-serving; there is no persistence/publication handle or serving board in their result. Only the existing evidence-driven QB FULL and RB/WR/TE ACCESSIBLE paths are authorized; no tier is forced to evade a hold.

The source period remains exactly one explicitly selected September–December valuation season, 2023 onward. Configured career-game coordinates are mandatory. Participation is deliberately omitted under the existing documented delivery policy; other nflverse capabilities remain mandatory. Optional Sleeper is not role authority and remains optional.

## Implemented rule

The reviewed scope is QB STARTER; RB Three-down lead back or Lead rusher; WR Alpha target earner; TE Primary receiving option. Other claims are unknown/unsupported, not silently approved. Expire at two completed same-tenure regular-season opportunities without support for QB, three for non-QB. These thresholds are provisional, not validated production methodology.

Corroboration is an official QB start; RB at least 15 carries plus 3 targets for Three-down lead back, or 15 carries for Lead rusher; WR at least 9 targets; TE at least 6 targets. Lead rusher does not require receiving fields. Restoration needs one QB start or two consecutive corroborating non-QB games. Cameos/special-teams-only usage do not refresh stronger claims. Missing fields are unknown, never zero. Official non-QB starts, touches, snaps and targets are not interchangeable.

Only explicit FINAL games with actual-start/completion/known-at proof count. Bye/postponed/cancelled events do not count. An unresolved past scheduled/in-progress/abandoned game fails reference coverage instead of assuming completion. A postponed game's actual start determines tenure attribution. Missing/invalid FINAL timing fails before filtering. Membership intervals are half-open; explicit continuity is required. Trades start a new tenure; release means no current-team claim, not removal from admission.

Trusted team-authoritative AFFIRM of the exact claim may restore qualitative support for seven days inclusive or until the next completed opportunity. Generic depth rank or optional Sleeper cannot attest an alpha/lead workload. WITHDRAW immediately removes the claim; simultaneous affirmative/negative attestations conflict; later qualifying evidence can restore support. Future-effective/known evidence is excluded. Availability is separately dated and valid-through: injury/IR/PUP/NFI/suspension do not infer benching or stop the opportunity clock. Offseason with no games does not advance it, but still requires current tenure/reference coverage.

After expiration, withdrawal, conflict, or prior-tenure model history, a **sticky numerical hold** remains even after qualitative restoration. No new post-gap workload window or fallback formula is introduced. Historical performance remains intact. The implementation binds references in both directions to captured game coordinates and checks observed workload/starts. Captured pre-tenure history independently prevents redating references from reopening old numerical workload. Scheduled games must be represented for the membership team's side, not merely the opponent. These are conservative integrity checks, not new role methodology.

## Results and disjoint population categories

`players` holds identity, selected tier, baseline inference status, role state/reason, opportunity counts, historical-performance checksum, and numerical eligibility. `roleEvidence.historicalObservations` is the as-of view; original capture and reference bytes remain immutable. Actual normalized-history checksums and baseline inference checksums support preservation comparisons. No engine output, accessible output, valuation, horizon value, rank or comparison number is serialized, even for eligible players. `roleGate.eligiblePlayers` contains IDs/positions only. Thus held numbers cannot leak through an eligible value field or ranking. Baseline diagnostics are explicitly `eligible:false` and contain only historical role labels and output checksums—not values.

The terminal category precedence is mutually exclusive:

1. `blocked_source_coverage`: a mandatory acquisition coordinate failed/missing.
2. `blocked_reference_coverage`: bundle unavailable/invalid, missing player reference, incomplete semantic coverage, or inconsistent captured coordinates.
3. `failed_inference`: failed, missing or malformed-null outcome (original subtype retained separately).
4. `unsupported_model_path`: evidence chose a path this experiment does not authorize.
5. `legitimate_insufficient`: actual existing successful model INSUFFICIENT under complete source/reference coverage; not a role hold.
6. `numerically_eligible`: existing supported path plus continuously supported observed role, without numerical discontinuity.
7. `held_expired_role`: expired/unestablished state with unsupported-opportunity count at the threshold.
8. `held_unknown_role`: other uncertainty, withdrawal, unsupported claim, attestation-only or restored-but-numerically-held state.

`roleGate.byPosition` includes `selected` and all eight disjoint counts; their sum equals selected. Precedence does not hide secondary facts: `inferenceStatus`, `roleEvidenceState`, `referenceCoverageComplete`, source diagnostics and `baselineDiagnostic` remain separate. `sourcePlanComplete` and `inferenceComplete` retain acquisition/model meanings. Run-level reference failure and per-player reference failures are separate. `experimentalEvaluationComplete` is false for any hold/failure; no incomplete run is called a valid board. `productionPublicationAuthorized` is always false, including fully eligible synthetic runs.

## Reference input contract and replay manifest

The strict executable schema is in `src/runtime/experimentalRoleReferences.ts`. This is a curated, auditable evidence boundary, **not authentication of assertions by an external provider**. A checksum establishes identity/integrity, not truth. Reference creators must substantiate source assertions; `trusted:true` alone cannot replace the required records. Use non-secret source/record identifiers, not signed URLs or raw provider payloads.

Required manifest (retain it with the immutable capture directory and reference JSON):

| Field | Required contents |
|---|---|
| Code | Exact candidate SHA and tree (`git rev-parse HEAD HEAD^{tree}`) |
| Configuration | v2 ID above; source configuration v1; role policy v1 |
| Clock | Explicit ISO as-of; no wall-clock model rule |
| Seasons | One valuation season; every configured career season |
| Captures | Retained raw transport-envelope directory, IDs/request keys/payload checksums; same acquisition plan on replay |
| References | File path; bundle id/version/source/createdAt; SHA-256 checksum of canonical content excluding `checksum` |
| Bundle scope | Exact asOf and seasons; coverageFrom plus coverageThrough equal to asOf |
| Sources | `[{id,capturedAt,checksum}]`; each evidence/coverage provenance must reference one listed source ID |
| Players | `[{canonicalId,position,evidence}]`; canonical identity must match the actual selected player |
| Model versions | Registry, inference layer, engine, transport/result schemas and curve versions emitted by evaluator |

Each player's `evidence` has:

- `coverage`: explicit `{complete,provenance}` for `mandatorySources`, `completion`, `playerObservations`, `membership`. Missing/false coverage cannot be disguised as legitimate player insufficiency.
- `memberships`: `{team,from,to,knownAt,trusted,provenance,continuityEvidence}`; null team requires positive release/free-agency evidence. Weekly roster rows alone do not establish continuous tenure.
- `opportunities`: `{id,team,seasonType,scheduledAt,startedAt,completedAt,knownAt,status,completionProof,trusted,provenance}`. Use actual game IDs from capture. Include every known scheduled relevant-team coordinate in coverage, with unresolved statuses explicit. Do not infer FINAL from date or scores.
- `observations`: `{id,gameId,team,observedAt,knownAt,trusted,provenance,roleFieldsComplete,officialStart?,carries?,targets?,specialTeamsOnly?,offensiveSnaps?}`. Retain all historical captured REG coordinates, including career/old-team rows before coverageFrom, to preserve discontinuity. Optional historical receptions/yards/TDs are supported. Relevant counts must match captured workload; no fabricated zeros.
- `attestations`: `{id,team,claim,verdict,effectiveAt,knownAt,authority,trusted,provenance}`. `authority:TEAM_OFFICIAL` is required to adjudicate a role. An empty list is valid; do not manufacture current evidence.
- `availabilityAttestations`: `{id,status,effectiveAt,knownAt,validThrough,trusted,provenance}`; absent evidence remains UNKNOWN. Defaulted ACTIVE roster status is not accepted as affirmative availability.

Compute the checksum using exported `roleReferenceChecksum(content)` (SHA-256 over `stableStringify`, object keys sorted, arrays in supplied order). It must cover every field except the checksum itself. Validate with `validateRoleReferences(bundle, {asOf,valuationSeasons,careerSeasons})`; the evaluator repeats validation and cross-checks captured coordinates. A strictly malformed/global bundle blocks reference coverage for every selected player. A missing individual record blocks that player and run reference completeness. Reasons are sanitized codes, not payloads. Same capture, bundle, clock and version inputs replay deterministically; differing bundle identity enters the evaluation identity.

## Exact next population invocation (not run here)

From the repository root, after staging retained current-season captures and the validated bundle at these paths:

```sh
npm run evaluate:in-season-experiment -- \
  --config playerticker.experimental.in-season-participation-independent/v2-role-gated \
  --seasons 2026 --career-seasons 2017,2018,2019,2020,2021,2022,2023,2024,2025 \
  --as-of 2026-09-21T00:00:00.000Z --mode replay --no-sleeper \
  --captures ../../inputs/role-population-2026/captures \
  --role-references ../../inputs/role-population-2026/role-references.json \
  --code-sha "$(git rev-parse HEAD)" --code-tree "$(git rev-parse 'HEAD^{tree}')" \
  --output-dir ../../outputs/role-population-2026
```

This deliberately uses the investigated full career coordinate list and explicitly omits optional Sleeper; change only through a recorded manifest, never implicitly. A later as-of requires matching new capture/reference scope. The command returns exit 1 and saves diagnostics when holds/failures remain; do not treat that as permission to relax requirements. Repeated identical output uses exclusive creation: use another isolated output directory to compare a replay. Omitting `--role-references` is allowed only to report explicit missing-reference holds, not to produce eligibility.

Already available: deterministic synthetic fixture bundle data, identity/schedule/roster/games normalization, official-start and usage fields, existing isolated capture/replay path. Not yet established: suitable retained current-season population captures; affirmative final-game/time proof and continuous historical membership; trustworthy dated role/availability attestations. Normalized schedule lacks final proof, roster statuses may default ACTIVE and teamless rows may be dropped. No new feed or normalizer preservation is implemented here. A source-wide outage stays source/reference failure, never hundreds of legitimate INSUFFICIENT results. The February 2026 capture is not current-season coverage. Synthetic passing results establish control flow only.

## Verification and scope

`src/runtime/__fixtures/roleEvidenceReviewed.json` faithfully imports all 85 reviewed fixtures (serialized collection SHA-256 `3c166541e53680728c5102f7b468cb0dc58bbf64e2bc639dd5bca1592d09a62a`). Tests include exact expiry/corroboration boundaries, absence types, trade/release, actual-start attribution, future/conflicting evidence, interrupted returns and sticky numerical holds. New integration tests execute normalization → evidence → model → gate, compare unchanged baseline checksums, replay with different wall clocks, and seed/preserve last-good publication bytes/identity/timestamp/checksum/pointer despite an ignored gate. Production default participation rejection and v1 replay remain tested.

Run focused tests then full validation:

```sh
npx vitest run src/runtime/experimentalRoleEvidence.test.ts src/runtime/experimentalInSeason.test.ts src/runtime/careerWindow.test.ts src/runtime/livePipeline.test.ts src/services/publication/canonicalContract.test.ts src/persistence/publicationCompleteness.test.ts src/ops/deploymentDataGate.test.ts src/ops/sourceFailureDiagnostics.test.ts
npm test
npm run typecheck
npm run build
```

Local full-suite HTTP-adapter tests require loopback socket permission; the sandboxed run times out, while the permitted run executes them. Existing React test and bundle-size warnings are unrelated. Build is verification only, with no serving-data copy or deployment. Exact candidate SHA/tree, CI and independent review verdict are recorded in the final handoff rather than self-referential source files. The next substantive step is the bounded population evaluation, subject to the listed reference limitations—not another policy audit.
