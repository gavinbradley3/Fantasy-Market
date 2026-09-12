// The heap guard.
//
// It cannot create memory. Its whole job is to turn an unexplained mid-run kill into one line
// naming the cause and the fix, BEFORE any provider is contacted — so what matters is that it
// fires on the default limit, does not fire on a small run, and says something actionable.

import { describe, expect, it } from 'vitest';
import { MEMORY_PROFILE, checkHeap, heapLimitMb } from './heapGuard';

describe('heap guard', () => {
  it('refuses a production-shaped run on Node’s default limit', () => {
    // ~2 GB is the default this pipeline silently died against.
    const check = checkHeap({ limitMb: 2048, seasonCount: 3, careerSeasonCount: 9 });
    expect(check.ok).toBe(false);
    expect(check.limitMb).toBe(2048);
  });

  it('names the cause, the numbers and the exact fix', () => {
    const { message } = checkHeap({ limitMb: 2048, seasonCount: 3, careerSeasonCount: 9 });
    expect(message).toContain('needs more memory');
    expect(message).toContain(String(MEMORY_PROFILE.measuredPeakRssMb));
    expect(message).toContain(`--max-old-space-size=${MEMORY_PROFILE.requiredHeapMb}`);
    // And it says why the failure would otherwise be misread.
    expect(message).toContain('looks like a provider fault');
  });

  it('allows a production-shaped run at the documented limit', () => {
    expect(checkHeap({ limitMb: MEMORY_PROFILE.requiredHeapMb, seasonCount: 3, careerSeasonCount: 9 }).ok).toBe(true);
  });

  it('does NOT block a small fixture run on a default heap', () => {
    // A single-season replay must stay runnable on any laptop; the guard exists to catch the
    // default limit on a production window, not to impose production memory everywhere.
    expect(checkHeap({ limitMb: 1500, seasonCount: 1, careerSeasonCount: 1 }).ok).toBe(true);
  });

  it('requires headroom above the measured heap, not merely equality', () => {
    // A limit equal to the observed live heap thrashes and then fails.
    expect(MEMORY_PROFILE.requiredHeapMb).toBeGreaterThan(MEMORY_PROFILE.measuredHeapMb);
    expect(MEMORY_PROFILE.minimumHeapMb).toBeLessThan(MEMORY_PROFILE.requiredHeapMb);
  });

  it('reads the limit actually in force in this process', () => {
    // `heapTotal` reports what V8 committed, not its ceiling, so the guard must not use it.
    expect(heapLimitMb()).toBeGreaterThan(0);
    expect(heapLimitMb()).toBeGreaterThan(Math.round(process.memoryUsage().heapUsed / 1_048_576));
  });
});
