import { describe, expect, it } from 'vitest';
import { loadRegistry, runInference } from '@/inference';

describe('AIL public entry', () => {
  it('re-exports the registry loader', () => {
    expect(loadRegistry().registryVersion).toBe('air-1.1.0');
  });

  it('exposes the production runInference orchestrator', () => {
    expect(typeof runInference).toBe('function');
  });
});
