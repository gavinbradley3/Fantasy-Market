import { describe, expect, it } from 'vitest';
import { reportSourceFailures, type HistoryReader } from './sourceFailureDiagnostics';

function reader(status: number, body: unknown): HistoryReader {
  return { async handle() { return { status, body }; } };
}

describe('source failure diagnostics', () => {
  it('prints allowlisted fields in deterministic coordinate order', async () => {
    const lines: string[] = [];
    await reportSourceFailures(reader(200, {
      runId: 'run-fixed-1',
      sources: [
        { provider: 'nflverse', capability: 'participation', season: 2026, required: true, status: 'failure', errorCode: 'UNEXPECTED_STATUS', failureStage: 'fetch', retryable: false },
        { provider: 'nflverse', capability: 'games', season: 2025, required: true, status: 'failure', errorCode: 'NETWORK', failureStage: 'fetch', retryable: true },
        { provider: 'sleeper', capability: 'identity', season: null, required: false, status: 'success', errorCode: null, failureStage: null, retryable: null },
      ],
    }), 'run-fixed-1', (line) => lines.push(line));

    expect(lines).toEqual([
      '[ingest] source failure run=run-fixed-1 provider=nflverse capability=games season=2025 required=true code=NETWORK stage=fetch retryable=true',
      '[ingest] source failure run=run-fixed-1 provider=nflverse capability=participation season=2026 required=true code=UNEXPECTED_STATUS stage=fetch retryable=false',
    ]);
  });

  it('does not print stored messages, request keys, URLs, payloads or unsafe atoms', async () => {
    const sentinel = 'credential=SECRET signed=https://host/path?token=SECRET payload=PRIVATE';
    const lines: string[] = [];
    await reportSourceFailures(reader(200, {
      runId: 'run-fixed-2',
      sources: [{
        provider: `nflverse\n${sentinel}`,
        capability: 'participation',
        season: 2026,
        required: true,
        status: 'failure',
        errorCode: 'UNEXPECTED_STATUS',
        failureStage: 'fetch',
        retryable: false,
        requestKey: `nflverse:participation?season=2026&token=${sentinel}`,
        errorMessage: sentinel,
        responseBody: sentinel,
      }],
    }), 'run-fixed-2', (line) => lines.push(line));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('provider=unknown');
    expect(lines.join('\n')).not.toContain('SECRET');
    expect(lines.join('\n')).not.toContain('PRIVATE');
    expect(lines.join('\n')).not.toContain('https://');
  });

  it.each([
    ['missing run id', null, reader(200, {})],
    ['history 404', 'run-fixed-3', reader(404, { error: 'sentinel' })],
    ['malformed history', 'run-fixed-3', reader(200, { runId: 'run-fixed-3', sources: 'bad' })],
    ['malformed source', 'run-fixed-3', reader(200, { runId: 'run-fixed-3', sources: [42] })],
    ['mismatched history', 'run-fixed-3', reader(200, { runId: 'run-unrelated', sources: [] })],
  ])('%s emits one bounded unavailable message', async (_name, runId, api) => {
    const lines: string[] = [];
    await reportSourceFailures(api, runId, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[ingest\] source diagnostics unavailable run=(unknown|run-fixed-3) reason=[a-z-]+$/);
    expect(lines[0]).not.toContain('sentinel');
  });

  it('contains a thrown history lookup without replacing it with error detail', async () => {
    const lines: string[] = [];
    const api: HistoryReader = { async handle() { throw new Error('SECRET signed URL'); } };
    await reportSourceFailures(api, 'run-fixed-4', (line) => lines.push(line));
    expect(lines).toEqual(['[ingest] source diagnostics unavailable run=run-fixed-4 reason=history-read-failed']);
  });
});
