import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPERIMENTAL_IN_SEASON_CONFIGURATION, evaluateExperimentalInSeason } from '@/runtime';
import { DEFAULT_RETRY_POLICY, HttpClient, fixedClock, noSleep, zeroRandom } from '@/transport';
import { FilePayloadStore } from '@/transport/fileStore';
import { AS_OF, FETCHED_AT, defaultRoutes, routingFetch } from '@/transport/__fixtures';
import { main } from '../scripts/evaluate-in-season-experiment';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('experimental evaluation CLI activation boundary', () => {
  it('does not infer a configuration, season, as-of, mode, capture store, or output directory', async () => {
    await expect(main([])).rejects.toThrow('--config is required');
    await expect(main(['--config', EXPERIMENTAL_IN_SEASON_CONFIGURATION.id])).rejects.toThrow('--seasons is required');
  });

  it('refuses serving output directories before evaluation', async () => {
    await expect(main([
      '--config', EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,
      '--seasons', '2025',
      '--as-of', '2025-10-01T00:00:00.000Z',
      '--mode', 'replay',
      '--captures', '.local/test-captures',
      '--output-dir', 'site-data/experimental',
      '--code-sha', '579e111a41375dfa9a42e91c847154b43da2f708',
      '--code-tree', 'd89a8027489f5fc9df3e39f344c99bd97dd766de',
    ])).rejects.toThrow(/cannot target site-data/);
  });

  it('replays isolated captures through the command and writes only a non-serving diagnostic', async () => {
    const root = mkdtempSync(join(tmpdir(), 'playerticker-experiment-'));
    dirs.push(root);
    const captures = join(root, 'captures');
    const output = join(root, 'results');
    const clock = fixedClock(FETCHED_AT);
    const codeIdentity = {
      sha: '579e111a41375dfa9a42e91c847154b43da2f708',
      tree: 'd89a8027489f5fc9df3e39f344c99bd97dd766de',
    };
    await evaluateExperimentalInSeason({
      configurationId: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,
      valuationSeasons: [2025], careerSeasons: [], asOf: AS_OF, mode: 'live', includeSleeper: false,
      conditional: false, codeIdentity,
    }, {
      payloadStore: new FilePayloadStore(captures), clock,
      client: new HttpClient({
        fetchFn: routingFetch(defaultRoutes()), clock, random: zeroRandom, sleep: noSleep,
        retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
      }),
    });

    const code = await main([
      '--config', EXPERIMENTAL_IN_SEASON_CONFIGURATION.id,
      '--seasons', '2025', '--as-of', AS_OF, '--mode', 'replay', '--no-sleeper',
      '--captures', captures, '--output-dir', output,
      '--code-sha', codeIdentity.sha, '--code-tree', codeIdentity.tree,
    ]);
    expect(code).toBe(0);
    const files = readdirSync(output);
    expect(files).toHaveLength(1);
    const result = JSON.parse(readFileSync(join(output, files[0]!), 'utf8'));
    expect(result).toMatchObject({
      experimentalEvaluationComplete: true,
      configuration: { id: EXPERIMENTAL_IN_SEASON_CONFIGURATION.id, productionPublicationAuthorized: false },
      replayInputs: { mode: 'replay', codeIdentity },
    });
    expect(JSON.stringify(result)).not.toContain('sourceUrl');
    expect(JSON.stringify(result)).not.toContain('"payload":');
  });
});
