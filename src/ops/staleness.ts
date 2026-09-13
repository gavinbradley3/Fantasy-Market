// Compatibility entry point for operations code. The pure rules live in the shared contract so
// the status exporter and browser clock cannot drift, while browser code never imports src/ops.
export {
  CADENCE_HOURS,
  STALENESS,
  ageHours,
  classifyFreshness,
  type FreshnessState,
} from '@/contracts/freshness';
