import {describe,it,expect} from 'vitest';
import {controlledBetaSchema} from './controlledBeta';
import {controlledBetaFixture} from '@/test/controlledBetaFixture';

describe('private beta artifact boundary',()=>{
  it.each(['dynastyValue','dynastyOverallRank','dynastyPositionRank'])('rejects held diagnostic %s rather than clearing it silently',field=>{
    const input=controlledBetaFixture();
    expect(()=>controlledBetaSchema.parse({...input,players:[{...input.players[0],[field]:67.1},input.players[1]]})).toThrow();
  });
  it.each(['engineOutput','accessibleOutput','positionValue','confidenceScore','currentRole'])('rejects diagnostic field %s',field=>{
    const input=controlledBetaFixture();
    expect(()=>controlledBetaSchema.parse({...input,players:[{...input.players[0],[field]:99},input.players[1]]})).toThrow();
  });
  it('rejects publication authorization and duplicate population identities',()=>{
    const input=controlledBetaFixture();
    expect(()=>controlledBetaSchema.parse({...input,productionPublicationAuthorized:true})).toThrow();
    expect(()=>controlledBetaSchema.parse({...input,publication:{id:'fake'}})).toThrow();
    expect(()=>controlledBetaSchema.parse({...input,players:[...input.players,input.players[1]]})).toThrow();
  });
  it('requires every selected player to have exactly one terminal category count',()=>{
    const input=controlledBetaFixture();
    expect(()=>controlledBetaSchema.parse({...input,coverage:{...input.coverage,QB:{selected:1,blocked_reference_coverage:1,legitimate_insufficient:1}}})).toThrow();
    expect(()=>controlledBetaSchema.parse({...input,coverage:{...input.coverage,QB:{selected:1,legitimate_insufficient:1}}})).toThrow();
    expect(()=>controlledBetaSchema.parse({...input,players:[{...input.players[0],terminalCategory:'numerically_eligible'},input.players[1]]})).toThrow();
  });
  it('retains historical production and absent observations on held/excluded players',()=>{
    const input=controlledBetaFixture(),parsed=controlledBetaSchema.parse(input);
    expect(parsed.players.map(p=>p.historical)).toEqual(input.players.map(p=>p.historical));
    expect(parsed.players[0].historical.targets).toBeNull();
    expect(parsed.players[1].historical.rushingYards).toBe(1500);
  });
});
