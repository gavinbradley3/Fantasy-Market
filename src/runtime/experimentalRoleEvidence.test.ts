import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fixtures from './__fixtures/roleEvidenceReviewed.json';
import { assessExperimentalRoleEvidence, supportsClaim } from './experimentalRoleEvidence';
import { roleReferenceChecksum, validateRoleReferences, ROLE_REFERENCE_VERSION, type RoleInput } from './experimentalRoleReferences';

describe('reviewed role contract faithful port', () => {
  it('pins the independently reviewed 85-case fixture identity', () => {
    expect(fixtures).toHaveLength(85);
    expect(createHash('sha256').update(JSON.stringify(fixtures)).digest('hex')).toBe('3c166541e53680728c5102f7b468cb0dc58bbf64e2bc639dd5bca1592d09a62a');
  });
  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, raw) => {
    const input = raw as unknown as RoleInput;
    const before = JSON.stringify(input);
    const result = assessExperimentalRoleEvidence(input);
    expect(result.currentRoleEvidence).toBe(raw.expected.state);
    expect(result.downstream).toBe(raw.expected.downstream);
    for (const key of ['availability', 'completedOpportunities', 'team'] as const) {
      if (key in raw.expected) expect(result[key]).toBe((raw.expected as Record<string, unknown>)[key]);
    }
    expect(result.historicalObservations).toEqual(input.observations.filter((o) => Date.parse(o.knownAt) <= Date.parse(input.asOf) && Date.parse(o.observedAt) <= Date.parse(input.asOf)));
    expect(JSON.stringify(input)).toBe(before);
    expect(assessExperimentalRoleEvidence(input)).toEqual(result);
    const reversed = assessExperimentalRoleEvidence({ ...input, observations: [...input.observations].reverse(), opportunities: [...input.opportunities].reverse(), attestations: [...input.attestations].reverse() });
    expect({ ...reversed, historicalObservations: result.historicalObservations }).toEqual(result);
    expect(result.productionPublicationAuthorized).toBe(false);
  });
  it.each([
    ['RB', 'Three-down lead back', { carries: 15, targets: 3 }, { carries: 15, targets: 2 }],
    ['RB', 'Lead rusher', { carries: 15 }, { carries: 14 }],
    ['WR', 'Alpha target earner', { targets: 9 }, { targets: 8 }],
    ['TE', 'Primary receiving option', { targets: 6 }, { targets: 5 }],
  ] as const)('corroboration threshold %s %s', (p, claim, good, bad) => {
    const obs = fixtures[0]!.observations[0]!;
    expect(supportsClaim(p, claim, { ...obs, ...good })).toBe(true);
    expect(supportsClaim(p, claim, { ...obs, ...bad })).toBe(false);
  });
});

export function referenceBundle(input = fixtures.find((f) => f.id === 'boundary-QB-1')! as unknown as RoleInput) {
  const { coverage, memberships, opportunities, observations, attestations, availabilityAttestations } = input;
  const content = {
    version: ROLE_REFERENCE_VERSION, id: 'synthetic-role-reference-1', source: 'synthetic-fixtures',
    createdAt: input.asOf, asOf: input.asOf, valuationSeasons: [2026], careerSeasons: [],
    coverageFrom: '2026-08-01T00:00:00.000Z', coverageThrough: input.asOf,
    sources: [{ id: 'synthetic:role-contract-v1', capturedAt: input.asOf, checksum: 'a'.repeat(64) }],
    players: [{ canonicalId: 'p', position: input.position, evidence: { coverage, memberships, opportunities, observations, attestations, availabilityAttestations } }],
  };
  return { ...structuredClone(content), checksum: roleReferenceChecksum(content) };
}
describe('reference boundary', () => {
  const options = { asOf: referenceBundle().asOf, valuationSeasons: [2026], careerSeasons: [] };
  it('requires evidence, identity, checksum and exact replay scope; never trusts a role-current flag', () => {
    const valid = referenceBundle();
    expect(validateRoleReferences(valid, options).complete).toBe(true);
    expect(validateRoleReferences(undefined, options).reason).toBe('ROLE_REFERENCE_BUNDLE_MISSING');
    expect(validateRoleReferences({ roleCurrent: true }, options).reason).toBe('ROLE_REFERENCE_SCHEMA_INVALID');
    expect(validateRoleReferences({ ...valid, checksum: 'b'.repeat(64) }, options).reason).toBe('ROLE_REFERENCE_CHECKSUM_MISMATCH');
    expect(validateRoleReferences(valid, { ...options, asOf: '2026-12-31T00:00:00.000Z' }).reason).toBe('ROLE_REFERENCE_REPLAY_SCOPE_MISMATCH');
    expect(validateRoleReferences(valid, { ...options, careerSeasons: [2025] }).complete).toBe(false);
  });
  it('does not mutate captured historical observations and rejects unscoped provenance', () => {
    const bundle = referenceBundle(); const before = JSON.stringify(bundle);
    validateRoleReferences(bundle, options);
    expect(JSON.stringify(bundle)).toBe(before);
    bundle.players[0]!.evidence.memberships[0]!.provenance = 'unlisted';
    const { checksum: _checksum, ...content } = bundle;
    bundle.checksum = roleReferenceChecksum(content);
    expect(validateRoleReferences(bundle, options).reason).toBe('ROLE_REFERENCE_UNRESOLVED_PROVENANCE');
  });
  it('will not derive a valid tenure, final game or availability from an ACTIVE default', () => {
    const bundle = referenceBundle();
    bundle.players[0]!.evidence.memberships[0]!.continuityEvidence = '';
    expect(validateRoleReferences(bundle, options).complete).toBe(false);
    const final = referenceBundle(); final.players[0]!.evidence.opportunities[0]!.startedAt = null;
    const { checksum: _checksum, ...content } = final; final.checksum = roleReferenceChecksum(content);
    expect(validateRoleReferences(final, options).reason).toBe('ROLE_REFERENCE_FINAL_TIMING_INVALID');
  });
  it('does not accept a completeness boolean over missing observed role columns', () => {
    const input = structuredClone(fixtures.find((f) => f.id === 'boundary-QB-1')!) as unknown as RoleInput;
    input.observations[0]!.officialStart = null;
    expect(assessExperimentalRoleEvidence(input).currentRoleEvidence).toBe('UNKNOWN_PLAYER_OBSERVATIONS');
  });
  it('requires only carries to corroborate Lead rusher, not unrelated receiving fields', () => {
    const input=structuredClone(fixtures.find(f=>f.id==='boundary-RB-2')!) as unknown as RoleInput;
    input.claim='Lead rusher'; for(const o of input.observations) o.targets=null;
    expect(assessExperimentalRoleEvidence(input).currentRoleEvidence).toBe('SUPPORTED_OBSERVED');
    input.claim='Three-down lead back';
    expect(assessExperimentalRoleEvidence(input).currentRoleEvidence).toBe('UNKNOWN_PLAYER_OBSERVATIONS');
  });
});
