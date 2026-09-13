import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore, PersistenceError } from '@/persistence';
import { tempDbPath } from '@/persistence/__fixtures';
import {
  DEFAULT_RETRY_POLICY,
  HttpClient,
  MemoryPayloadStore,
  fixedClock,
  noSleep,
  zeroRandom,
  type InferenceOutcome,
} from '@/transport';
import {
  AS_OF,
  FETCHED_AT,
  URLS,
  csv,
  defaultRoutes,
  nflverseAssetUrl,
  routingFetch,
  type RouteResponse,
} from '@/transport/__fixtures';
import type { BuildInputOptions } from '@/ingestion';
import type { ProductionResult } from '@/inference/production/types';
import { createLivePipeline } from './livePipeline';
import { buildSourcePlan } from './sources';
import {
  EXPERIMENTAL_IN_SEASON_CONFIGURATION,
  buildExperimentalInSeasonSourcePlan,
  classifyExperimentalPlayers,
  evaluateExperimentalInSeason,
  experimentalPathRequiredCapabilities,
  type ExperimentalInSeasonOptions,
} from './experimentalInSeason';

const CLOCK = fixedClock(FETCHED_AT);
const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) rmSync(dirname(path), { recursive: true, force: true }); });

const BASE_OPTIONS: ExperimentalInSeasonOptions = {
  configurationId: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,
  valuationSeasons: [2025],
  careerSeasons: [],
  asOf: AS_OF,
  mode: 'live',
  includeSleeper: false,
  conditional: false,
  codeIdentity: {
    sha: '579e111a41375dfa9a42e91c847154b43da2f708',
    tree: 'd89a8027489f5fc9df3e39f344c99bd97dd766de',
  },
};

const ids = ['00-QB4', '00-RB4', '00-WR4', '00-TE4'] as const;
const positions = ['QB', 'RB', 'WR', 'TE'] as const;

function identityRows() {
  return ids.map((gsis_id, index) => ({
    gsis_id,
    player_name: `Experimental ${positions[index]}`,
    position: positions[index],
    team: 'CIN',
    age: 25 + index,
    seasons: 3 + index,
    draft_round: index + 1,
    status: 'ACTIVE',
  }));
}

function rosterRows() {
  return ids.map((gsis_id, index) => ({
    gsis_id,
    team: 'CIN',
    season: 2025,
    position: positions[index],
    roster_status: 'ACTIVE',
  }));
}

function kickoff(week: number): string {
  return new Date(Date.UTC(2025, 8, 1 + (week - 1) * 7, 17)).toISOString();
}

function gameId(week: number): string {
  return `2025_${String(week).padStart(2, '0')}_CIN`;
}

function scheduleRows(weeks = 7) {
  return Array.from({ length: weeks }, (_, offset) => {
    const week = offset + 1;
    return {
      game_id: gameId(week), season: 2025, week, season_type: 'REG',
      home_team: 'CIN', away_team: 'CLE', kickoff: kickoff(week),
      home_qb_id: week <= 3 || weeks === 7 ? '00-QB4' : '00-OTHER-QB', away_qb_id: '00-CLE-QB',
    };
  });
}

function gameRows(games = 4) {
  const rows: Record<string, unknown>[] = [];
  for (let week = 1; week <= games; week++) {
    const base = { game_id: gameId(week), kickoff: kickoff(week), season: 2025, season_type: 'REG', team: 'CIN' };
    rows.push(
      { ...base, gsis_id: '00-QB4', attempts: 34, completions: 22, passing_yards: 265, passing_tds: 2, interceptions: 1, sacks: 2, carries: 4, rushing_yards: 21, rushing_tds: 0, snaps: 68, team_snaps: 68 },
      { ...base, gsis_id: '00-RB4', carries: 17, rushing_yards: 74, rushing_tds: 1, targets: 4, receptions: 3, receiving_yards: 24, receiving_tds: 0, snaps: 41, team_snaps: 68 },
      { ...base, gsis_id: '00-WR4', targets: 9, receptions: 6, receiving_yards: 82, receiving_tds: 1, snaps: 58, team_snaps: 68 },
      { ...base, gsis_id: '00-TE4', targets: 6, receptions: 4, receiving_yards: 44, receiving_tds: 0, snaps: 47, team_snaps: 68 },
    );
  }
  return rows;
}

function fourPositionRoutes(args: { games?: number; schedule?: number } = {}): Record<string, RouteResponse> {
  return {
    ...defaultRoutes(),
    [URLS.nflverseIdentity]: csv(identityRows()),
    [URLS.nflverseRoster]: csv(rosterRows()),
    [URLS.nflverseSchedule]: csv(args.schedule ? scheduleRows(args.schedule) : scheduleRows()),
    [URLS.nflverseGames]: csv(gameRows(args.games ?? 4)),
  };
}

function client(routes: Record<string, RouteResponse>, calls?: string[]) {
  return new HttpClient({
    fetchFn: routingFetch(routes, calls), clock: CLOCK, random: zeroRandom, sleep: noSleep,
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
  });
}

async function evaluate(
  routes = fourPositionRoutes(),
  options: ExperimentalInSeasonOptions = BASE_OPTIONS,
  payloadStore = new MemoryPayloadStore(),
) {
  return evaluateExperimentalInSeason(options, { payloadStore, client: client(routes), clock: CLOCK });
}

describe('experimental in-season source configuration', () => {
  it('is explicit, versioned, and omits participation before any request', async () => {
    const calls: string[] = [];
    const result = await evaluate(fourPositionRoutes(), BASE_OPTIONS, new MemoryPayloadStore());
    const plan = buildExperimentalInSeasonSourcePlan(BASE_OPTIONS);

    expect(EXPERIMENTAL_IN_SEASON_CONFIGURATION.version).toBe(1);
    expect(plan.requested.some((request) => request.capability === 'participation')).toBe(false);
    expect(result.sources.find((source) => source.capability === 'participation')).toMatchObject({
      state: 'intentionally_unsupported_for_period', required: false, payloadChecksum: null, error: null,
    });
    // A second run records calls explicitly: no participation manifest or asset is contacted.
    await evaluateExperimentalInSeason(BASE_OPTIONS, { payloadStore: new MemoryPayloadStore(), client: client(fourPositionRoutes(), calls), clock: CLOCK });
    expect(calls.some((url) => url.includes('participation'))).toBe(false);
  });

  it('uses evidence-driven QB FULL and RB/WR/TE ACCESSIBLE paths without participation', async () => {
    const result = await evaluate();
    expect(result.sourcePlanComplete).toBe(true);
    expect(result.inferenceComplete).toBe(true);
    expect(result.experimentalEvaluationComplete).toBe(true);
    expect(result.configuration.productionPublicationAuthorized).toBe(false);
    expect(result.players.map((player) => `${player.position}:${player.selectedTier}`).sort()).toEqual([
      'QB:FULL', 'RB:ACCESSIBLE', 'TE:ACCESSIBLE', 'WR:ACCESSIBLE',
    ].sort());
    expect(result.players.every((player) => player.inferenceStatus === 'valued')).toBe(true);
    expect(result.players.every((player) => player.selectedPathHasRequiredEvidence)).toBe(true);
    expect(result.players.some((player) => player.unavailableInputs.length > 0)).toBe(true);
    expect(result.versions.curveVersion).toMatch(/^production-v1-/);
    expect(result.warnings).toContain('ROLE_VALIDITY_UNRESOLVED: appearance-window role claims can remain stale after missed team opportunities');
  });

  it('cannot activate from a date, a failure, an unknown config, or an ordinary replay plan', () => {
    expect(() => buildExperimentalInSeasonSourcePlan({ ...BASE_OPTIONS, configurationId: 'wrong' as never })).toThrow(/unsupported experimental configuration/);
    expect(() => buildExperimentalInSeasonSourcePlan({ ...BASE_OPTIONS, asOf: '2026-02-01T00:00:00.000Z', valuationSeasons: [2026] })).toThrow(/September-December/);
    const replay = buildExperimentalInSeasonSourcePlan({ ...BASE_OPTIONS, mode: 'replay' });
    expect(replay.requested.every((request) => request.mode === 'replay')).toBe(true);
    expect(replay.omitted).toHaveLength(1);
    expect(buildSourcePlan({ seasons: [2025], effectiveDate: AS_OF, mode: 'replay' }).some((request) => request.capability === 'participation')).toBe(true);
  });

  it.each([
    ['identity', URLS.nflverseIdentity],
    ['schedule', URLS.nflverseSchedule],
    ['roster', URLS.nflverseRoster],
    ['games', URLS.nflverseGames],
  ] as const)('keeps mandatory %s failure distinct and incomplete', async (_capability, url) => {
    const routes = { ...fourPositionRoutes(), [url]: { status: 500, body: 'failed', headers: { 'content-type': 'text/plain' } } };
    const result = await evaluate(routes);
    expect(result.sourcePlanComplete).toBe(false);
    expect(result.experimentalEvaluationComplete).toBe(false);
    expect(result.sources.find((source) => source.requestKey.startsWith(`nflverse:${_capability}`))).toMatchObject({
      required: true, state: 'requested_failure', error: expect.objectContaining({ stage: 'fetch' }),
    });
  });

  it('keeps a configured career-game coordinate mandatory', async () => {
    const options = { ...BASE_OPTIONS, careerSeasons: [2024] };
    const url = nflverseAssetUrl('games', '2024');
    const good = {
      ...fourPositionRoutes(),
      [url]: csv([{ gsis_id: '00-QB4', game_id: '2024_01_CIN', kickoff: '2024-09-01T17:00:00.000Z', season: 2024, season_type: 'REG', team: 'CIN', attempts: 30 }]),
    };
    expect((await evaluate(good, options)).sourcePlanComplete).toBe(true);
    const failed = { ...good, [url]: { status: 500, body: 'failed', headers: { 'content-type': 'text/plain' } } };
    const result = await evaluate(failed, options);
    expect(result.sourcePlanComplete).toBe(false);
    expect(result.sources.find((source) => source.requestKey === 'nflverse:games?season=2024')?.state).toBe('requested_failure');
  });

  it('keeps optional Sleeper failure optional and distinct', async () => {
    const options = { ...BASE_OPTIONS, includeSleeper: true };
    const routes = { ...fourPositionRoutes(), [URLS.sleeperIdentity]: { status: 500, body: 'failed', headers: { 'content-type': 'text/plain' } } };
    const result = await evaluate(routes, options);
    expect(result.sourcePlanComplete).toBe(true);
    expect(result.experimentalEvaluationComplete).toBe(true);
    expect(result.sources.find((source) => source.provider === 'sleeper')).toMatchObject({ required: false, state: 'requested_failure' });
  });

  it('does not force a supported tier and rejects unauthorized valued paths', () => {
    expect(experimentalPathRequiredCapabilities('WR', 'ACCESSIBLE')).not.toBeNull();
    expect(experimentalPathRequiredCapabilities('WR', 'FULL')).toBeNull();
    const build: BuildInputOptions = { canonicalId: 'p', position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' };
    const result = {
      modelTier: 'FULL', engineOutput: {}, accessibleOutput: null, readinessMissing: [],
      mergedSupplement: {}, inferredFields: [], outputChecksum: 'out', reproducibility: { engineVersion: 'wr-mvp-1.0' },
    } as unknown as ProductionResult;
    expect(classifyExperimentalPlayers([build], [{ canonicalId: 'p', position: 'WR', ok: true, result }], true)[0]).toMatchObject({
      inferenceStatus: 'unsupported_model_path', selectedTier: 'FULL', selectedPathHasRequiredEvidence: false,
    });
  });

  it('distinguishes legitimate insufficient, failed, missing, and malformed-null outcomes', () => {
    const builds: BuildInputOptions[] = positions.map((position, index) => ({ canonicalId: `p${index}`, position, asOf: AS_OF, engineVersion: `${position.toLowerCase()}-mvp-1.0` }));
    const insufficient = {
      modelTier: 'INSUFFICIENT', engineOutput: null, accessibleOutput: null, readinessMissing: ['observed-input'],
      mergedSupplement: {}, inferredFields: [], outputChecksum: 'insufficient', reproducibility: { engineVersion: 'qb-mvp-1.0' },
    } as unknown as ProductionResult;
    const outcomes: InferenceOutcome[] = [
      { canonicalId: 'p0', position: 'QB', ok: true, result: insufficient },
      { canonicalId: 'p1', position: 'RB', ok: false, error: 'boom' },
      { canonicalId: 'p3', position: 'TE', ok: true },
    ];
    expect(classifyExperimentalPlayers(builds, outcomes, true).map((player) => player.inferenceStatus)).toEqual([
      'legitimate_insufficient', 'failed_inference', 'missing_inference', 'malformed_null_result',
    ]);
    expect(classifyExperimentalPlayers(builds, outcomes, true)[0]).toMatchObject({
      selectedPath: null, selectedPathHasRequiredEvidence: false, valued: false,
    });
  });

  it('is deterministic over identical replay inputs and never consults the network', async () => {
    const payloadStore = new MemoryPayloadStore();
    const live = await evaluate(fourPositionRoutes(), BASE_OPTIONS, payloadStore);
    const replayOptions = { ...BASE_OPTIONS, mode: 'replay' as const };
    const noNetwork = new HttpClient({ fetchFn: () => { throw new Error('network must not be used'); }, clock: CLOCK });
    const replayA = await evaluateExperimentalInSeason(replayOptions, { payloadStore, client: noNetwork, clock: CLOCK });
    const replayB = await evaluateExperimentalInSeason(replayOptions, { payloadStore, client: noNetwork, clock: CLOCK });
    expect(replayA).toEqual(replayB);
    expect(replayA.snapshotId).toBe(live.snapshotId);
    expect(replayA.players.map((player) => player.outputChecksum)).toEqual(live.players.map((player) => player.outputChecksum));
    expect(replayA.experimentalEvaluationComplete).toBe(true);
    expect(replayA.configuration.id).toBe(EXPERIMENTAL_IN_SEASON_CONFIGURATION.id);
  });

  it('reproduces stale role claims after 3 appearances and 14 later team opportunities without serving them', async () => {
    const options = { ...BASE_OPTIONS, asOf: '2025-12-31T00:00:00.000Z' };
    const result = await evaluate(fourPositionRoutes({ games: 3, schedule: 17 }), options);
    const byPosition = Object.fromEntries(result.players.map((player) => [player.position, player]));
    expect(byPosition.QB.roleClaim).toBe('STARTER');
    expect(byPosition.RB.roleClaim).toBe('Three-down lead back');
    expect(byPosition.WR.roleClaim).toBe('Alpha target earner');
    expect(byPosition.TE.roleClaim).toBe('Primary receiving option');
    expect(result.configuration.roleValidity).toBe('UNRESOLVED_NOT_PRODUCTION_VALIDATED');
    expect(result.configuration.productionPublicationAuthorized).toBe(false);
  });

  it('cannot publish even when a caller ignores the authorization flag; last-good stays byte-identical', async () => {
    const dbPath = tempDbPath();
    paths.push(dbPath);
    const store = PersistenceStore.open(dbPath, () => '2026-01-01T00:00:05.000Z');
    const payloadStore = new MemoryPayloadStore();
    const production = createLivePipeline({ store: () => store, payloadStore, seasons: [2025], asOf: () => AS_OF, clock: CLOCK, client: client(defaultRoutes()) });
    const context = { runId: 'seed', trigger: 'manual' as const, attempt: 1, startedAt: '2026-01-01T00:00:00.000Z' };
    try {
      const refreshed = await production.refresh(context);
      const persisted = await production.persist(context, refreshed);
      expect(persisted.publishable).toBe(true);
      await production.publish(context);
      const beforeRecord = store.getCurrentPublicationRecord();
      const beforeBundle = JSON.stringify(store.getCurrentPublication());

      const experiment = await evaluate();
      expect(() => store.publishBoard({ runId: experiment.evaluationId })).toThrow(PersistenceError);
      expect(store.getCurrentPublicationRecord()).toEqual(beforeRecord);
      expect(JSON.stringify(store.getCurrentPublication())).toBe(beforeBundle);
    } finally {
      store.close();
    }
  });

  it('ordinary production behavior still requests participation and rejects its failure', async () => {
    const dbPath = tempDbPath();
    paths.push(dbPath);
    const store = PersistenceStore.open(dbPath, () => '2026-01-01T00:00:05.000Z');
    const routes = { ...defaultRoutes(), [URLS.nflverseParticipation]: { status: 404, body: 'not scheduled', headers: { 'content-type': 'text/plain' } } };
    const calls: string[] = [];
    const pipeline = createLivePipeline({ store: () => store, payloadStore: new MemoryPayloadStore(), seasons: [2025], asOf: () => AS_OF, clock: CLOCK, client: client(routes, calls) });
    const context = { runId: 'ordinary-failure', trigger: 'manual' as const, attempt: 1, startedAt: '2026-01-01T00:00:00.000Z' };
    try {
      const refreshed = await pipeline.refresh(context);
      const persisted = await pipeline.persist(context, refreshed);
      expect(calls).toContain(URLS.nflverseParticipation);
      expect(refreshed.result.sources.find((source) => source.capability === 'participation')?.outcome).toBe('failed');
      expect(refreshed.result.summary.requiredFailures).toEqual(['nflverse']);
      expect(persisted.publishable).toBe(false);
      expect(() => store.publishBoard({ runId: context.runId })).toThrow(/required provider failed/);
      expect(store.getCurrentPublicationRecord()).toBeNull();
    } finally {
      store.close();
    }
  });
});
