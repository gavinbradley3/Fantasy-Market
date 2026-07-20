import { describe, expect, it } from 'vitest';
import {
  computeWrProxyRoutes,
  isProxyAuthorized,
  TE_ROUTE_PROXY,
  WR_PROXY_FACTOR,
  WR_ROUTE_PROXY,
} from '@/pipeline/snaps/proxyRegistry';

describe('route-proxy authorization registry (no cross-position leakage)', () => {
  it('authorizes the WR pass-snap proxy for WR only', () => {
    expect(isProxyAuthorized('WR_ROUTES_FROM_PASS_SNAPS', 'WR')).toBe(true);
    expect(isProxyAuthorized('WR_ROUTES_FROM_PASS_SNAPS', 'TE')).toBe(false);
    expect(isProxyAuthorized('WR_ROUTES_FROM_PASS_SNAPS', 'RB')).toBe(false);
    expect(isProxyAuthorized('WR_ROUTES_FROM_PASS_SNAPS', 'QB')).toBe(false);
  });

  it('computes WR proxy routes = pass snaps × 0.97 with PROXY provenance', () => {
    const r = computeWrProxyRoutes('WR', 300);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeCloseTo(300 * WR_PROXY_FACTOR, 10);
      expect(r.provenance).toBe('PROXY');
    }
  });

  it('rejects the WR proxy for other positions (UNAUTHORIZED), never leaking the 0.97 rule', () => {
    for (const pos of ['TE', 'RB', 'QB'] as const) {
      const r = computeWrProxyRoutes(pos, 300);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('UNAUTHORIZED');
    }
  });

  it('reports INPUT_UNAVAILABLE when pass snaps are absent (this dataset)', () => {
    const r = computeWrProxyRoutes('WR', null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INPUT_UNAVAILABLE');
  });

  it('records the TE proxy as engine-owned with a different rule (not the WR 0.97)', () => {
    expect(TE_ROUTE_PROXY.owner).toBe('engine');
    expect(TE_ROUTE_PROXY.authorizedPositions.has('TE')).toBe(true);
    expect(TE_ROUTE_PROXY.authorizedPositions.has('WR')).toBe(false);
    expect(WR_ROUTE_PROXY.owner).toBe('pipeline');
    expect(WR_ROUTE_PROXY.inputAvailableFromSnapCounts).toBe(false);
  });
});
