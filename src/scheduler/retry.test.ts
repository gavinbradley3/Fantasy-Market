// Retry classification + deterministic backoff tests (Phase 7).

import { describe, expect, it } from 'vitest';
import { computeBackoffMs, deterministicUnit, errorCode, errorMessage, isRetryableError, NON_RETRYABLE_CODES } from './retry';
import { retryableError, terminalError } from './__fixtures';

describe('isRetryableError', () => {
  it('retries only explicitly-retryable errors', () => {
    expect(isRetryableError(retryableError())).toBe(true);
    expect(isRetryableError(Object.assign(new Error('x'), { retryable: false }))).toBe(false);
  });
  it('never retries terminal codes even if a retryable flag is set', () => {
    for (const code of NON_RETRYABLE_CODES) {
      expect(isRetryableError(Object.assign(new Error(code), { code, retryable: true }))).toBe(false);
    }
    expect(isRetryableError(terminalError('INVALID_ARTIFACT_SET'))).toBe(false);
  });
  it('defaults to non-retryable for unclassified errors', () => {
    expect(isRetryableError(new Error('plain'))).toBe(false);
    expect(isRetryableError('string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('errorCode / errorMessage', () => {
  it('reads duck-typed code and safe message', () => {
    expect(errorCode(terminalError('X'))).toBe('X');
    expect(errorCode(new Error('n'))).toBeUndefined();
    expect(errorMessage(new Error('m'))).toBe('m');
    expect(errorMessage('raw')).toBe('raw');
    expect(errorMessage(42)).toBe('unknown error');
  });
});

describe('computeBackoffMs', () => {
  const opts = { baseMs: 1000, maxMs: 30_000, jitterRatio: 0.25 };
  it('is deterministic for a given (runId, attempt)', () => {
    expect(computeBackoffMs('run-1', 1, opts)).toBe(computeBackoffMs('run-1', 1, opts));
    expect(computeBackoffMs('run-1', 3, opts)).toBe(computeBackoffMs('run-1', 3, opts));
  });
  it('grows exponentially with attempt (until capped)', () => {
    const a1 = computeBackoffMs('run-1', 1, opts);
    const a2 = computeBackoffMs('run-1', 2, opts);
    const a3 = computeBackoffMs('run-1', 3, opts);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  });
  it('never exceeds maxMs', () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect(computeBackoffMs('run-x', attempt, opts)).toBeLessThanOrEqual(opts.maxMs);
    }
  });
  it('jitter stays within [base, base*(1+ratio)] before the cap', () => {
    const base = 1000; // attempt 1 → exponential == base
    const v = computeBackoffMs('run-jitter', 1, opts);
    expect(v).toBeGreaterThanOrEqual(base);
    expect(v).toBeLessThanOrEqual(Math.round(base * (1 + opts.jitterRatio)));
  });
  it('different run ids produce independent (deterministic) jitter', () => {
    // Not necessarily different, but each is stable; assert stability across calls.
    expect(computeBackoffMs('a', 2, opts)).toBe(computeBackoffMs('a', 2, opts));
    expect(computeBackoffMs('b', 2, opts)).toBe(computeBackoffMs('b', 2, opts));
  });
});

describe('deterministicUnit', () => {
  it('is stable and within [0,1)', () => {
    const u = deterministicUnit('seed');
    expect(u).toBe(deterministicUnit('seed'));
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  });
});
