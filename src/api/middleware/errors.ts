// Centralized HTTP error translation (Phase 9). The API preserves application/persistence
// SEMANTICS — it only maps them onto status codes. It never rewrites the underlying code and
// never exposes stack traces or provider payloads.

import { ApplicationError, underlyingCode } from '@/application';
import type { ApiErrorBody, ApiResponse } from '../dto';

/** Deterministic persistence/validation codes that carry a specific HTTP meaning. */
const UNDERLYING_STATUS: Readonly<Record<string, number>> = {
  INVALID_CONFIG: 400,
  DUPLICATE_REFRESH_REQUEST: 409,
  CONFLICTING_ARTIFACT: 409,
  INVALID_ARTIFACT_SET: 409,
  PUBLICATION_NOT_ALLOWED: 409,
  ARTIFACT_NOT_FOUND: 404,
  CHECKSUM_MISMATCH: 500,
  INTEGRITY_VIOLATION: 500,
  MIGRATION_FAILURE: 500,
};

const APPLICATION_STATUS: Readonly<Record<string, number>> = {
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  PERSISTENCE_UNAVAILABLE: 503,
  REFRESH_DISPATCH_FAILED: 500,
};

/** A thrown-by-routes marker for "the requested resource does not exist" (app returns null). */
export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** A thrown-by-validation marker for a malformed request. */
export class BadRequestError extends Error {
  readonly issues: readonly string[];
  constructor(message: string, issues: readonly string[] = []) {
    super(message);
    this.name = 'BadRequestError';
    this.issues = issues;
  }
}

/** Map any thrown value to a deterministic HTTP response with a safe error envelope. */
export function toErrorResponse(err: unknown): ApiResponse {
  if (err instanceof BadRequestError) {
    return errorBody(400, 'INVALID_REQUEST', err.message, err.issues);
  }
  if (err instanceof NotFoundError) {
    return errorBody(404, 'NOT_FOUND', err.message);
  }
  if (err instanceof ApplicationError) {
    // Prefer a specific status derived from the preserved underlying code, else the app code.
    const under = err.detail ?? underlyingCode(err.cause);
    const status = (under ? UNDERLYING_STATUS[under] : undefined) ?? APPLICATION_STATUS[err.code] ?? 500;
    return errorBody(status, err.code, safeMessage(err.message));
  }
  // Unknown failure: never leak internals.
  return errorBody(500, 'INTERNAL', 'internal error');
}

function errorBody(status: number, code: string, message: string, issues?: readonly string[]): ApiResponse {
  const body: ApiErrorBody = { error: { code, message, ...(issues && issues.length ? { issues } : {}) } };
  return { status, body };
}

/** Redaction-free but bounded message (no payloads, no stacks). */
function safeMessage(message: string): string {
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}
