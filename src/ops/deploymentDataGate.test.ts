// Exercises the exact CLI used by deploy.yml, not a parallel test-only validator.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pt-deploy-gate-'));
}

function validBoard(modelTier: 'ACCESSIBLE' | 'INSUFFICIENT' = 'ACCESSIBLE'): Record<string, unknown> {
  return {
    publication: {
      publicationId: 'board-test', runId: 'run-test', snapshotId: 'snap-test', boardChecksum: 'checksum',
      entryCount: 1, publishedAt: '2026-09-12T00:00:00.000Z', supersededPublicationId: null,
    },
    entries: [{
      canonicalId: 'pt-test', position: 'WR', normalizedInputChecksum: 'input', outputChecksum: 'output',
      name: 'Test Player', team: null, age: null, playerStatus: 'active', asOf: '2026-02-10T00:00:00.000Z',
      outputStatus: modelTier === 'INSUFFICIENT' ? 'UNAVAILABLE' : 'OK', readiness: null,
      readinessMissingCount: null, honestyState: null, engineInvoked: modelTier !== 'INSUFFICIENT',
      publicConfidenceLabel: null, confidenceScore: null, confidenceLabel: null, volatilityScore: null,
      volatilityLabel: null, composites: null, limitations: [], modelTier,
    }],
  };
}

function run(source: string, destination: string) {
  return spawnSync('npx', ['tsx', 'scripts/prepare-site-data.ts', '--source', source, '--destination', destination], {
    encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: './tsconfig.app.json' },
  });
}

describe('PT-09 deployment data admission', () => {
  it.each([
    ['missing', undefined, 'required board is missing'],
    ['empty', '', 'required board.json is empty'],
    ['malformed', '{"publication":', 'required board.json is malformed JSON'],
    ['invalid structure', '{}', 'violates the publication contract'],
    ['no entries', JSON.stringify({ ...validBoard(), publication: { ...(validBoard().publication as object), entryCount: 0 }, entries: [] }), 'invalid entryCount'],
    ['entry-count mismatch', JSON.stringify({ ...validBoard(), publication: { ...(validBoard().publication as object), entryCount: 2 } }), 'entryCount mismatch'],
  ])('blocks %s board data before creating deployable output', (_name, body, diagnostic) => {
    const source = tempDir();
    const destination = tempDir();
    if (body !== undefined) writeFileSync(join(source, 'board.json'), body);

    const result = run(source, destination);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('deployment data gate rejected site-data');
    expect(result.stderr).toContain(diagnostic);
    expect(existsSync(join(destination, 'board.json'))).toBe(false);
  });

  it.each(['ACCESSIBLE', 'INSUFFICIENT'] as const)('admits a valid %s entry and preserves its content', (tier) => {
    const source = tempDir();
    const destination = tempDir();
    writeFileSync(join(source, 'board.json'), `${JSON.stringify(validBoard(tier), null, 2)}\n`);

    const result = run(source, destination);
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(join(destination, 'board.json'), 'utf8'))).toEqual(validBoard(tier));
  });

  it('redacts uncalibrated confidence, volatility and honesty fields from the deployed copy only', () => {
    const source = tempDir();
    const destination = tempDir();
    const board = validBoard();
    const entry = (board.entries as Record<string, unknown>[])[0];
    Object.assign(entry, {
      confidenceScore: 79, confidenceLabel: 'HIGH', publicConfidenceLabel: 'LOW',
      volatilityScore: 22.5, volatilityLabel: 'LOW', honestyState: 'LIMITED', dynastyValue: 74.7,
    });
    const original = JSON.stringify(board);
    writeFileSync(join(source, 'board.json'), original);

    const result = run(source, destination);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('6 uncalibrated values redacted');
    const deployed = JSON.parse(readFileSync(join(destination, 'board.json'), 'utf8'));
    const out = deployed.entries[0];
    for (const field of ['confidenceScore', 'confidenceLabel', 'publicConfidenceLabel', 'volatilityScore', 'volatilityLabel', 'honestyState']) {
      expect(out[field]).toBeNull();
    }
    // Valuation fields pass through unchanged, and the source artifact is not modified.
    expect(out.dynastyValue).toBe(74.7);
    expect(readFileSync(join(source, 'board.json'), 'utf8')).toBe(original);
  });

  it('never deploys external market data, and keeps status.json optional', () => {
    const source = tempDir();
    const destination = tempDir();
    writeFileSync(join(source, 'board.json'), JSON.stringify(validBoard()));
    writeFileSync(join(source, 'market-latest.json'), '{"quotes":[1]}\n');
    writeFileSync(join(source, 'market-history.jsonl'), '{}\n');

    const absent = run(source, destination);
    expect(absent.status).toBe(0);
    expect(absent.stderr).toContain('optional status.json is unavailable');
    expect(existsSync(join(destination, 'market-latest.json'))).toBe(false);
    expect(existsSync(join(destination, 'market-history.jsonl'))).toBe(false);

    writeFileSync(join(source, 'status.json'), '{"board":{}}\n');
    const present = run(source, destination);
    expect(present.status).toBe(0);
    expect(readFileSync(join(destination, 'status.json'), 'utf8')).toBe('{"board":{}}\n');
  });
});
