// PlayerTicker application service layer (Phase 8) — public surface.
//
// A thin, port-driven coordination layer over the authoritative persistence, publication,
// replay, and scheduler systems. Future HTTP APIs, CLIs, workers, and admin tools should
// depend ONLY on `ApplicationService` (via `createApplicationService`). This module imports no
// concrete persistence/transport runtime — only the scheduler and persistence *types* — so it
// stays a clean seam and never drags Node-only code where it doesn't belong.

export { ApplicationService, createApplicationService } from './ApplicationService';
export { RefreshService, projectExecution } from './RefreshService';
export { SchedulerService, type NextRunEstimator } from './SchedulerService';
export { PublicationService } from './PublicationService';
export { HistoryService } from './HistoryService';
export { HealthService } from './HealthService';
export { InMemoryExecutionRecorder } from './recorder';
export { ApplicationError, underlyingCode, type ApplicationErrorCode } from './errors';
export type {
  // ports
  SchedulerPort,
  PublicationReadPort,
  RunHistoryPort,
  ExecutionRecorderPort,
  ApplicationDependencies,
  // DTOs
  RefreshExecutionResult,
  RefreshAcknowledgement,
  ExecutionFailureView,
  CurrentExecutionView,
  SchedulerStatus,
  PublicationMetadata,
  TransportConfigDescriptor,
  HealthReport,
  NowIso,
} from './types';
