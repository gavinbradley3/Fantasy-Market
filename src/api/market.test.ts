// The released API must not re-serve retained private market snapshots.
import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';
import { ApplicationError } from '@/application';
import { fakeApplication } from './__fixtures';

describe('external market release exclusion', () => {
  it.each<Record<string, string>>([{}, { format: 'dynasty_1qb' }, { source: 'dynastyprocess' }, { source: 'somewhere' }])(
    'returns an explicit disabled response without reading private data for %j', async (query) => {
      const handle = fakeApplication();
      const api = createApiApp(handle.application);
      const response = await api.handle({ method: 'GET', path: '/market', query });
      expect(response.status).toBe(410);
      expect(response.body).toEqual({ error: {
        code: 'MARKET_DATA_DISABLED',
        message: expect.stringContaining('public usage rights remain unresolved'),
      } });
      expect(handle.calls.some((call) => call.startsWith('market.'))).toBe(false);
      expect(JSON.stringify(response.body)).not.toMatch(/"quotes"|"value"|"overallRank"/);
    },
  );

  it('does not depend on market storage being available', async () => {
    const handle = fakeApplication();
    handle.throwOnMarket = new ApplicationError('PERSISTENCE_UNAVAILABLE', 'db closed');
    const response = await createApiApp(handle.application).handle({ method: 'GET', path: '/market', query: {} });
    expect(response.status).toBe(410);
    expect(handle.calls.some((call) => call.startsWith('market.'))).toBe(false);
  });

  it('still rejects acquisition attempts through the API', async () => {
    const handle = fakeApplication();
    const response = await createApiApp(handle.application).handle({ method: 'POST', path: '/market', query: {}, body: {} });
    expect(response.status).toBe(405);
    expect(handle.calls.some((call) => call.startsWith('market.'))).toBe(false);
  });
});
