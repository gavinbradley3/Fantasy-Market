import { describe, expect, it } from 'vitest';
import { isRequiredSource } from '@/transport';
import { OPTIONAL_SOURCES, REQUIRED_PROVIDERS } from './sources';

const policy = { requiredProviders: REQUIRED_PROVIDERS, optionalSources: OPTIONAL_SOURCES };

describe('isRequiredSource under the production policy', () => {
  it.each(['identity', 'schedule', 'roster', 'games'] as const)('nflverse %s is required', (capability) => {
    expect(isRequiredSource(policy, { provider: 'nflverse', capability })).toBe(true);
  });

  it('nflverse participation is optional (published only after the season ends)', () => {
    expect(isRequiredSource(policy, { provider: 'nflverse', capability: 'participation' })).toBe(false);
  });

  it('sleeper is optional', () => {
    expect(isRequiredSource(policy, { provider: 'sleeper', capability: 'identity' })).toBe(false);
  });

  it('with no optional list, every source of a required provider is required', () => {
    expect(isRequiredSource({ requiredProviders: ['nflverse'] }, { provider: 'nflverse', capability: 'participation' })).toBe(true);
  });
});
