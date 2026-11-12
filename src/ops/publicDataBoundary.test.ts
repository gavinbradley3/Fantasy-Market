// External market data cannot reach a public surface: not the deployed site, not a public branch.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertPublicData } from '../../scripts/assert-public-data';
import { EXTERNAL_MARKET_ENABLED, PUBLIC_DATA_FILES } from '@/config/release';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

describe('release configuration', () => {
  it('keeps external market data disabled and the public data set to board and status only', () => {
    expect(EXTERNAL_MARKET_ENABLED).toBe(false);
    expect([...PUBLIC_DATA_FILES]).toEqual(['board.json', 'status.json']);
  });
});

describe('workflows', () => {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'));

  it('only the gated market workflow stages market files for commit', () => {
    for (const f of files) {
      const text = readFileSync(join(WORKFLOWS, f), 'utf8');
      const stagesMarket = /git add[^\n]*market-(latest|history)/.test(text);
      if (f === 'refresh-market.yml') {
        expect(text).toContain('Refuse while external market data is disabled');
        // The refusal must come before anything is fetched or committed.
        expect(text.indexOf('Refuse while external market data is disabled')).toBeLessThan(text.indexOf('git add'));
      } else {
        expect(stagesMarket, `${f} stages market data`).toBe(false);
      }
    }
  });

  it('the deploy job asserts public data before uploading the Pages artifact', () => {
    const deploy = readFileSync(join(WORKFLOWS, 'deploy.yml'), 'utf8');
    expect(deploy.indexOf('assert:public-data')).toBeGreaterThan(0);
    expect(deploy.indexOf('assert:public-data')).toBeLessThan(deploy.indexOf('upload-pages-artifact'));
  });
});

describe('assert-public-data', () => {
  const site = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'pt-public-'));
    mkdirSync(join(root, 'data'));
    mkdirSync(join(root, 'assets'));
    for (const [path, body] of Object.entries(files)) writeFileSync(join(root, path), body);
    return root;
  };
  const board = JSON.stringify({ publication: {}, entries: [{ canonicalId: 'a', confidenceScore: null }] });

  it('passes a site with only the board and status', () => {
    expect(assertPublicData(site({ 'data/board.json': board, 'data/status.json': '{}', 'assets/app.js': 'x' }))).toEqual([]);
  });

  it('fails on an extra data file', () => {
    expect(assertPublicData(site({ 'data/board.json': board, 'data/market-latest.json': '{}' }))).toContain('unapproved data file: data/market-latest.json');
  });

  it('fails on a vendor marker anywhere in the build', () => {
    const problems = assertPublicData(site({ 'data/board.json': board, 'assets/app.js': 'fetch("x").then(q => q.value_2qb)' }));
    expect(problems.some((p) => p.includes('value_2qb'))).toBe(true);
  });

  it('fails on an unredacted confidence field', () => {
    const leaky = JSON.stringify({ publication: {}, entries: [{ canonicalId: 'a', confidenceScore: 79 }] });
    expect(assertPublicData(site({ 'data/board.json': leaky }))).toContain('board.json: 1 entries still carry confidenceScore');
  });
});
