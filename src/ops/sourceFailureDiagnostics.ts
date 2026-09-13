// Safe, bounded CLI diagnostics for the source outcomes already persisted for a refresh run.
// Raw request keys, URLs, messages, response bodies and headers never cross this boundary.

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface HistoryReader {
  handle(request: { method: 'GET'; path: string; query: Record<string, string> }): Promise<ApiResponse>;
}

export type DiagnosticWriter = (line: string) => void;

type SafeSourceOutcome = {
  provider: string;
  capability: string;
  season: number | null;
  required: boolean | null;
  status: string;
  errorCode: string | null;
  failureStage: string | null;
  retryable: boolean | null;
};

const SAFE_RUN_ID = /^run-[A-Za-z0-9._:-]+$/;
const SAFE_ATOM = /^[A-Za-z0-9._:-]+$/;

function safeAtom(value: unknown): string {
  return typeof value === 'string' && SAFE_ATOM.test(value) ? value : 'unknown';
}

function nullableAtom(value: unknown): string {
  return value === null ? 'unknown' : safeAtom(value);
}

function safeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function safeSeason(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1999 && value <= 2100
    ? value
    : null;
}

function parseSource(value: unknown): SafeSourceOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  return {
    provider: safeAtom(source.provider),
    capability: safeAtom(source.capability),
    season: safeSeason(source.season),
    required: safeBoolean(source.required),
    status: safeAtom(source.status),
    errorCode: source.errorCode === null ? null : safeAtom(source.errorCode),
    failureStage: source.failureStage === null ? null : safeAtom(source.failureStage),
    retryable: safeBoolean(source.retryable),
  };
}

function unavailable(write: DiagnosticWriter, runId: string | null, reason: string): void {
  write(`[ingest] source diagnostics unavailable run=${runId ?? 'unknown'} reason=${reason}`);
}

/** Read and report failed sources for exactly the run acknowledged by POST /refresh. */
export async function reportSourceFailures(
  api: HistoryReader,
  acknowledgedRunId: unknown,
  write: DiagnosticWriter = (line) => console.error(line),
): Promise<void> {
  if (typeof acknowledgedRunId !== 'string' || !SAFE_RUN_ID.test(acknowledgedRunId)) {
    unavailable(write, null, 'missing-or-invalid-run-id');
    return;
  }

  let response: ApiResponse;
  try {
    response = await api.handle({
      method: 'GET',
      path: `/history/${encodeURIComponent(acknowledgedRunId)}`,
      query: {},
    });
  } catch {
    unavailable(write, acknowledgedRunId, 'history-read-failed');
    return;
  }

  if (response.status !== 200) {
    unavailable(write, acknowledgedRunId, 'history-unavailable');
    return;
  }
  if (!response.body || typeof response.body !== 'object') {
    unavailable(write, acknowledgedRunId, 'malformed-history');
    return;
  }

  const body = response.body as Record<string, unknown>;
  if (body.runId !== acknowledgedRunId) {
    unavailable(write, acknowledgedRunId, 'history-run-mismatch');
    return;
  }
  if (!Array.isArray(body.sources)) {
    unavailable(write, acknowledgedRunId, 'malformed-history');
    return;
  }

  const parsedSources = body.sources.map(parseSource);
  if (parsedSources.some((source) => source === null)) {
    unavailable(write, acknowledgedRunId, 'malformed-history');
    return;
  }

  const failures = parsedSources
    .filter((source): source is SafeSourceOutcome => source !== null && source.status === 'failure')
    .sort((a, b) => {
      const left = `${a.provider}|${a.capability}|${a.season ?? ''}|${a.errorCode ?? ''}|${a.failureStage ?? ''}`;
      const right = `${b.provider}|${b.capability}|${b.season ?? ''}|${b.errorCode ?? ''}|${b.failureStage ?? ''}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });

  for (const source of failures) {
    write([
      '[ingest] source failure',
      `run=${acknowledgedRunId}`,
      `provider=${source.provider}`,
      `capability=${source.capability}`,
      `season=${source.season ?? 'unknown'}`,
      `required=${source.required ?? 'unknown'}`,
      `code=${nullableAtom(source.errorCode)}`,
      `stage=${nullableAtom(source.failureStage)}`,
      `retryable=${source.retryable ?? 'unknown'}`,
    ].join(' '));
  }
}
