// Typed persistence errors (Phase 6). Every failure crossing the persistence boundary is
// one of these — a DB failure is never misreported as a successful persisted refresh, and
// an integrity failure surfaces explicitly rather than returning plausible-but-corrupt
// data. Errors carry a stage and safe, redaction-free context (no secrets are ever stored,
// so none can be in a message).

export type PersistenceErrorCode =
  | 'MIGRATION_FAILURE'
  | 'UNSUPPORTED_PERSISTED_SCHEMA'
  | 'UNSUPPORTED_DATABASE_VERSION'
  | 'CHECKSUM_MISMATCH'
  | 'INTEGRITY_VIOLATION'
  | 'CONFLICTING_ARTIFACT'
  | 'ARTIFACT_NOT_FOUND'
  | 'INVALID_ARTIFACT_SET'
  | 'PUBLICATION_NOT_ALLOWED'
  | 'WRITE_FAILURE'
  | 'READ_FAILURE';

export type PersistenceStage =
  | 'migration'
  | 'raw-envelope-write'
  | 'run-write'
  | 'source-outcome-write'
  | 'artifact-write'
  | 'association-write'
  | 'publication'
  | 'read'
  | 'integrity';

export interface PersistenceErrorContext {
  readonly stage: PersistenceStage;
  readonly detail?: string;
}

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly stage: PersistenceStage;
  readonly detail?: string;

  constructor(code: PersistenceErrorCode, message: string, context: PersistenceErrorContext) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.stage = context.stage;
    this.detail = context.detail;
  }
}
