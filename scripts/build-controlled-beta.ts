/** Replay-only private preview generation. No production database, publication or network. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { controlledBetaSchema, CONTROLLED_BETA_CONFIGURATION, type BetaPlayer } from '@/contracts/controlledBeta';
import type { BuildInputOptions, GameStatRecord, NormalizedSnapshot } from '@/ingestion';
import { buildNormalizedInferenceInput } from '@/ingestion/buildInput';
import { BETA_AGGREGATION_VERSION } from '@/ingestion/aggregationPolicy';
import { normalizeTeam } from '@/ingestion/ordering';
import { stableStringify } from '@/inference/util/checksum';
import { buildBetaReferenceLedger, type BetaRawRow, type BetaReferenceTable } from '@/ingestion/betaReferences';
import { buildExperimentalInSeasonSourcePlan, classifyExperimentalPlayers, EXPERIMENTAL_ROLE_GATED_CONFIGURATION,
  type ExperimentalInSeasonOptions } from '@/runtime/experimentalInSeason';
import { applyExperimentalRoleGate, type RoleTerminalCategory } from '@/runtime/experimentalRoleGate';
import { roleReferenceChecksum, validateRoleReferences } from '@/runtime/experimentalRoleReferences';
import { selectInferenceBuilds } from '@/runtime/selection';
import { buildDefaultRegistry, computeRequestKey, defaultTransportConfig, HttpClient, refreshSources } from '@/transport';
import { fixedClock } from '@/transport/clock';
import { splitCsvRows } from '@/transport/csv';
import { FilePayloadStore } from '@/transport/fileStore';
import { readReleaseManifest } from '@/transport/providers/nflverseReleases';
import { PRODUCTION_CURVE } from '@/utility/productionCurve';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const readJSON = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const isWithin = (child: string, parent: string) => child === parent || child.startsWith(parent + sep);
const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

/** Existing ancestors are resolved first, so symlinks cannot route output into the checkout. */
export function isolatedBetaOutput(value: string, repo = repository): string {
  const requested = resolve(value); let ancestor = requested;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('BETA_OUTPUT_PARENT_UNAVAILABLE');
    ancestor = parent;
  }
  const physical = resolve(realpathSync(ancestor), relative(ancestor, requested));
  if (isWithin(physical, realpathSync(repo)) || physical.split(sep).some((part) => ['site-data', 'dist', 'public'].includes(part))) {
    throw new Error('BETA_OUTPUT_MUST_BE_EXTERNAL_AND_NON_SERVING');
  }
  if (existsSync(physical)) throw new Error('BETA_OUTPUT_MUST_BE_A_NEW_DIRECTORY');
  return physical;
}

const rawMetaSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), rawFile: z.string().regex(/^[a-z0-9-]+\.body$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.literal(200), retrievedAt: z.string().datetime(),
  headers: z.record(z.string()), bytes: z.number().int().nonnegative() }).passthrough();
const manifestSchema = z.object({ options: z.object({ asOf: z.string().datetime(), valuationSeasons: z.array(z.number().int()).length(1),
  careerSeasons: z.array(z.number().int()), includeSleeper: z.literal(false), configurationId: z.literal(EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id) }).passthrough(),
  rawCaptures: z.array(rawMetaSchema), requiredCoordinates: z.array(z.string()) }).passthrough();
const sealSchema = z.object({ asOf: z.string().datetime(), files: z.array(z.object({ name: z.string().regex(/^[a-z0-9-]+\.json$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) })) });

export function verifyBetaInputSeal(root: string) {
  const seal = sealSchema.parse(readJSON(join(root, 'freeze-seal.json')));
  const required = ['frozen-manifest.json', 'envelope-identities.json', 'selected-before-inference.json', 'role-references.json'];
  if (new Set(seal.files.map((f) => f.name)).size !== seal.files.length || required.some((name) => !seal.files.some((f) => f.name === name))) {
    throw new Error('BETA_FROZEN_INPUT_MANIFEST_INCOMPLETE');
  }
  // The archived snapshot is not consumed: normalization is replayed from verified
  // raw-linked envelopes. All input files this driver consumes are checked below.
  for (const file of seal.files.filter((f) => f.name !== 'normalized-snapshot.json')) {
    if (sha(readFileSync(join(root, file.name))) !== file.sha256) throw new Error('BETA_FROZEN_INPUT_CHECKSUM_MISMATCH');
  }
  return seal;
}

export function assertUnchangedBetaSelection(actual: readonly { canonicalId: string; position: string }[], prior: readonly { canonicalId: string; position: string }[]) {
  if (new Set(actual.map((b) => b.canonicalId)).size !== actual.length
    || stableStringify(actual.map((b) => [b.canonicalId, b.position])) !== stableStringify(prior.map((b) => [b.canonicalId, b.position]))) {
    throw new Error('BETA_UNAUTHORIZED_SELECTION_DRIFT');
  }
}

function parse(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--input-dir', '--output-dir', '--code-sha', '--code-tree', '--generated-at'].includes(argv[i]) || !argv[i + 1] || args.has(argv[i])) {
      throw new Error('BETA_ARGUMENT_INVALID');
    }
    args.set(argv[i], argv[i + 1]);
  }
  const get = (key: string) => { const value = args.get(key); if (!value) throw new Error(`${key} is required`); return value; };
  return { input: realpathSync(get('--input-dir')), output: isolatedBetaOutput(get('--output-dir')),
    codeIdentity: { sha: get('--code-sha'), tree: get('--code-tree') }, generatedAt: get('--generated-at') };
}

function readTable(root: string, meta: z.infer<typeof rawMetaSchema>): BetaReferenceTable {
  const bytes = readFileSync(join(root, 'raw', meta.rawFile));
  if (sha(bytes) !== meta.sha256 || bytes.length !== meta.bytes) throw new Error('BETA_RAW_CAPTURE_CHECKSUM_MISMATCH');
  const [headers, ...rows] = splitCsvRows(bytes.toString('utf8'), ',');
  if (!headers || new Set(headers).size !== headers.length || rows.some((row) => row.length !== headers.length)) throw new Error('BETA_RAW_CSV_SHAPE_INVALID');
  return { source: { id: meta.id, checksum: meta.sha256, capturedAt: meta.retrievedAt,
    sourceUpdatedAt: meta.headers['last-modified'] ? new Date(meta.headers['last-modified']).toISOString() : null },
    rows: rows.map((row) => Object.fromEntries(headers.map((key, index) => [key, row[index]]))) };
}
const rawValue = (s: string | undefined) => s && s !== 'NA' ? s : null;
const modeled = (p: string | null | undefined): p is typeof POSITIONS[number] => POSITIONS.includes(p as typeof POSITIONS[number]);
function previewTerminal(category: RoleTerminalCategory | undefined): BetaPlayer['terminalCategory'] {
  if (category === 'numerically_eligible') throw new Error('BETA_VALUE_PROJECTION_NOT_AUTHORIZED');
  return category ?? 'not_selected';
}

/** Broad display census only. This does not change selectInferenceBuilds or admission. */
export function betaAuditUniverse(snapshot: NormalizedSnapshot, roster: readonly BetaRawRow[], season: number, asOf: string,
  gated: ReturnType<typeof applyExperimentalRoleGate>, finalTeams: ReadonlySet<string>): { players: BetaPlayer[]; exclusions: Record<string, Record<string, number>>; audit: unknown[] } {
  const canonical = new Map(snapshot.players.filter((p) => p.providerIds.gsis).map((p) => [p.providerIds.gsis, p]));
  const selected = new Map(gated.players.map((p) => [p.canonicalId, p]));
  const histories = new Map<string, GameStatRecord[]>();
  for (const game of snapshot.games) if (game.canonicalId && game.seasonType === 'REG' && Date.parse(game.kickoff) <= Date.parse(asOf)) {
    const rows = histories.get(game.canonicalId) ?? []; rows.push(game); histories.set(game.canonicalId, rows);
  }
  const groups = new Map<string, BetaRawRow[]>();
  for (const row of roster.filter((r) => modeled(r.position))) {
    const key = rawValue(row.gsis_id) ? `gsis:${row.gsis_id}` : rawValue(row.espn_id) ? `espn:${row.espn_id}` : `unresolved:${row.full_name}|${row.birth_date}`;
    const rows = groups.get(key) ?? []; rows.push(row); groups.set(key, rows);
  }
  const exclusions: Record<string, Record<string, number>> = Object.fromEntries(POSITIONS.map((p) => [p, {}]));
  const audit: unknown[] = [];
  const players: BetaPlayer[] = [];
  const displayedSelected = new Set<string>();
  const history = (id: string | null) => {
    const games = id ? histories.get(id) ?? [] : [];
    const sum = (key: 'passingYards' | 'rushingYards' | 'receivingYards' | 'targets'): number | null =>
      games.length && games.every((g) => g[key] !== null) ? games.reduce((n, g) => n + g[key]!, 0) : null;
    return { games: games.length, fromSeason: games.length ? Math.min(...games.map((g) => g.season)) : null,
      throughSeason: games.length ? Math.max(...games.map((g) => g.season)) : null,
      passingYards: sum('passingYards'), rushingYards: sum('rushingYards'), receivingYards: sum('receivingYards'), targets: sum('targets') };
  };
  for (const [key, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const week = Math.max(...rows.map((r) => Number(r.week)));
    const latest = rows.filter((r) => Number(r.week) === week); const row = latest[0];
    const player = canonical.get(row.gsis_id); const id = player?.canonicalId ?? null;
    const result = id ? selected.get(id) : undefined;
    if (result && displayedSelected.has(result.canonicalId)) throw new Error('BETA_AUDIT_DUPLICATE_CANONICAL_IDENTITY');
    if (result) displayedSelected.add(result.canonicalId);
    const teams = [...new Set(latest.map((r) => rawValue(r.team)))];
    const statuses = [...new Set(latest.map((r) => rawValue(r.status)))];
    const codes = latest.map((r) => r.status_description_abbr);
    const conflict = teams.length > 1 || statuses.length > 1 || new Set(latest.map((r) => r.position)).size > 1;
    const past = (id ? histories.get(id) ?? [] : []).filter((g) => g.season < season);
    const production = past.some((g) => [g.passAttempts, g.carries, g.targets].some((n) => n != null && n > 0));
    const rookie = Number(row.rookie_year) === season || Number(row.entry_year) === season;
    const injury = codes.some((c) => ['R01', 'R04', 'R05', 'R27', 'R47', 'R48'].includes(c));
    const suspended = statuses.includes('SUS') || codes.some((c) => ['R30', 'R33', 'R40'].includes(c));
    let reason = 'selected';
    if (!result) {
      if (!id) reason = 'identity_unresolved';
      else if (!modeled(player?.position)) reason = 'identity_position_not_modelled';
      else if (conflict) reason = 'conflicting_latest_roster';
      else if (statuses.includes('RET') || statuses.includes('CUT')) reason = 'explicit_retired_or_cut';
      else if (suspended) reason = 'suspended_no_current_game';
      else if (statuses.includes('RES') || injury) reason = 'reserve_injury_no_current_game';
      else if (!teams.some((t) => t !== null && finalTeams.has(normalizeTeam(t)!))) reason = 'team_no_confirmed_completion';
      else if (rookie && !production) reason = 'rookie_no_professional_production';
      else if (['ACT', 'INA', 'DEV'].includes(row.status) && production) reason = 'attached_veteran_no_current_game';
      else reason = 'other_no_current_game';
    }
    const position = result?.position ?? row.position as typeof POSITIONS[number];
    if (!result) exclusions[position][reason] = (exclusions[position][reason] ?? 0) + 1;
    audit.push({ key, canonicalId: id, rosterPosition: row.position, displayPosition: position, selected: Boolean(result), reason,
      latestWeek: week, teams, statuses, codes, conflict, injury, suspended, rookie, priorProduction: production });
    players.push({ id: result?.canonicalId ?? key, canonicalId: id, name: row.full_name || player?.nameNormalized || 'Unknown player',
      position, team: teams.length === 1 ? normalizeTeam(teams[0]) : null, rosterStatus: statuses.length === 1 ? statuses[0] : null, rosterWeek: week,
      selected: Boolean(result), terminalCategory: previewTerminal(result?.terminalCategory), baselineTier: result?.selectedTier ?? null,
      baselineOutcome: result?.inferenceStatus ?? null, reasons: result ? [result.roleReason] : [reason], historical: history(id),
      numericallyEligible: false, dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null });
  }
  for (const result of gated.players.filter((p) => !displayedSelected.has(p.canonicalId))) {
    const player = snapshot.players.find((p) => p.canonicalId === result.canonicalId)!;
    players.push({ id: result.canonicalId, canonicalId: result.canonicalId, name: player.nameNormalized, position: result.position,
      team: null, rosterStatus: null, rosterWeek: null, selected: true, terminalCategory: previewTerminal(result.terminalCategory),
      baselineTier: result.selectedTier, baselineOutcome: result.inferenceStatus, reasons: [result.roleReason, 'NO_ROSTER_OBSERVATION'],
      historical: history(result.canonicalId), numericallyEligible: false, dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null });
  }
  return { players: players.sort((a, b) => a.id.localeCompare(b.id)), exclusions, audit };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parse(argv);
  z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/), tree: z.string().regex(/^[a-f0-9]{40}$/) }).parse(args.codeIdentity);
  z.string().datetime().parse(args.generatedAt);
  const git = (...params: string[]) => execFileSync('git', params, { cwd: repository, encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== args.codeIdentity.sha || git('rev-parse', 'HEAD^{tree}') !== args.codeIdentity.tree) throw new Error('BETA_CODE_IDENTITY_MISMATCH');
  const modifiedFiles = [...new Set([...git('diff', '--name-only', '-z', 'HEAD').split('\0'),
    ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')])]
    .filter((path) => path && path !== 'node_modules' && !path.startsWith('node_modules/')).sort();
  const worktreeFiles = modifiedFiles.map((path) => ({ path, sha256: existsSync(join(repository, path)) ? sha(readFileSync(join(repository, path))) : null }));
  const modified = worktreeFiles.length > 0;
  const worktreeDiffSha256 = modified ? sha(stableStringify(worktreeFiles)) : null;
  const seal = verifyBetaInputSeal(args.input);
  const manifest = manifestSchema.parse(readJSON(join(args.input, 'frozen-manifest.json')));
  if (manifest.options.asOf !== seal.asOf || Date.parse(args.generatedAt) < Date.parse(seal.asOf)) throw new Error('BETA_CLOCK_SCOPE_INVALID');
  const options: ExperimentalInSeasonOptions = { configurationId: EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id,
    asOf: seal.asOf, valuationSeasons: manifest.options.valuationSeasons, careerSeasons: manifest.options.careerSeasons,
    mode: 'replay', includeSleeper: false, codeIdentity: args.codeIdentity };
  const plan = buildExperimentalInSeasonSourcePlan(options);
  const coordinates = plan.requested.map((r) => computeRequestKey(r.provider, r.capability, r.params ?? {})).sort();
  if (stableStringify(coordinates) !== stableStringify([...manifest.requiredCoordinates].sort())) throw new Error('BETA_SOURCE_PLAN_DRIFT');
  const metas = new Map(manifest.rawCaptures.map((m) => [m.id, m]));
  if (metas.size !== manifest.rawCaptures.length) throw new Error('BETA_DUPLICATE_CAPTURE_IDENTITY');
  // Validate every retained raw capture, including timestamp files, before model execution.
  for (const meta of metas.values()) {
    const bytes = readFileSync(join(args.input, 'raw', meta.rawFile));
    if (sha(bytes) !== meta.sha256 || bytes.length !== meta.bytes || Date.parse(meta.retrievedAt) > Date.parse(options.asOf)) throw new Error('BETA_RAW_CAPTURE_CHECKSUM_MISMATCH');
  }
  const table = (id: string) => { const meta = metas.get(id); if (!meta) throw new Error('BETA_MANDATORY_RAW_CAPTURE_MISSING'); return readTable(args.input, meta); };
  const tables = { schedule: table('schedule'), playByPlay: table(`pbp-${options.valuationSeasons[0]}`), roster: table(`roster-${options.valuationSeasons[0]}`),
    games: [...options.careerSeasons!, ...options.valuationSeasons].map((s) => table(`games-${s}`)) };
  const roleReferences = readJSON(join(args.input, 'role-references.json'));
  const validated = validateRoleReferences(roleReferences, options);
  if (!validated.complete) throw new Error(validated.reason!);
  const captureDir = join(args.input, 'captures');
  if (!existsSync(captureDir)) throw new Error('BETA_CAPTURE_DIRECTORY_MISSING');
  const captureStore = new FilePayloadStore(captureDir);
  const envelopeHashes: string[] = [];
  for (const request of plan.requested) {
    const key = computeRequestKey(request.provider, request.capability, request.params ?? {});
    const envelope = await captureStore.getLatest(request.provider, request.capability, key);
    const id = request.capability === 'games' ? `games-${request.params!.season}` : request.capability === 'roster' ? `roster-${request.params!.season}` : request.capability;
    const meta = metas.get(id);
    const stampId = request.capability === 'games' ? 'games-stamp' : `${request.capability}-stamp`;
    const stampMeta = metas.get(stampId);
    const stamp = stampMeta ? readReleaseManifest(readFileSync(join(args.input, 'raw', stampMeta.rawFile), 'utf8')) : null;
    if (!envelope || !meta || typeof envelope.payload !== 'string' || sha(envelope.payload) !== meta.sha256
      || envelope.fetchedAt !== meta.retrievedAt || envelope.effectiveDate !== options.asOf || envelope.payloadEncoding !== 'utf8'
      || envelope.httpStatus !== 200 || envelope.sourceUrl !== meta.url || envelope.contentType !== meta.headers['content-type']
      || envelope.lastModified !== meta.headers['last-modified'] || envelope.etag !== meta.headers.etag
      || envelope.sourceVersion !== stamp?.sourceVersion || envelope.sourceLastUpdated !== stamp?.sourceLastUpdated) throw new Error('BETA_REPLAY_ENVELOPE_MISMATCH');
    envelopeHashes.push(sha(stableStringify(envelope)));
  }
  mkdirSync(args.output, { recursive: false });
  const write = (name: string, value: unknown) => writeFileSync(join(args.output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const frozen = { configurationId: CONTROLLED_BETA_CONFIGURATION, options, aggregationPolicyId: BETA_AGGREGATION_VERSION,
    generatedAt: args.generatedAt, codeIdentity: args.codeIdentity, worktreeDiffSha256, worktreeFiles, worktreeDirty: modified,
    inputManifestSha256: sha(readFileSync(join(args.input, 'frozen-manifest.json'))),
    rawCaptures: [...metas.values()].map((m) => ({ id: m.id, checksum: m.sha256, capturedAt: m.retrievedAt })),
    referenceIdentity: validated.identity, envelopeHashes, requiredCoordinates: coordinates, intentionallyOmitted: plan.omitted,
    scope: 'Private limitation preview; existing strict v2 numerical holds remain active; no source-policy production adoption.' };
  write('frozen-beta-manifest.json', frozen);
  let builds: BuildInputOptions[] = [];
  const refresh = await refreshSources({ sources: plan.requested, policy: { requiredProviders: ['nflverse'] }, inference: (snapshot) => {
    builds = selectInferenceBuilds(snapshot, options).map((build) => ({ ...build, aggregationPolicy: BETA_AGGREGATION_VERSION }));
    return builds;
  } }, { registry: buildDefaultRegistry(), config: defaultTransportConfig(), store: {
    getLatest: (...p) => captureStore.getLatest(...p), getByChecksum: (...p) => captureStore.getByChecksum(...p),
    put: async () => { throw new Error('BETA_CAPTURE_WRITES_FORBIDDEN'); },
  }, client: new HttpClient({ fetchFn: () => { throw new Error('BETA_NETWORK_FORBIDDEN'); } }), clock: fixedClock(options.asOf) });
  if (!refresh.snapshot) throw new Error('BETA_NORMALIZATION_UNAVAILABLE');
  const sourcePlanComplete = plan.requested.every((r) => refresh.sources.some((s) =>
    s.requestKey === computeRequestKey(r.provider, r.capability, r.params ?? {}) && s.outcome !== 'failed'));
  const baseline = classifyExperimentalPlayers(builds, refresh.inference, sourcePlanComplete);
  const gated = applyExperimentalRoleGate(baseline, validated, sourcePlanComplete, options.asOf, refresh.snapshot);
  const aggregationDiagnostics = builds.map((build) => ({ canonicalId: build.canonicalId, position: build.position,
    coverage: buildNormalizedInferenceInput(refresh.snapshot!, build)?.evidence.aggregationCoverage ?? null }));
  const aggregationIncomplete = aggregationDiagnostics.filter((p) => p.coverage?.numericalEvidenceComplete !== true);
  const aggregationEvidenceComplete = aggregationIncomplete.length === 0 && aggregationDiagnostics.length === builds.length;
  // This first preview's transport is intentionally all-unavailable. Future eligible
  // values need a separately reviewed projection; they cannot silently enter here.
  if (gated.eligiblePlayers.length || gated.referenceCoverageComplete) throw new Error('BETA_VALUE_PROJECTION_NOT_AUTHORIZED');
  const inferenceComplete = builds.length > 0 && refresh.inference.length === builds.length
    && baseline.every((p) => ['valued', 'legitimate_insufficient'].includes(p.inferenceStatus));
  const ledger = buildBetaReferenceLedger({ asOf: options.asOf, valuationSeasons: options.valuationSeasons, ...tables,
    identities: refresh.snapshot.players.filter((p) => p.canonicalId && p.providerIds.gsis).map((p) => ({ canonicalId: p.canonicalId!, gsisId: p.providerIds.gsis })) });
  const weeks = [...new Set(ledger.games.filter((g) => g.scheduledDate <= options.asOf.slice(0, 10)).map((g) => g.week))].sort((a, b) => a - b);
  const completedWeeks = weeks.filter((w) => ledger.games.filter((g) => g.week === w).every((g) => g.state === 'FINAL_KNOWN_BY'));
  const finalTeams = new Set(ledger.games.filter((g) => g.state === 'FINAL_KNOWN_BY').flatMap((g) => g.canonicalTeams));
  const acceptedRosterRows = new Set(ledger.memberships.map((m) => m.provenance.row));
  const census = betaAuditUniverse(refresh.snapshot, tables.roster.rows.filter((_row, i) => acceptedRosterRows.has(i)),
    options.valuationSeasons[0], options.asOf, gated, finalTeams);
  const aggregationBlocked = new Set(aggregationIncomplete.map((p) => p.canonicalId));
  for (const player of census.players) if (player.canonicalId && aggregationBlocked.has(player.canonicalId)) player.reasons.push('AGGREGATION_REFERENCE_GAP');
  const selectedBefore = z.array(z.object({ canonicalId: z.string(), position: z.string() }).passthrough()).parse(readJSON(join(args.input, 'selected-before-inference.json')));
  assertUnchangedBetaSelection(builds, selectedBefore);
  const artifactContent = { configurationId: CONTROLLED_BETA_CONFIGURATION, codeIdentity: args.codeIdentity,
    modelAsOf: options.asOf, evidenceObservedAt: options.asOf, generatedAt: args.generatedAt,
    publication: null, productionPublicationAuthorized: false, leagueSchemaId: 'dynasty-superflex-12',
    sourceConfigurationId: EXPERIMENTAL_ROLE_GATED_CONFIGURATION.sourceConfigurationId, rolePolicyId: EXPERIMENTAL_ROLE_GATED_CONFIGURATION.rolePolicyId,
    aggregationPolicyId: BETA_AGGREGATION_VERSION, referenceLedgerVersion: ledger.version,
    sourcePlanComplete, inferenceComplete, referenceCoverageComplete: false, completedWeeks,
    partialWeeks: weeks.filter((w) => !completedWeeks.includes(w)), finalGames: ledger.capabilities.finalStatusKnownBy.confirmed,
    captureChecksums: [...metas.values()].map((m) => m.sha256).sort(), referenceChecksum: validated.identity!.checksum,
    coverage: gated.byPosition, exclusions: census.exclusions,
    limitations: ['Private testing only. No model values or rankings are approved or exposed.',
      'Historical production remains available; missing current-role references do not imply zero dynasty value.',
      'Final game status is established from captured END_GAME records, without invented ending timestamps.',
      'Weekly roster observations do not establish continuous tenure or present availability.',
      'The provisional 2/3-opportunity role gate remains unchanged and reference-blocked.',
      'Observation-time snapshot includes completed week 1 and partial week 2; it is not a closed-week-only valuation.',
      'Broad roster census is visibility only, not a newly approved admission policy.',
      `${aggregationIncomplete.length} selected players have incomplete aggregation evidence; these flags are separate from their primary role-reference blocks.`,
      ...(ledger.issues.length ? [`${ledger.issues.length} reference-ledger integrity issues remain; invalid records do not establish current roles.`] : []),
      ...(modified ? ['Development preview: tracked HEAD plus recorded local changes; regenerate from final reviewed commit before owner decision.'] : [])],
    players: census.players };
  const artifact = controlledBetaSchema.parse({ ...artifactContent, artifactId: `controlled-beta-${sha(stableStringify(artifactContent)).slice(0, 20)}` });
  write('controlled-beta.json', artifact);
  write('reference-ledger.json', ledger);
  write('audit-census.json', census.audit);
  const originalDir = join(args.input, 'run-1');
  const originalPath = existsSync(originalDir) ? readdirSync(originalDir).filter((p) => p.endsWith('.json')).sort()[0] : null;
  const original = originalPath ? readJSON(join(originalDir, originalPath)) as { players?: { canonicalId: string; selectedTier: string | null; baselineDiagnostic?: { outputChecksum: string | null } }[] } : null;
  const comparisons = gated.players.map((p) => {
    const before = original?.players?.find((b) => b.canonicalId === p.canonicalId);
    return { canonicalId: p.canonicalId, position: p.position, priorTier: before?.selectedTier ?? null, candidateTier: p.selectedTier,
      priorDiagnosticChecksum: before?.baselineDiagnostic?.outputChecksum ?? null, candidateDiagnosticChecksum: p.baselineDiagnostic.outputChecksum,
      numericalValuesExposed: false, historicalPerformanceChecksum: p.historicalPerformanceChecksum };
  });
  write('private-diagnostics.json', { eligible: false, productionPublicationAuthorized: false, sourcePlanComplete, inferenceComplete,
    aggregationEvidenceComplete, aggregationDiagnostics,
    referenceCoverageComplete: gated.referenceCoverageComplete, sourceOutcomes: refresh.sources.map((s) => ({ coordinate: s.requestKey, outcome: s.outcome })),
    versions: { curve: PRODUCTION_CURVE.curveVersion, registry: [...new Set(refresh.inference.flatMap((i) => i.result ? [i.result.registryVersion] : []))],
      inferenceLayer: [...new Set(refresh.inference.flatMap((i) => i.result ? [i.result.inferenceLayerVersion] : []))] },
    roleGate: gated, comparisons, normalization: refresh.summary,
    originalResultChecksum: originalPath ? sha(readFileSync(join(originalDir, originalPath))) : null,
    historicalChecksumsMatched: gated.players.filter((p) => p.historicalPerformanceChecksum === roleReferenceChecksum(refresh.snapshot!.games.filter((g) => g.canonicalId === p.canonicalId))).length,
  });
  write('output-checksums.json', ['controlled-beta.json', 'reference-ledger.json', 'audit-census.json', 'private-diagnostics.json', 'frozen-beta-manifest.json']
    .map((name) => ({ name, sha256: sha(readFileSync(join(args.output, name))) })));
  console.log(JSON.stringify({ artifact: join(args.output, 'controlled-beta.json'), candidates: artifact.players.length,
    selected: builds.length, sourcePlanComplete, inferenceComplete, referenceCoverageComplete: false,
    finalGames: artifact.finalGames, completedWeeks, partialWeeks: artifact.partialWeeks, coverage: gated.byPosition,
    numericalValuesExposed: false, productionPublicationAuthorized: false }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : 'BETA_BUILD_FAILED'); process.exitCode = 1; });
}
