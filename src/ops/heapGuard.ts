// Fail loudly BEFORE a long ingest, not silently in the middle of one.
//
// WHY THIS EXISTS
// The production season window needs materially more memory than Node allows by default. On the
// measured production shape — three valuation seasons plus a nine-season career window for the
// QB career aggregates — a run peaks at about 6.6 GB resident with 4.6 GB of live V8 heap. Under
// the default old-space limit the process does not report a configuration problem: it spends two
// minutes fetching and parsing provider data and is then killed mid-computation, which looks
// like a provider or pipeline fault and is neither.
//
// A guard cannot create memory. What it can do is turn an unexplained crash into one line that
// names the cause and the fix, before any provider is contacted.

import { createRequire } from 'node:module';

/** Measured peak for the production window, and the heap the run actually needs. */
export const MEMORY_PROFILE = {
  /** Peak resident memory observed for `--seasons 2023,2024,2025 --career-seasons 2017..2025`. */
  measuredPeakRssMb: 6604,
  /** Live V8 heap at the end of that run. */
  measuredHeapMb: 4625,
  /**
   * The old-space limit a production run must be given.
   *
   * Above the measured heap with headroom for the garbage collector, which needs room to move
   * objects rather than merely to hold them. A limit equal to the measured heap would thrash and
   * then fail.
   */
  requiredHeapMb: 6144,
  /**
   * Below this the guard refuses to start. Set under `requiredHeapMb` so a slightly smaller
   * window on a smaller machine is still allowed to try — the guard exists to catch the DEFAULT
   * limit, not to enforce one exact number.
   */
  minimumHeapMb: 4096,
} as const;

/**
 * V8's old-space limit for this process, in megabytes.
 *
 * `process.memoryUsage().heapTotal` cannot answer this — it reports what V8 has COMMITTED, not
 * its ceiling. The limit actually in force, however it was set (a flag, `NODE_OPTIONS`, or the
 * platform default derived from available memory), is only visible through the heap statistics.
 */
export function heapLimitMb(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1_048_576);
}

interface HeapStatistics {
  readonly heap_size_limit: number;
}

// Loaded through `createRequire` rather than a static import for the same reason
// `persistence/sqlite/db.ts` does it: this module is bundled for a Node-only entry point, and a
// static import of a Node builtin can be rewritten by the bundler and fail to resolve.
const nodeRequire = createRequire(import.meta.url);

function getHeapStatistics(): HeapStatistics {
  const v8 = nodeRequire('node:v8') as { getHeapStatistics(): HeapStatistics };
  return v8.getHeapStatistics();
}

export interface HeapCheck {
  readonly ok: boolean;
  readonly limitMb: number;
  readonly requiredMb: number;
  readonly message: string;
}

/**
 * Check the heap limit against what a production-shaped run needs.
 *
 * `seasonCount` and `careerSeasonCount` are taken into account because a small window genuinely
 * needs less: a single-season fixture run is fine on the default limit and must not be blocked.
 * The requirement scales with the career window, which is the part that dominates.
 */
export function checkHeap(args: {
  readonly limitMb?: number;
  readonly seasonCount: number;
  readonly careerSeasonCount: number;
}): HeapCheck {
  const limitMb = args.limitMb ?? heapLimitMb();
  // A run this small has never needed a raised limit; scale the requirement down rather than
  // demanding production memory for a fixture.
  const smallRun = args.seasonCount <= 1 && args.careerSeasonCount <= 2;
  const requiredMb = smallRun ? 1024 : MEMORY_PROFILE.minimumHeapMb;
  if (limitMb >= requiredMb) {
    return { ok: true, limitMb, requiredMb, message: `heap limit ${limitMb} MB (need ≥ ${requiredMb} MB)` };
  }
  return {
    ok: false,
    limitMb,
    requiredMb,
    message:
      `This run needs more memory than Node has been given.\n` +
      `  heap limit        ${limitMb} MB\n` +
      `  minimum required  ${requiredMb} MB\n` +
      `  measured peak     ${MEMORY_PROFILE.measuredPeakRssMb} MB resident, ` +
      `${MEMORY_PROFILE.measuredHeapMb} MB live heap ` +
      `(${args.seasonCount} valuation season(s), ${args.careerSeasonCount} career season(s))\n` +
      `\n` +
      `  Re-run with:  NODE_OPTIONS="--max-old-space-size=${MEMORY_PROFILE.requiredHeapMb}" npm run ingest -- ...\n` +
      `\n` +
      `  Without this the process would fetch and parse every provider payload and then be\n` +
      `  killed mid-computation, which looks like a provider fault and is not one.`,
  };
}
