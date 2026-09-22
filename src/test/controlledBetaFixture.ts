import { CONTROLLED_BETA_CONFIGURATION, controlledBetaSchema } from '@/contracts/controlledBeta';

export function controlledBetaFixture() {
  return controlledBetaSchema.parse({
    configurationId:CONTROLLED_BETA_CONFIGURATION,artifactId:'synthetic-boundary-only',codeIdentity:{sha:'a'.repeat(40),tree:'b'.repeat(40)},
    modelAsOf:'2026-09-22T03:00:00.000Z',evidenceObservedAt:'2026-09-22T03:00:00.000Z',generatedAt:'2026-09-22T04:00:00.000Z',
    publication:null,productionPublicationAuthorized:false,leagueSchemaId:'dynasty-superflex-12',
    sourceConfigurationId:'synthetic-source/v1',rolePolicyId:'synthetic-role/v1',aggregationPolicyId:'synthetic-aggregation/v1',referenceLedgerVersion:'synthetic-ledger/v1',
    sourcePlanComplete:true,inferenceComplete:true,referenceCoverageComplete:false,completedWeeks:[1],partialWeeks:[2],finalGames:31,
    captureChecksums:['c'.repeat(64)],referenceChecksum:'d'.repeat(64),coverage:{QB:{selected:1,blocked_reference_coverage:1},RB:{selected:0},WR:{selected:0},TE:{selected:0}},exclusions:{RB:{no_current_season_appearance:1}},
    limitations:['Reference continuity is missing. Historical observations remain intact.'],
    players:[
      {id:'p1',canonicalId:'synthetic-qb',name:'Historical Passer',position:'QB',team:'BUF',rosterStatus:'ACT',rosterWeek:2,selected:true,terminalCategory:'blocked_reference_coverage',baselineTier:'FULL',baselineOutcome:'valued',reasons:['ROLE_REFERENCE_HISTORICAL_OBSERVATION_GAP'],historical:{games:3,fromSeason:2025,throughSeason:2025,passingYards:900,rushingYards:30,receivingYards:null,targets:null},numericallyEligible:false,dynastyValue:null,dynastyOverallRank:null,dynastyPositionRank:null},
      {id:'p2',canonicalId:'synthetic-rb',name:'Reserve Runner',position:'RB',team:'BUF',rosterStatus:'RES',rosterWeek:2,selected:false,terminalCategory:'not_selected',baselineTier:null,baselineOutcome:null,reasons:['No current-season appearance; no admission policy change.'],historical:{games:15,fromSeason:2024,throughSeason:2025,passingYards:null,rushingYards:1500,receivingYards:500,targets:70},numericallyEligible:false,dynastyValue:null,dynastyOverallRank:null,dynastyPositionRank:null},
    ],
  });
}
