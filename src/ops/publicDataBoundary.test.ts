import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoPublicMarketArtifacts, assertPublicDataDirectory } from './publicDataBoundary';

describe('public build market-artifact boundary', () => {
  it.each(['market-latest.json', 'market-history.jsonl', 'comparison.json', 'DynastyProcess.csv', 'FantasyPros.json'])(
    'rejects an accidentally staged %s without removing private history', (file) => {
      const directory = mkdtempSync(join(tmpdir(), 'pt-public-boundary-'));
      writeFileSync(join(directory, file), 'private retained bytes');
      expect(() => assertNoPublicMarketArtifacts(directory)).toThrow('excluded from this release');
      expect(readFileSync(join(directory, file), 'utf8')).toBe('private retained bytes');
    },
  );

  it('allowlists only board and status in the public data directory, including nested directories', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pt-public-boundary-'));
    const data = join(directory, 'data');
    mkdirSync(data);
    writeFileSync(join(data, 'board.json'), '{}');
    writeFileSync(join(data, 'status.json'), '{}');
    expect(() => assertNoPublicMarketArtifacts(directory)).not.toThrow();
    mkdirSync(join(data, 'archives'));
    expect(() => assertNoPublicMarketArtifacts(directory)).toThrow('non-release artifact: archives');
    expect(existsSync(join(data, 'board.json'))).toBe(true);
  });

  it('does not follow a symlink into a private capture store', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pt-public-boundary-'));
    const privateStore = mkdtempSync(join(tmpdir(), 'pt-private-'));
    writeFileSync(join(privateStore, 'source.csv'), 'private');
    symlinkSync(privateStore, join(directory, 'data'));
    expect(() => assertNoPublicMarketArtifacts(directory)).toThrow('cannot be a symlink');
    expect(readFileSync(join(privateStore, 'source.csv'), 'utf8')).toBe('private');
  });

  it('rejects a symlink named like an allowed serving document', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pt-public-boundary-'));
    symlinkSync('/not-a-real-private-path', join(directory, 'board.json'));
    expect(() => assertPublicDataDirectory(directory)).toThrow('non-release artifact: board.json');
  });
});
