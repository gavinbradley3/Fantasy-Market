import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NormalizedSnapshot } from '@/ingestion';
import { assertUnchangedBetaSelection, betaAuditUniverse, isolatedBetaOutput, verifyBetaInputSeal } from '../../scripts/build-controlled-beta';
import type { applyExperimentalRoleGate } from './experimentalRoleGate';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const emptyGate = () => ({ players: [] }) as unknown as ReturnType<typeof applyExperimentalRoleGate>;

describe('controlled-beta replay artifact boundary', () => {
  it('rejects checkout and symlink-routed serving writes and requires a fresh output directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'beta-build-boundary-')); roots.push(root);
    const repo = join(root, 'repo'); mkdirSync(repo);
    const out = join(root, 'outputs'); mkdirSync(out);
    const alias = join(root, 'alias'); symlinkSync(repo, alias);
    expect(() => isolatedBetaOutput(join(repo, 'new-output'), repo)).toThrow('BETA_OUTPUT_MUST_BE_EXTERNAL_AND_NON_SERVING');
    expect(() => isolatedBetaOutput(join(alias, 'new-output'), repo)).toThrow('BETA_OUTPUT_MUST_BE_EXTERNAL_AND_NON_SERVING');
    expect(() => isolatedBetaOutput(join(out, 'site-data', 'next'), repo)).toThrow('BETA_OUTPUT_MUST_BE_EXTERNAL_AND_NON_SERVING');
    expect(() => isolatedBetaOutput(out, repo)).toThrow('BETA_OUTPUT_MUST_BE_A_NEW_DIRECTORY');
    expect(isolatedBetaOutput(join(out, 'new-run'), repo)).toBe(join(realpathSync(out), 'new-run'));
  });

  it('requires all frozen input identities and rejects changed capture-manifest bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'beta-input-seal-')); roots.push(root);
    const names = ['frozen-manifest.json', 'envelope-identities.json', 'selected-before-inference.json', 'role-references.json'];
    const files = names.map((name) => { writeFileSync(join(root, name), '{}'); return { name, sha256: createHash('sha256').update('{}').digest('hex') }; });
    const writeSeal = (sealFiles: typeof files) => writeFileSync(join(root, 'freeze-seal.json'), JSON.stringify({ asOf: '2026-09-22T03:00:00Z', files: sealFiles }));
    writeSeal(files);
    expect(verifyBetaInputSeal(root).files).toHaveLength(4);
    writeFileSync(join(root, names[0]), '{"changed":true}');
    expect(() => verifyBetaInputSeal(root)).toThrow('BETA_FROZEN_INPUT_CHECKSUM_MISMATCH');
    writeSeal(files.slice(1));
    expect(() => verifyBetaInputSeal(root)).toThrow('BETA_FROZEN_INPUT_MANIFEST_INCOMPLETE');
  });

  it('rejects post-result population reductions, position changes and duplicate selected identities', () => {
    const before = [{ canonicalId: 'a', position: 'QB' }, { canonicalId: 'b', position: 'RB' }];
    expect(() => assertUnchangedBetaSelection(before, before)).not.toThrow();
    expect(() => assertUnchangedBetaSelection(before.slice(0, 1), before)).toThrow('BETA_UNAUTHORIZED_SELECTION_DRIFT');
    expect(() => assertUnchangedBetaSelection([before[0], { ...before[1], position: 'TE' }], before)).toThrow('BETA_UNAUTHORIZED_SELECTION_DRIFT');
    expect(() => assertUnchangedBetaSelection([before[0], before[0]], before)).toThrow('BETA_UNAUTHORIZED_SELECTION_DRIFT');
  });

  it('keeps census presence separate from selection and never turns missing historical fields into zero', () => {
    const snapshot = { players: [{ canonicalId: 'p', nameNormalized: 'Player', position: 'WR', providerIds: { gsis: '00-1' } }],
      games: [{ canonicalId: 'p', season: 2025, seasonType: 'REG', kickoff: '2025-09-01T00:00:00Z', targets: 8,
        passAttempts: null, carries: null, passingYards: null, rushingYards: null, receivingYards: 90 }] } as unknown as NormalizedSnapshot;
    const roster = [{ gsis_id: '00-1', espn_id: '', full_name: 'Player', birth_date: '', team: 'BUF', position: 'WR',
      week: '2', status: 'ACT', status_description_abbr: 'A01', rookie_year: '2020', entry_year: '2020' }];
    const result = betaAuditUniverse(snapshot, roster, 2026, '2026-09-22T03:00:00Z', emptyGate(), new Set(['BUF']));
    expect(result.players).toHaveLength(1);
    expect(result.players[0]).toMatchObject({ selected: false, terminalCategory: 'not_selected',
      reasons: ['attached_veteran_no_current_game'], numericallyEligible: false, dynastyValue: null,
      historical: { games: 1, receivingYards: 90, rushingYards: null, passingYards: null } });
    expect(result.exclusions.WR).toEqual({ attached_veteran_no_current_game: 1 });
  });

  it('uses canonical selected position while preserving the raw audit position and gated reason', () => {
    const snapshot = { players: [{ canonicalId: 'p', nameNormalized: 'Player', position: 'RB', providerIds: { gsis: '00-1' } }], games: [] } as unknown as NormalizedSnapshot;
    const gate = { players: [{ canonicalId: 'p', position: 'RB', terminalCategory: 'blocked_reference_coverage',
      selectedTier: 'ACCESSIBLE', inferenceStatus: 'valued', roleReason: 'ROLE_REFERENCE_HISTORICAL_OBSERVATION_GAP' }] } as unknown as ReturnType<typeof applyExperimentalRoleGate>;
    const roster = [{ gsis_id: '00-1', full_name: 'Player', team: 'BUF', position: 'TE', week: '2', status: 'ACT' }];
    const result = betaAuditUniverse(snapshot, roster, 2026, '2026-09-22T03:00:00Z', gate, new Set(['BUF']));
    expect(result.players[0]).toMatchObject({ position: 'RB', selected: true, baselineTier: 'ACCESSIBLE',
      terminalCategory: 'blocked_reference_coverage', dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null });
    expect(result.audit[0]).toMatchObject({ rosterPosition: 'TE', displayPosition: 'RB' });
    expect(result.exclusions.RB).toEqual({});
    const future = { ...gate, players: gate.players.map((p) => ({ ...p, terminalCategory: 'numerically_eligible' as const })) };
    expect(() => betaAuditUniverse(snapshot, roster, 2026, '2026-09-22T03:00:00Z', future, new Set(['BUF']))).toThrow('BETA_VALUE_PROJECTION_NOT_AUTHORIZED');
  });
});
