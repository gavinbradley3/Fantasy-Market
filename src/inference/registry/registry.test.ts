import { describe, expect, it } from 'vitest';
import { loadRegistry } from '@/inference/registry/registry';

describe('registry loading & validation (REGISTRY §1, §11, §16, §21)', () => {
  const registry = loadRegistry();

  it('exposes the pinned versions', () => {
    expect(registry.registryVersion).toBe('air-1.1.0');
    expect(registry.inferenceLayerVersion).toBe('air-1.1.0');
  });

  it('exposes engine-aligned confidence bands', () => {
    expect(registry.confidence.lowBand).toBe(600);
    expect(registry.confidence.highBand).toBe(800);
    expect(registry.confidence.playerFloor).toBe(50);
    expect(registry.confidence.playerCap).toBe(1000);
    expect(registry.confidence.wgmFloorIn).toBe(1);
  });

  it('provides typed constant access', () => {
    expect(registry.importanceWeight('critical')).toBe(3.0);
    expect(registry.importanceWeight('minor')).toBe(0.5);
    expect(registry.nullFieldConfidence('INSUFFICIENT_DATA')).toBe(200);
    expect(registry.nullFieldConfidence('UNAVAILABLE')).toBe(100);
    expect(registry.nullFieldConfidence('NEUTRAL_DEFAULT')).toBe(400);
    expect(registry.ttl('injuryPractice')).toEqual({ ttlDays: 7, hardBoundDays: 10 });
    expect(registry.ttl('routesStarts')).toEqual({ ttlDays: 30, hardBoundDays: 60 });
  });

  it('carries the verified environment reference', () => {
    expect(registry.envReference.reference_version).toBe('air-env-ref-1.0.0');
  });
});
