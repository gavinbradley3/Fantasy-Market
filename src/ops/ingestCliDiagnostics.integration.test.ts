import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../scripts/ingest-nflverse';
import {
  csv,
  defaultRoutes,
  nflverseAssetUrl,
  nflverseGamesRows,
  nflverseRosterRows,
  routingFetch,
  URLS,
  type RouteResponse,
} from '@/transport/__fixtures';

const AS_OF = '2026-09-13T14:30:57.000Z';
const CAREER = '2017,2018,2019,2020,2021,2022,2023,2024,2025';

function productionRoutes(): Record<string, RouteResponse> {
  const routes = defaultRoutes();
  routes[nflverseAssetUrl('games', '2026')] = csv(nflverseGamesRows.map((row) => ({
    ...row,
    season: 2026,
    game_id: String(row.game_id).replace(/^2025_/, '2026_'),
    kickoff: String(row.kickoff).replace(/^2025-/, '2026-'),
  })));
  routes[nflverseAssetUrl('roster', '2026')] = csv(nflverseRosterRows.map((row) => ({ ...row, season: 2026 })));
  routes[nflverseAssetUrl('participation', '2026')] = routes[URLS.nflverseParticipation];
  for (const season of [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]) {
    routes[nflverseAssetUrl('games', String(season))] = csv([]);
  }
  // The derived window is now the current season plus the two before it (2024–2026).
  routes[nflverseAssetUrl('roster', '2024')] = csv([]);
  routes[nflverseAssetUrl('participation', '2024')] = csv([]);
  return routes;
}

async function execute(mutate: (routes: Record<string, RouteResponse>) => void, extraArgs: string[] = []) {
  const routes = productionRoutes();
  mutate(routes);
  vi.stubGlobal('fetch', routingFetch(routes));
  const dir = mkdtempSync(join(tmpdir(), 'pt-cli-diagnostics-'));
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...parts) => stdout.push(parts.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...parts) => stderr.push(parts.join(' ')));
  const code = await main([
    '--as-of', AS_OF,
    '--career-seasons', CAREER,
    '--db', join(dir, 'board.db'),
    '--captures', join(dir, 'captures'),
    ...extraArgs,
  ], {
    heapCheck: () => ({ ok: true, limitMb: 6144, requiredMb: 4096, message: 'fixture heap guard passed' }),
    // A fixture board holds a handful of players; production floors are exercised separately.
    publicationFloors: null,
  });
  return { code, stdout, stderr };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ingest CLI source diagnostics — production-shaped integration', () => {
  it('reports a missing in-season participation file by name, as optional, and still publishes', async () => {
    const result = await execute((routes) => {
      routes[nflverseAssetUrl('participation', '2026')] = { status: 404, body: 'PRIVATE-PAYLOAD' };
    });
    expect(result.code).toBe(0);
    expect(result.stdout.join('\n')).toContain('published     true');
    expect(result.stderr).toEqual([
      expect.stringContaining('provider=nflverse capability=participation season=2026 required=false code=UNEXPECTED_STATUS stage=fetch retryable=false'),
    ]);
    expect(result.stderr.join('\n')).not.toContain('PRIVATE-PAYLOAD');
  });

  it('a network failure on participation is named, distinct from a 404, and non-blocking', async () => {
    const result = await execute((routes) => {
      routes[nflverseAssetUrl('participation', '2026')] = { networkError: true };
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toEqual([
      expect.stringContaining('provider=nflverse capability=participation season=2026 required=false code=NETWORK stage=fetch retryable=true'),
    ]);
  });

  it('a REQUIRED source failure blocks publication, is named, and exits non-zero', async () => {
    const result = await execute((routes) => {
      routes[nflverseAssetUrl('games', '2026')] = { status: 404, body: '' };
    }, ['--json']);
    expect(result.code).toBe(1);
    expect(result.stdout).toHaveLength(1);
    expect(JSON.parse(result.stdout[0])).toMatchObject({ published: false, seasons: [2024, 2025, 2026] });
    expect(result.stderr).toEqual([
      expect.stringContaining('provider=nflverse capability=games season=2026 required=true code=UNEXPECTED_STATUS'),
      expect.stringContaining('[ingest] not published: reason='),
    ]);
  });

  it('reports optional Sleeper failure while retaining partial publication success', async () => {
    const result = await execute((routes) => {
      routes[URLS.sleeperIdentity] = { status: 500, body: 'PRIVATE-PAYLOAD' };
    });
    expect(result.code).toBe(0);
    expect(result.stdout.join('\n')).toContain('published     true');
    expect(result.stderr).toEqual([
      expect.stringContaining('provider=sleeper capability=identity season=unknown required=false code=UNEXPECTED_STATUS stage=fetch retryable=true'),
    ]);
  });

  it('prints no failure diagnostic on clean success', async () => {
    const result = await execute(() => {});
    expect(result.code).toBe(0);
    expect(result.stdout.join('\n')).toContain('published     true');
    expect(result.stderr).toEqual([]);
  });

  it('preserves the existing successful-empty-asset behavior', async () => {
    const result = await execute((routes) => {
      routes[nflverseAssetUrl('participation', '2026')] = csv([]);
    });
    expect(result.code).toBe(0);
    expect(result.stdout.join('\n')).toContain('published     true');
    expect(result.stderr).toEqual([]);
  });

  it('attributes multiple failed coordinates without collapsing seasons', async () => {
    const result = await execute((routes) => {
      routes[nflverseAssetUrl('games', '2025')] = { status: 404, body: '' };
      routes[nflverseAssetUrl('participation', '2026')] = { status: 404, body: '' };
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toEqual([
      expect.stringContaining('capability=games season=2025 required=true'),
      expect.stringContaining('capability=participation season=2026 required=false'),
      expect.stringContaining('[ingest] not published: reason='),
    ]);
  });

  it('refuses a board that misses the production floors, names each position, and exits non-zero', async () => {
    const routes = productionRoutes();
    vi.stubGlobal('fetch', routingFetch(routes));
    const dir = mkdtempSync(join(tmpdir(), 'pt-cli-floors-'));
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...parts) => stdout.push(parts.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...parts) => stderr.push(parts.join(' ')));
    const code = await main(
      ['--as-of', AS_OF, '--career-seasons', CAREER, '--db', join(dir, 'board.db'), '--captures', join(dir, 'captures')],
      { heapCheck: () => ({ ok: true, limitMb: 6144, requiredMb: 4096, message: 'ok' }) },
    );
    expect(code).toBe(1);
    expect(stdout.join('\n')).toContain('published     false');
    expect(stderr).toContain('[ingest] not published: reason=PUBLICATION_NOT_ALLOWED');
    for (const pos of ['QB', 'RB', 'TE', 'WR']) {
      expect(stderr.some((l) => l.startsWith(`[ingest] publication floor not met: ${pos}:`))).toBe(true);
    }
  });
});
