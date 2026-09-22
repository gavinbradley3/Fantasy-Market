import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FilePayloadStore } from '@/transport/fileStore';
import { main as experimentalCli } from '../../scripts/evaluate-in-season-experiment';
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
  EXPERIMENTAL_ROLE_GATED_CONFIGURATION,
  buildExperimentalInSeasonSourcePlan,
  classifyExperimentalPlayers,
  evaluateExperimentalInSeason,
  experimentalPathRequiredCapabilities,
  type ExperimentalInSeasonOptions,
} from './experimentalInSeason';
import { ROLE_REFERENCE_VERSION, roleReferenceChecksum, validateRoleReferences, type RoleReferenceContent } from './experimentalRoleReferences';
import { applyExperimentalRoleGate, type GatedPlayerDiagnostic } from './experimentalRoleGate';

const CLOCK = fixedClock(FETCHED_AT);

describe('v2 role gate through actual normalization, evidence, tier and inference', () => {
  const options: ExperimentalInSeasonOptions = { ...BASE_OPTIONS, asOf: '2025-12-31T00:00:00.000Z',
    configurationId: EXPERIMENTAL_ROLE_GATED_CONFIGURATION.id };
  const provenance = 'synthetic:integration-final-and-tenure';
  function bundle(players: readonly {canonicalId: string; position: 'QB' | 'RB' | 'WR' | 'TE'}[], weeks = 17, appearances = 3) {
    const content: RoleReferenceContent = {
      version: ROLE_REFERENCE_VERSION, id: 'role-integration-1', source: 'synthetic-isolated-test', createdAt: options.asOf,
      asOf: options.asOf, valuationSeasons: [2025], careerSeasons: [], coverageFrom: '2025-08-01T00:00:00.000Z', coverageThrough: options.asOf,
      sources: [{ id: provenance, capturedAt: options.asOf, checksum: 'a'.repeat(64) }],
      players: players.map((p) => ({ canonicalId: p.canonicalId, position: p.position, evidence: {
        coverage: Object.fromEntries(['mandatorySources', 'completion', 'playerObservations', 'membership'].map((k) => [k, { complete: true, provenance }])),
        memberships: [{ team: 'CIN', from: '2025-08-01T00:00:00.000Z', to: null, knownAt: '2025-08-01T00:00:00.000Z',
          trusted: true, provenance, continuityEvidence: 'synthetic fully attested tenure' }],
        opportunities: Array.from({length: weeks}, (_, i) => ({ id: gameId(i+1), team: 'CIN', seasonType: 'REG' as const,
          scheduledAt: kickoff(i+1), startedAt: kickoff(i+1), completedAt: new Date(Date.parse(kickoff(i+1))+10800000).toISOString(),
          knownAt: new Date(Date.parse(kickoff(i+1))+14400000).toISOString(), status: 'FINAL' as const,
          trusted: true, provenance, completionProof: 'synthetic explicit final status' })),
        observations: Array.from({length: appearances}, (_, i) => ({ id: `obs-${p.position}-${i+1}`, gameId: gameId(i+1), team:'CIN',
          observedAt: new Date(Date.parse(kickoff(i+1))+10800000).toISOString(), knownAt: new Date(Date.parse(kickoff(i+1))+14400000).toISOString(),
          trusted:true, provenance, roleFieldsComplete:true, officialStart: p.position === 'QB',
          carries: p.position === 'RB' ? 17 : 0, targets: {QB:0,RB:4,WR:9,TE:6}[p.position] })),
        attestations: [], availabilityAttestations: [],
      }})),
    };
    return { ...content, checksum: roleReferenceChecksum(content) };
  }
  function resign(raw: ReturnType<typeof bundle>) {
    const { checksum: _checksum, ...content } = raw;
    return {...content, checksum: roleReferenceChecksum(content)};
  }
  const staleRoutes = () => fourPositionRoutes({ games:3, schedule:17 });
  async function seed() {
    return evaluate(staleRoutes(), {...options, configurationId: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id});
  }
  it('holds the 3+14 defect in all positions without modifying historical inputs or baseline inference', async () => {
    const old = await seed(); const refs = bundle(old.players); const captured = JSON.stringify(refs);
    const result = await evaluate(staleRoutes(), {...options, roleReferences: refs});
    const players = result.players as GatedPlayerDiagnostic[];
    expect(old.experimentalEvaluationComplete).toBe(true);
    expect(result.sourcePlanComplete).toBe(true); expect(result.inferenceComplete).toBe(true);
    expect(result.experimentalEvaluationComplete).toBe(false);
    expect(result.roleGate?.referenceCoverageComplete).toBe(true);
    expect(result.roleGate?.eligiblePlayers).toEqual([]);
    expect(players.every((p) => p.terminalCategory === 'held_expired_role' && !p.numericallyEligible && !p.valued && p.outputChecksum === null && p.roleClaim === null)).toBe(true);
    expect(players.map((p) => p.baselineDiagnostic.outputChecksum)).toEqual(old.players.map((p) => p.outputChecksum));
    expect(players.map((p) => p.selectedTier)).toEqual(old.players.map((p) => p.selectedTier));
    expect(players.every((p) => p.roleEvidence?.opportunitiesWithoutSupport === 14)).toBe(true);
    expect(players.every((p) => p.roleEvidence?.historicalObservations.length === 3)).toBe(true);
    expect(JSON.stringify(refs)).toBe(captured);
    expect(JSON.stringify(result)).not.toMatch(/"(engineOutput|accessibleOutput|headlineValue|dynastyValue|rank|utility)"/);
    expect(result.configuration.productionPublicationAuthorized).toBe(false);
    expect(result.replayInputs.roleReferences?.checksum).toBe(refs.checksum);
    expect(result.versions.experimentalResultSchema).toBe('playerticker.experimental-evaluation/2');
    for (const position of positions) {
      expect(result.roleGate?.byPosition[position]).toMatchObject({ selected:1, held_expired_role:1, numerically_eligible:0 });
    }
  });
  it.each([1,2,3,4])('executes exact boundary gap %i without output-driven tier selection', async (gap) => {
    const old = await seed(); const refs = bundle(old.players,3+gap);
    const result = await evaluate(fourPositionRoutes({games:3,schedule:3+gap}), {...options, roleReferences:refs});
    for(const p of result.players as GatedPlayerDiagnostic[]) {
      expect(p.roleEvidence?.opportunitiesWithoutSupport).toBe(gap);
      expect(p.numericallyEligible).toBe(gap < (p.position === 'QB' ? 2 : 3));
      expect(p.selectedTier).toBe(p.position === 'QB' ? 'FULL' : 'ACCESSIBLE');
    }
  });
  it('separates source-wide invalid/missing references from missing player evidence and rejects altered checksums', async () => {
    const old=await seed(); const refs=bundle(old.players);
    const missing=await evaluate(staleRoutes(),options);
    expect(missing.roleGate?.referenceFailure).toBe('ROLE_REFERENCE_BUNDLE_MISSING');
    expect((missing.players as GatedPlayerDiagnostic[]).every(p=>p.terminalCategory==='blocked_reference_coverage')).toBe(true);
    refs.players.pop();
    const oneMissing=await evaluate(staleRoutes(),{...options,roleReferences:resign(refs)});
    expect((oneMissing.players as GatedPlayerDiagnostic[]).filter(p=>p.roleReason==='ROLE_PLAYER_REFERENCE_MISSING')).toHaveLength(1);
    const invalid=await evaluate(staleRoutes(),{...options,roleReferences:refs});
    expect(invalid.roleGate?.referenceFailure).toBe('ROLE_REFERENCE_CHECKSUM_MISMATCH');
    expect(invalid.roleGate?.eligiblePlayers).toEqual([]);
  });
  it('cross-checks known schedule coordinates and observed workload, not just completeness booleans', async () => {
    const old=await seed(); const refs=bundle(old.players);
    refs.players[0]!.evidence.opportunities.pop();
    const gap=await evaluate(staleRoutes(),{...options,roleReferences:resign(refs)});
    expect((gap.players as GatedPlayerDiagnostic[])[0]!.roleReason).toBe('ROLE_REFERENCE_SCHEDULE_GAP');
    const mismatch=bundle(old.players);
    const wr=mismatch.players.find(p=>p.position==='WR')!; wr.evidence.observations[0]!.targets=99;
    const result=await evaluate(staleRoutes(),{...options,roleReferences:resign(mismatch)});
    expect((result.players as GatedPlayerDiagnostic[]).find(p=>p.position==='WR')?.roleReason).toBe('ROLE_REFERENCE_OBSERVATION_MISMATCH');
  });
  it('cannot omit old-team historical model observations to defeat the sticky numerical hold', async () => {
    const old=await seed(); const refs=bundle(old.players,4);
    const historicalId='2025_OLD_BUF'; const historicalAt='2025-07-01T17:00:00.000Z';
    const priorGames=gameRows(1).map(g=>({...g,game_id:historicalId,kickoff:historicalAt,team:'BUF'}));
    const routes={...fourPositionRoutes({games:3,schedule:4}),[URLS.nflverseGames]:csv([...priorGames,...gameRows(3)]),
      [URLS.nflverseSchedule]:csv([{...scheduleRows(1)[0]!,game_id:historicalId,kickoff:historicalAt,home_team:'BUF'},...scheduleRows(4)])};
    const missing=await evaluate(routes,{...options,roleReferences:refs});
    expect((missing.players as GatedPlayerDiagnostic[]).every(p=>p.roleReason==='ROLE_REFERENCE_HISTORICAL_OBSERVATION_GAP' && !p.numericallyEligible)).toBe(true);
    for(const p of refs.players) p.evidence.observations.unshift({...p.evidence.observations[0]!,id:'prior-history',gameId:historicalId,team:'BUF',observedAt:historicalAt,knownAt:historicalAt});
    const retained=await evaluate(routes,{...options,roleReferences:resign(refs)});
    expect((retained.players as GatedPlayerDiagnostic[]).every(p=>p.roleEvidence?.currentRoleEvidence==='SUPPORTED_OBSERVED'
      && p.roleEvidence?.numericalRoleContext==='REQUIRES_POST_GAP_INPUT_POLICY' && !p.numericallyEligible)).toBe(true);
    expect(retained.roleGate?.referenceCoverageComplete).toBe(true);
    for(const p of refs.players) p.evidence.observations[0]!.observedAt=kickoff(1);
    const redated=await evaluate(routes,{...options,roleReferences:resign(refs)});
    expect((redated.players as GatedPlayerDiagnostic[]).every(p=>p.roleEvidence?.numericalRoleContext==='REQUIRES_POST_GAP_INPUT_POLICY' && !p.numericallyEligible)).toBe(true);
  });
  it('cannot relabel the fourteen missed opportunities to the opponent to fabricate support', async () => {
    const old=await seed(); const refs=bundle(old.players);
    for (const p of refs.players) for (const g of p.evidence.opportunities.slice(3)) g.team='CLE';
    const result=await evaluate(staleRoutes(),{...options,roleReferences:resign(refs)});
    expect((result.players as GatedPlayerDiagnostic[]).every(p=>p.terminalCategory==='blocked_reference_coverage'
      && p.roleReason==='ROLE_REFERENCE_SCHEDULE_GAP' && !p.numericallyEligible)).toBe(true);
    expect(result.roleGate?.eligiblePlayers).toEqual([]);
  });
  it('never reports run reference coverage complete when a player coverage key is false, even for unsupported claims', async () => {
    const old=await seed(); const refs=bundle(old.players);
    refs.players[0]!.evidence.coverage.membership!.complete=false;
    const validation=validateRoleReferences(resign(refs),options);
    const result=applyExperimentalRoleGate([{...old.players[0]!,roleClaim:'UNESTABLISHED'}],validation,true,options.asOf,null);
    expect(result.players[0]!.terminalCategory).toBe('blocked_reference_coverage');
    expect(result.referenceCoverageComplete).toBe(false);
  });
  it('retains optional Sleeper semantics and holds mandatory source failure separately', async () => {
    const old=await seed(); const refs=bundle(old.players);
    const result=await evaluate({...staleRoutes(), [URLS.sleeperIdentity]:{status:500,body:'failed'}},
      {...options,includeSleeper:true,roleReferences:refs});
    expect(result.sourcePlanComplete).toBe(true);
    expect(result.sources.find(s=>s.provider==='sleeper')?.required).toBe(false);
    const failed=await evaluate({...staleRoutes(),[URLS.nflverseRoster]:{status:500,body:'failed'}},{...options,roleReferences:refs});
    expect(failed.sourcePlanComplete).toBe(false); expect(failed.experimentalEvaluationComplete).toBe(false);
    expect((failed.players as GatedPlayerDiagnostic[]).every(p=>p.terminalCategory==='blocked_source_coverage')).toBe(true);
  });
  it('keeps availability separate and does not treat IR or a future positive attestation as current role support', async () => {
    const old=await seed(); const refs=bundle(old.players);
    for (const p of refs.players) {
      p.evidence.availabilityAttestations.push({id:'ir',status:'IR',effectiveAt: kickoff(4),knownAt:kickoff(4),validThrough:options.asOf,trusted:true,provenance});
      p.evidence.attestations.push({id:'future',team:'CIN',claim:old.players.find(x=>x.canonicalId===p.canonicalId)!.roleClaim!,verdict:'AFFIRM',
        effectiveAt:'2026-01-01T00:00:00.000Z',knownAt:'2026-01-01T00:00:00.000Z',trusted:true,provenance,authority:'TEAM_OFFICIAL'});
    }
    const result=await evaluate(staleRoutes(),{...options,roleReferences:resign(refs)});
    expect((result.players as GatedPlayerDiagnostic[]).every(p=>p.roleEvidence?.availability==='IR' && p.terminalCategory==='held_expired_role')).toBe(true);
    expect((result.players as GatedPlayerDiagnostic[]).every(p=>p.roleEvidence?.futureAttestationsExcluded?.includes('future'))).toBe(true);
  });
  it.each([1,2])('meaningful %i-game return restores only reviewed qualitative support; numerical hold remains sticky', async (returns) => {
    const old=await seed(); const refs=bundle(old.players,18,18);
    const keep=(week:number)=>week<=3 || week>18-returns;
    for(const p of refs.players) p.evidence.observations=p.evidence.observations.filter(o=>keep(Number(o.gameId.split('_')[1])));
    const schedule=scheduleRows(18).map(g=>({...g,home_qb_id:keep(g.week)?'00-QB4':'00-OTHER-QB'}));
    const games=gameRows(18).filter(g=>keep(Number(String(g.game_id).split('_')[1])));
    const result=await evaluate({...staleRoutes(),[URLS.nflverseGames]:csv(games),[URLS.nflverseSchedule]:csv(schedule)}, {...options,roleReferences:resign(refs)});
    for(const p of result.players as GatedPlayerDiagnostic[]) {
      expect(p.roleEvidence?.currentRoleEvidence).toBe(p.position==='QB'||returns===2?'SUPPORTED_OBSERVED':'UNKNOWN_EXPIRED_OR_UNESTABLISHED');
      expect(p.roleEvidence?.numericalRoleContext).toBe('REQUIRES_POST_GAP_INPUT_POLICY');
      expect(p.numericallyEligible).toBe(false); expect(p.outputChecksum).toBeNull();
    }
    expect(result.roleGate?.eligiblePlayers).toEqual([]);
  });
  it('does not renew claims from a cameo and does not carry an old-team claim after a trade', async () => {
    const old=await seed(); const refs=bundle(old.players,17,17);
    for(const p of refs.players) {
      p.evidence.observations=p.evidence.observations.filter(o=>Number(o.gameId.split('_')[1])<=3 || o.gameId===gameId(17));
      Object.assign(p.evidence.observations[3]!,{officialStart:false,carries:1,targets:1});
    }
    const games=gameRows(17).filter(g=>Number(String(g.game_id).split('_')[1])<=3 || g.game_id===gameId(17))
      .map(g=>g.game_id===gameId(17)?{...g,carries:1,targets:1}:g);
    const cameo=await evaluate({...staleRoutes(),[URLS.nflverseGames]:csv(games)}, {...options,roleReferences:resign(refs)});
    expect((cameo.players as GatedPlayerDiagnostic[]).every(p=>p.terminalCategory==='held_expired_role')).toBe(true);
    const traded=bundle(old.players);
    for(const p of traded.players) {
      const oldTenure=p.evidence.memberships[0]!; oldTenure.to=kickoff(4);
      p.evidence.memberships.push({...oldTenure,team:'BUF',from:kickoff(4),to:null,knownAt:kickoff(4)});
    }
    const trade=await evaluate(staleRoutes(),{...options,roleReferences:resign(traded)});
    expect((trade.players as GatedPlayerDiagnostic[]).every(p=>p.terminalCategory==='held_unknown_role' && p.roleEvidence?.team==='BUF')).toBe(true);
    expect((trade.players as GatedPlayerDiagnostic[]).map(p=>p.baselineDiagnostic.outputChecksum)).toEqual(old.players.map(p=>p.outputChecksum));
  });
  it('keeps inference failures, malformed/missing, genuine INSUFFICIENT, role hold and unsupported paths distinct', async () => {
    const old=await seed(); const refs=validateRoleReferences(bundle(old.players),options);
    const variants = old.players.map((p,i)=>({...p,inferenceStatus: (['legitimate_insufficient','failed_inference','missing_inference','malformed_null_result'] as const)[i]!}));
    const gated=applyExperimentalRoleGate(variants,refs,true,options.asOf,null);
    expect(gated.players.map(p=>p.terminalCategory)).toEqual(['legitimate_insufficient','failed_inference','failed_inference','failed_inference']);
    expect(gated.players.map(p=>p.baselineDiagnostic.inferenceStatus)).toEqual(variants.map(p=>p.inferenceStatus));
    expect(gated.eligiblePlayers).toEqual([]);
    const source=applyExperimentalRoleGate(variants,refs,false,options.asOf,null);
    expect(source.players.every(p=>p.terminalCategory==='blocked_source_coverage')).toBe(true);
    const unsupported=applyExperimentalRoleGate([{...old.players[0]!,inferenceStatus:'unsupported_model_path'}],refs,true,options.asOf,null);
    expect(unsupported.players[0]?.terminalCategory).toBe('unsupported_model_path');
  });
  it('replays identically with a different wall clock and does not change v1 meaning', async () => {
    const old=await seed(); const store=new MemoryPayloadStore(); const refs=bundle(old.players);
    const live=await evaluate(staleRoutes(),{...options,roleReferences:refs},store);
    const replayOptions={...options,mode:'replay' as const,roleReferences:refs};
    const noNetwork=new HttpClient({fetchFn:()=>{throw new Error('network forbidden');}});
    const a=await evaluateExperimentalInSeason(replayOptions,{payloadStore:store,client:noNetwork,clock:fixedClock('2028-01-01T00:00:00.000Z')});
    const b=await evaluateExperimentalInSeason(replayOptions,{payloadStore:store,client:noNetwork,clock:fixedClock('2030-01-01T00:00:00.000Z')});
    expect(a).toEqual(b); expect(a.players).toEqual(live.players);
    const v1=await evaluateExperimentalInSeason({...options,configurationId:EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,mode:'replay'},
      {payloadStore:store,client:noNetwork,clock:CLOCK});
    expect(v1.roleGate).toBeUndefined(); expect(v1.configuration.version).toBe(1);
    expect(v1.players).toEqual(old.players); expect(v1.experimentalEvaluationComplete).toBe(true);
    expect(()=>buildExperimentalInSeasonSourcePlan({...BASE_OPTIONS,roleReferences:refs})).toThrow(/v1 semantics/);
  });
  it('executes the actual CLI with a checksummed reference file and isolated captured replay', async () => {
    const dbPath=tempDbPath(); paths.push(dbPath); const dir=dirname(dbPath);
    const captures=join(dir,'captures'); const store=new FilePayloadStore(captures);
    const baseline=await evaluateExperimentalInSeason({...options,configurationId:EXPERIMENTAL_IN_SEASON_CONFIGURATION.id},
      {payloadStore:store,client:client(staleRoutes()),clock:CLOCK});
    const referencePath=join(dir,'references.json'); writeFileSync(referencePath,JSON.stringify(bundle(baseline.players)));
    const output=join(dir,'diagnostics'); const log=vi.spyOn(console,'log').mockImplementation(()=>{});
    try {
      const exitCode=await experimentalCli(['--config',options.configurationId,'--seasons','2025','--as-of',options.asOf,
        '--mode','replay','--no-sleeper','--captures',captures,'--role-references',referencePath,
        '--code-sha',options.codeIdentity.sha,'--code-tree',options.codeIdentity.tree,'--output-dir',output]);
      expect(exitCode).toBe(1);
      const result=JSON.parse(readFileSync(join(output,readdirSync(output)[0]!), 'utf8'));
      expect(result.roleGate.eligiblePlayers).toEqual([]);
      expect(result.players.every((p:GatedPlayerDiagnostic)=>p.terminalCategory==='held_expired_role')).toBe(true);
      expect(result.configuration.productionPublicationAuthorized).toBe(false);
    } finally {log.mockRestore();}
  });
  it('rejects canonical publication despite ignored gates and preserves seeded last-good bytes, identity, timestamp and pointer', async () => {
    const dbPath=tempDbPath(); paths.push(dbPath);
    const store=PersistenceStore.open(dbPath,()=> '2026-01-01T00:00:05.000Z');
    const production=createLivePipeline({store:()=>store,payloadStore:new MemoryPayloadStore(),seasons:[2025],asOf:()=>AS_OF,clock:CLOCK,client:client(defaultRoutes())});
    const context={runId:'role-seed',trigger:'manual' as const,attempt:1,startedAt:'2026-01-01T00:00:00.000Z'};
    try {
      const refreshed=await production.refresh(context); await production.persist(context,refreshed); await production.publish(context);
      const record=store.getCurrentPublicationRecord(); const bytes=JSON.stringify(store.getCurrentPublication()); const checksum=roleReferenceChecksum(bytes);
      const old=await seed(); const result=await evaluate(staleRoutes(),{...options,roleReferences:bundle(old.players)});
      expect(()=>store.publishBoard({runId:result.evaluationId})).toThrow(PersistenceError);
      expect(store.getCurrentPublicationRecord()).toEqual(record);
      expect(JSON.stringify(store.getCurrentPublication())).toBe(bytes);
      expect(roleReferenceChecksum(JSON.stringify(store.getCurrentPublication()))).toBe(checksum);
    } finally {store.close();}
  });
});
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
