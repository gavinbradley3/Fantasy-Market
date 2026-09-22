import { z } from 'zod';

export const CONTROLLED_BETA_CONFIGURATION = 'playerticker.controlled-beta/v1' as const;
const count = z.number().int().nonnegative();
const terminals=['legitimate_insufficient','held_expired_role','held_unknown_role','blocked_reference_coverage','blocked_source_coverage','failed_inference','unsupported_model_path'] as const;
const historical = z.object({ games: count, fromSeason: z.number().int().nullable(), throughSeason: z.number().int().nullable(), passingYards: z.number().finite().nullable(), rushingYards: z.number().finite().nullable(), receivingYards: z.number().finite().nullable(), targets: count.nullable() }).strict();
export const betaPlayerSchema = z.object({
  id: z.string().min(1), canonicalId: z.string().nullable(), name: z.string(), position: z.enum(['QB','RB','WR','TE']),
  team: z.string().nullable(), rosterStatus: z.string().nullable(), rosterWeek: z.number().int().nullable(),
  selected: z.boolean(), terminalCategory: z.enum(['not_selected',...terminals]), baselineTier: z.enum(['FULL','ACCESSIBLE','INSUFFICIENT']).nullable(),
  baselineOutcome: z.string().nullable(), reasons: z.array(z.string()), historical,
  // This preview deliberately cannot transport a diagnostic model number as a valuation.
  numericallyEligible: z.literal(false), dynastyValue: z.null(), dynastyOverallRank: z.null(), dynastyPositionRank: z.null(),
}).strict();
export const controlledBetaSchema = z.object({
  configurationId: z.literal(CONTROLLED_BETA_CONFIGURATION), artifactId: z.string(),
  codeIdentity: z.object({sha:z.string().regex(/^[a-f0-9]{40}$/),tree:z.string().regex(/^[a-f0-9]{40}$/)}).strict(),
  modelAsOf: z.string().datetime(), evidenceObservedAt: z.string().datetime(), generatedAt: z.string().datetime(),
  publication: z.null(), productionPublicationAuthorized: z.literal(false), leagueSchemaId: z.literal('dynasty-superflex-12'),
  sourceConfigurationId: z.string(), rolePolicyId: z.string(), aggregationPolicyId: z.string(), referenceLedgerVersion: z.string(),
  sourcePlanComplete: z.boolean(), inferenceComplete: z.boolean(), referenceCoverageComplete: z.literal(false),
  completedWeeks: z.array(z.number().int()), partialWeeks: z.array(z.number().int()), finalGames: count,
  captureChecksums: z.array(z.string()), referenceChecksum: z.string(),
  coverage: z.record(z.record(count)), exclusions: z.record(z.record(count)),
  limitations: z.array(z.string()), players: z.array(betaPlayerSchema),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.players.map(p=>p.id)).size!==v.players.length)ctx.addIssue({code:'custom',message:'duplicate player identity'});
  const selected=v.players.filter(p=>p.selected);
  if(selected.some(p=>p.canonicalId===null||p.terminalCategory==='not_selected')||v.players.some(p=>!p.selected&&p.terminalCategory!=='not_selected')||new Set(selected.map(p=>p.canonicalId)).size!==selected.length)ctx.addIssue({code:'custom',message:'selected identities and terminal states do not reconcile'});
  for(const position of ['QB','RB','WR','TE']){
    const actual=v.players.filter(p=>p.selected&&p.position===position).length;
    const counts=v.coverage[position];
    if(!counts||counts.selected!==actual||Object.entries(counts).filter(([k])=>k!=='selected').reduce((s,[,n])=>s+n,0)!==actual)ctx.addIssue({code:'custom',message:'selected coverage does not reconcile'});
    if(counts&&((counts.numerically_eligible??0)!==0||terminals.some(category=>(counts[category]??0)!==selected.filter(p=>p.position===position&&p.terminalCategory===category).length)))ctx.addIssue({code:'custom',message:'terminal category counts do not match player outcomes'});
  }
});
export type ControlledBetaArtifact = z.infer<typeof controlledBetaSchema>;
export type BetaPlayer = z.infer<typeof betaPlayerSchema>;

export function betaReason(category:string):string {
  const reasons:Record<string,string>={
    blocked_reference_coverage:'Value withheld: current-role reference evidence is incomplete.',
    blocked_source_coverage:'Evaluation unavailable: a required source did not complete.',
    failed_inference:'Evaluation unavailable: the model did not return a valid result.',
    unsupported_model_path:'This model path is not supported by the controlled beta.',
    legitimate_insufficient:'The model does not have enough qualifying evidence to produce a value.',
    held_expired_role:'Value withheld: older usage no longer supports the current-role assumption.',
    held_unknown_role:'Value withheld: the current-role assumption cannot be established.',
    not_selected:'Not evaluated: no qualifying current-season appearance or unresolved identity.',
  };
  return reasons[category]??'Value unavailable pending evidence review.';
}

/** Codes stay in the replay artifact; readers get the reason in ordinary language. */
export function betaEvidenceReason(code:string):string {
  const labels:Record<string,string>={
    ROLE_REFERENCE_HISTORICAL_OBSERVATION_GAP:'Historical game observations are preserved, but their role-reference mapping is incomplete.',
    ROLE_REFERENCE_REQUIRED_COVERAGE_MISSING:'The evidence does not establish the required game completion or team-membership coverage.',
    ROLE_PLAYER_REFERENCE_MISSING:'No validated current-role reference is available for this player.',
    ROLE_REFERENCE_SCHEDULE_GAP:'At least one relevant team game is missing from the current-role reference.',
    AGGREGATION_REFERENCE_GAP:'One or more model inputs lack complete observations for their window. Missing observations are not treated as zero.',
    attached_veteran_no_current_game:'The roster source lists an attached veteran with historical production, but the existing selector requires a current-season appearance.',
    rookie_no_professional_production:'The roster source lists a rookie without recorded professional production. No new rookie admission policy has been applied.',
    reserve_injury_no_current_game:'A dated roster record lists a reserve or injury-related status; no current-season game qualifies for selection. This is not a current injury diagnosis.',
    suspended_no_current_game:'A dated roster record lists suspension; no current-season game qualifies for selection.',
    explicit_retired_or_cut:'The source explicitly recorded a cut or retired status at the roster observation. Current availability is not independently established.',
    identity_unresolved:'This roster record could not be linked to a canonical model identity.',
    identity_position_not_modelled:'The canonical identity and roster do not establish the same supported model position.',
    conflicting_latest_roster:'The latest roster observations conflict; team or status is not guessed.',
    team_no_confirmed_completion:'No relevant completed game is confirmed for the observed team.',
    other_no_current_game:'No qualifying current-season appearance was found. The reason for absence is unknown.',
    NO_ROSTER_OBSERVATION:'No matching roster observation was available.',
  };
  return labels[code]??'Validated current-role evidence is incomplete. Detailed reason codes are retained in the local audit artifact.';
}
