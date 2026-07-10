// Async service-contract tests (Phase 10): the mock implements the async
// interface, stays deterministic behind it, and the async conversion did not
// change a single market calculation.

import { describe, expect, it } from 'vitest';
import { MockMarketDataService } from '@/services/marketData/mock/MockMarketDataService';
import { getDataset } from '@/services/marketData/mock/buildDataset';

const FORMAT = 'dyn_sf_half' as const;

describe('MockMarketDataService — async contract', () => {
  const service = new MockMarketDataService();

  it('every data method returns a Promise', () => {
    expect(service.getMarketStatus()).toBeInstanceOf(Promise);
    expect(service.getBoard(FORMAT)).toBeInstanceOf(Promise);
    expect(service.getPlayer('NAB', FORMAT)).toBeInstanceOf(Promise);
    expect(service.getMovers(FORMAT)).toBeInstanceOf(Promise);
    expect(service.getHistory('NAB', FORMAT, '30d')).toBeInstanceOf(Promise);
    expect(service.getFormatComparison('NAB')).toBeInstanceOf(Promise);
    expect(service.getRowsByIds(['pt_0001'], FORMAT)).toBeInstanceOf(Promise);
    expect(service.getPriceById('pt_0001', FORMAT)).toBeInstanceOf(Promise);
    expect(service.search('nab')).toBeInstanceOf(Promise);
  });

  it('two instances produce identical same-day prices (determinism survives async)', async () => {
    const a = await new MockMarketDataService().getBoard(FORMAT);
    const b = await new MockMarketDataService().getBoard(FORMAT);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].snapshot.marketPrice).toBe(a[i].snapshot.marketPrice);
      expect(b[i].player.identity.internal_id).toBe(a[i].player.identity.internal_id);
    }
  });

  it('async conversion did not change market calculations', async () => {
    // The service must serve exactly what the deterministic dataset computes.
    const board = await service.getBoard(FORMAT);
    const ds = getDataset(FORMAT);
    for (const row of board) {
      const cp = ds.byId.get(row.player.identity.internal_id)!;
      expect(row.snapshot.marketPrice).toBe(cp.snapshot.marketPrice);
      expect(row.snapshot.mispricing).toBe(cp.snapshot.mispricing);
      expect(row.signal.signal).toBe(cp.signal.signal);
    }
  });

  it('different days produce different prices for most players', async () => {
    const today = getDataset(FORMAT, '2026-07-09');
    const yesterday = getDataset(FORMAT, '2026-07-08');
    let changed = 0;
    for (const cp of today.players) {
      const y = yesterday.byId.get(cp.player.identity.internal_id)!;
      if (y.snapshot.marketPrice !== cp.snapshot.marketPrice) changed++;
    }
    expect(changed).toBeGreaterThan(today.players.length / 2);
  });

  it('reports demo status with sources and a notice', async () => {
    const status = await service.getMarketStatus();
    expect(status.mode).toBe('demo');
    expect(status.notice).toMatch(/Demo Market/);
    expect(status.sources.length).toBeGreaterThan(0);
    expect(status.marketDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('getPriceById resolves undefined for unknown ids (never a placeholder)', async () => {
    await expect(service.getPriceById('pt_9999', FORMAT)).resolves.toBeUndefined();
  });
});
