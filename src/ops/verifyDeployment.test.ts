import { describe, expect, it } from 'vitest';
import { verifyDeployment, type Fetcher } from '../../scripts/verify-deployment';

const BASE = 'https://example.github.io/Fantasy-Market/';
const SHELL = '<html><head><script type="module" src="/Fantasy-Market/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>';
const BOARD = JSON.stringify({ publication: {}, entries: [{ canonicalId: 'a', confidenceScore: null }] });

function site(overrides: Record<string, [number, string]> = {}): Fetcher {
  const pages: Record<string, [number, string]> = {
    '': [200, SHELL],
    'data/board.json': [200, BOARD],
    'data/status.json': [200, '{}'],
    'data/market-latest.json': [404, SHELL],
    'data/market-history.jsonl': [404, SHELL],
    'assets/index-abc.js': [200, 'console.log(1)'],
    board: [404, SHELL],
    ...overrides,
  };
  return async (url) => {
    const [status, body] = pages[url.slice(BASE.length)] ?? [404, SHELL];
    return { status, text: async () => body };
  };
}

describe('verifyDeployment', () => {
  it('passes a site serving only approved data', async () => {
    expect(await verifyDeployment(BASE, site())).toEqual([]);
  });

  it('fails while the market quotes are still served', async () => {
    const problems = await verifyDeployment(BASE, site({ 'data/market-latest.json': [200, '{"quotes":[]}'] }));
    expect(problems).toContain('data/market-latest.json is served (HTTP 200); it must return 404');
  });

  it('fails when the deployed JavaScript carries a market marker', async () => {
    const problems = await verifyDeployment(BASE, site({ 'assets/index-abc.js': [200, 'fetch("/data/market-latest.json")'] }));
    expect(problems.some((p) => p.includes('market-latest'))).toBe(true);
  });

  it('fails when confidence values reach the public board', async () => {
    const leaky = JSON.stringify({ entries: [{ canonicalId: 'a', confidenceLabel: 'HIGH' }] });
    expect(await verifyDeployment(BASE, site({ 'data/board.json': [200, leaky] }))).toContain('board.json: 1 entries carry confidenceLabel');
  });

  it('fails when the board is missing', async () => {
    expect(await verifyDeployment(BASE, site({ 'data/board.json': [404, SHELL] }))).toContain('board.json: HTTP 404');
  });
});
