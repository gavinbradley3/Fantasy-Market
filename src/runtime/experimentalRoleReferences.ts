// Explicit experimental reference boundary. Provenance is an auditable assertion, not
// automatic provider authentication. No normalized ACTIVE status supplies these records.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { stableStringify } from '@/inference/util/checksum';

const text = z.string().min(1).max(240).refine((s) => !/https?:\/\/|[\r\n]|Bearer |token=|signature=/i.test(s), 'use a non-secret source/record identifier, not a URL or payload');
const instant = z.string().datetime({ offset: true });
const position = z.enum(['QB', 'RB', 'WR', 'TE']);
const provenance = { provenance: text, trusted: z.boolean(), knownAt: instant };
const coverage = z.object({ complete: z.boolean(), provenance: text }).strict();
const count = z.number().finite().nonnegative().nullable().optional();
const observation = z.object({
  id: text, gameId: text, team: text, observedAt: instant, ...provenance,
  roleFieldsComplete: z.boolean(), specialTeamsOnly: z.boolean().optional(),
  officialStart: z.boolean().nullable().optional(), carries: count, targets: count,
  offensiveSnaps: count, receptions: count, receivingYards: count, receivingTouchdowns: count,
}).strict();
const opportunity = z.object({
  id: text, team: text, seasonType: z.enum(['REG', 'PRE', 'POST']),
  scheduledAt: instant, startedAt: instant.nullable(), completedAt: instant.nullable(),
  status: z.enum(['FINAL', 'BYE', 'POSTPONED', 'CANCELLED', 'SCHEDULED', 'IN_PROGRESS', 'ABANDONED', 'UNKNOWN']),
  completionProof: text.nullable(), ...provenance,
}).strict();
const membership = z.object({
  team: text.nullable(), from: instant, to: instant.nullable(), continuityEvidence: text, ...provenance,
}).strict().refine((m) => !m.to || Date.parse(m.to) > Date.parse(m.from), 'invalid tenure interval');
const attestation = z.object({
  id: text, team: text, claim: text, verdict: z.enum(['AFFIRM', 'WITHDRAW']),
  effectiveAt: instant, authority: text, ...provenance,
}).strict();
const availabilityAttestation = z.object({
  id: text, status: z.enum(['AVAILABLE', 'OUT', 'IR', 'PUP', 'NFI', 'SUSPENDED', 'HEALTHY_INACTIVE', 'UNKNOWN']),
  effectiveAt: instant, validThrough: instant, ...provenance,
}).strict();
const evidence = z.object({
  coverage: z.object({ mandatorySources: coverage.optional(), completion: coverage.optional(),
    playerObservations: coverage.optional(), membership: coverage.optional() }).strict(),
  memberships: z.array(membership), opportunities: z.array(opportunity), observations: z.array(observation),
  attestations: z.array(attestation), availabilityAttestations: z.array(availabilityAttestation),
}).strict();
export type RoleObservation = z.infer<typeof observation>;
export type RoleOpportunity = z.infer<typeof opportunity>;
export type RoleAttestation = z.infer<typeof attestation>;
export type RoleInput = z.infer<typeof evidence> & { asOf: string; position: z.infer<typeof position>; claim: string };
export type RoleState = 'SUPPORTED_OBSERVED' | 'SUPPORTED_ATTESTED' | 'UNKNOWN_UNSUPPORTED_CLAIM'
  | 'REFERENCE_INCOMPLETE' | 'UNKNOWN_MEMBERSHIP' | 'NO_CURRENT_TEAM_CLAIM'
  | 'UNKNOWN_PLAYER_OBSERVATIONS' | 'UNKNOWN_CONFLICT' | 'WITHDRAWN' | 'UNKNOWN_EXPIRED_OR_UNESTABLISHED';
export interface RoleDetail {
  reason?: string; team?: string; tenureFrom?: string; completedOpportunities?: number;
  opportunitiesWithoutSupport?: number; recoveryStreak?: number; lastSupportGame?: string | null;
  futureAttestationsExcluded?: string[]; numericalRoleContext?: string; attestationId?: string;
}
export interface RoleAssessment extends RoleDetail {
  contractId: string; asOf: string; position: RoleInput['position']; historicalClaim: string;
  currentRoleEvidence: RoleState; currentClaim: string | null; availability: string;
  historicalObservations: RoleObservation[]; historyRetained: boolean; historyView: string;
  downstream: 'EXISTING_PATH_CANDIDATE' | 'RUN_REFERENCE_INCOMPLETE' | 'HOLD_CURRENT_VALUE_ROLE_INPUT_CONTRACT_UNSUPPORTED';
  downstreamExecuted: boolean; productionPublicationAuthorized: false;
}

export const ROLE_REFERENCE_VERSION = 'playerticker.experimental.role-references/v1' as const;
const contentSchema = z.object({
  version: z.literal(ROLE_REFERENCE_VERSION), id: text, source: text, createdAt: instant,
  asOf: instant, valuationSeasons: z.array(z.number().int()).length(1), careerSeasons: z.array(z.number().int()),
  // These coordinates explicitly attest the span covered, not merely an HTTP success.
  coverageFrom: instant, coverageThrough: instant,
  sources: z.array(z.object({ id: text, capturedAt: instant, checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
  players: z.array(z.object({ canonicalId: text, position, evidence }).strict()),
}).strict();
export type RoleReferenceContent = z.infer<typeof contentSchema>;
export type RoleReferenceBundle = RoleReferenceContent & { checksum: string };
export function roleReferenceChecksum(content: unknown): string {
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}
export interface ValidatedRoleReferences {
  complete: boolean; reason: string | null; bundle: RoleReferenceBundle | null;
  identity: { id: string; version: string; checksum: string; source: string; createdAt: string } | null;
}
/** Malformed/global references never become per-player INSUFFICIENT. No raw input in errors. */
export function validateRoleReferences(raw: unknown, options: { asOf: string; valuationSeasons: readonly number[]; careerSeasons?: readonly number[] }): ValidatedRoleReferences {
  const fail = (reason: string): ValidatedRoleReferences => ({ complete: false, reason, bundle: null, identity: null });
  if (raw === undefined) return fail('ROLE_REFERENCE_BUNDLE_MISSING');
  const parsed = contentSchema.extend({ checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(raw);
  if (!parsed.success) return fail('ROLE_REFERENCE_SCHEMA_INVALID');
  const { checksum, ...content } = parsed.data;
  if (roleReferenceChecksum(content) !== checksum) return fail('ROLE_REFERENCE_CHECKSUM_MISMATCH');
  const sorted = (a: readonly number[]) => [...a].sort((x, y) => x - y).join(',');
  if (content.asOf !== options.asOf || sorted(content.valuationSeasons) !== sorted(options.valuationSeasons)
    || sorted(content.careerSeasons) !== sorted(options.careerSeasons ?? [])) return fail('ROLE_REFERENCE_REPLAY_SCOPE_MISMATCH');
  if (Date.parse(content.coverageThrough) !== Date.parse(options.asOf)
    || Date.parse(content.coverageFrom) > Date.parse(content.coverageThrough)) return fail('ROLE_REFERENCE_COVERAGE_INTERVAL_INVALID');
  if (new Set(content.players.map((p) => p.canonicalId)).size !== content.players.length
    || new Set(content.sources.map((s) => s.id)).size !== content.sources.length) return fail('ROLE_REFERENCE_DUPLICATE_IDENTITY');
  const sourceIds = new Set(content.sources.map((s) => s.id));
  for (const player of content.players) {
    const e = player.evidence;
    const records = [...e.memberships, ...e.opportunities, ...e.observations, ...e.attestations, ...e.availabilityAttestations];
    if (records.some((r) => !sourceIds.has(r.provenance)) || Object.values(e.coverage).some((c) => c && !sourceIds.has(c.provenance))) {
      return fail('ROLE_REFERENCE_UNRESOLVED_PROVENANCE');
    }
    if (e.memberships.some((m) => Date.parse(m.from) < Date.parse(content.coverageFrom))) return fail('ROLE_REFERENCE_TENURE_OUTSIDE_COVERAGE');
    if (e.opportunities.some((g) => g.status === 'FINAL' && (!g.startedAt || !g.completedAt
      || Date.parse(g.startedAt) > Date.parse(g.completedAt)))) return fail('ROLE_REFERENCE_FINAL_TIMING_INVALID');
  }
  // safeParse owns a deep clone; the caller's captured bytes and history stay untouched.
  return { complete: true, reason: null, bundle: { ...content, checksum }, identity: {
    id: content.id, version: content.version, checksum, source: content.source, createdAt: content.createdAt,
  } };
}
