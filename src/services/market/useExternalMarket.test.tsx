import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '@/services/api';
import { PublicationProvider, usePublicationContext } from '@/services/publication';
import { useExternalMarket } from './useExternalMarket';
import type { ExternalMarket } from './types';

describe('disabled external-market browser hook', () => {
  it('makes no requests on mount/remount and cannot expose a retained successful cache entry', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('no network should be attempted'));
    const client = new ApiClient({ baseUrl: '/data', fetchFn });
    let seed: (() => Promise<unknown>) | undefined;
    function Probe() {
      const { query } = usePublicationContext();
      seed = () => query.ensure(JSON.stringify(['market', 'dynasty_superflex', '/market-latest.json']),
        async () => ({ quotesByPlayerId: new Map([['secret', { value: 9999 }]]) }) as unknown as ExternalMarket);
      const result = useExternalMarket();
      return <output>{JSON.stringify(result)}</output>;
    }
    const view = render(<StrictMode><PublicationProvider client={client} source={{
      kind: 'static', baseUrl: '/data', publicationPath: '/board.json', statusPath: '/status.json', marketPath: '/market-latest.json',
    }}><Probe /></PublicationProvider></StrictMode>);
    await act(async () => { await seed?.(); });
    expect(screen.getByRole('status').textContent).toBe('{"disabled":true,"isFetching":false,"unavailable":false}');
    expect(fetchFn).not.toHaveBeenCalled();
    view.unmount();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
