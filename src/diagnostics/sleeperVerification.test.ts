// Sleeper verification logic — offline.
//
// These tests exist because the distinction they encode is the whole point of the verifier:
// "an intermediary refused us" and "Sleeper is broken" must never collapse into one verdict.
// The first is a fact about the machine running the check; only the second is a fact about
// Sleeper, and only the second would justify touching the integration.

import { describe, expect, it } from 'vitest';
import {
  classifyHttpFailure,
  classifySleeperFailure,
  summarizeChecks,
  validateSleeperPlayers,
  validateSleeperTrending,
  type SleeperCheck,
} from './sleeperVerification';

/** Shape Node's fetch actually throws: a TypeError wrapping the socket error as `cause`. */
function fetchFailure(cause: { code?: string; message: string; name?: string }): Error {
  const inner = Object.assign(new Error(cause.message), { code: cause.code, name: cause.name ?? 'Error' });
  return Object.assign(new TypeError('fetch failed'), { cause: inner });
}

describe('failure classification', () => {
  it('reports an org egress refusal as a PROXY block, never as a Sleeper outage', () => {
    const result = classifySleeperFailure(
      fetchFailure({ code: 'ERR_PROXY_CONNECTION_FAILED', message: 'Proxy CONNECT aborted' }),
    );
    expect(result.classification).toBe('NETWORK_PROXY_BLOCKED');
    expect(result.detail).toContain('before Sleeper was reached');
  });

  it('recognises a 403 on CONNECT as a proxy refusal from the message alone', () => {
    // This is the exact shape the Claude Code sandbox produces: no proxy-specific error code,
    // just a CONNECT that came back 403.
    const result = classifySleeperFailure(fetchFailure({ message: 'CONNECT api.sleeper.app:443 returned 403' }));
    expect(result.classification).toBe('NETWORK_PROXY_BLOCKED');
  });

  it('separates DNS from TLS-adjacent faults but reports both as pre-HTTP', () => {
    expect(classifySleeperFailure(fetchFailure({ code: 'ENOTFOUND', message: 'getaddrinfo' })).classification)
      .toBe('DNS_TLS_FAILURE');
    expect(classifySleeperFailure(fetchFailure({ code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: 'bad cert' })).classification)
      .toBe('DNS_TLS_FAILURE');
    expect(classifySleeperFailure(fetchFailure({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'chain' })).classification)
      .toBe('DNS_TLS_FAILURE');
  });

  it('classifies an aborted request as a timeout rather than an outage', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(classifySleeperFailure(abort).classification).toBe('TIMEOUT');
  });

  it('does not guess: an unrecognised socket failure is reported as unreachable, with its code', () => {
    const result = classifySleeperFailure(fetchFailure({ code: 'ECONNRESET', message: 'socket hang up' }));
    expect(result.classification).toBe('NETWORK_UNREACHABLE');
    expect(result.detail).toContain('ECONNRESET');
  });

  it('survives a non-Error throw without crashing the verifier', () => {
    expect(classifySleeperFailure('something went wrong').classification).toBe('NETWORK_UNREACHABLE');
    expect(classifySleeperFailure(null).classification).toBe('NETWORK_UNREACHABLE');
  });
});

describe('non-2xx classification', () => {
  // An intermediary that terminates TLS answers with an ordinary HTTP response, not an
  // exception. If that is not recognised, the verifier blames Sleeper for a local egress
  // policy — the single wrong answer this whole script exists to avoid.
  const call = (over: Partial<Parameters<typeof classifyHttpFailure>[0]> = {}) =>
    classifyHttpFailure({ status: 403, statusText: 'Forbidden', headers: [], bodyText: '', ...over });

  it('recognises a deny-reason header as an intermediary, not as Sleeper', () => {
    // The exact shape this repository's sandbox proxy returns.
    const result = call({
      headers: [
        ['content-type', 'text/plain'],
        ['x-deny-reason', 'host_not_allowed'],
      ],
      bodyText: 'Host not in allowlist: api.sleeper.app.',
    });
    expect(result.classification).toBe('NETWORK_PROXY_BLOCKED');
    expect(result.detail).toContain('never reached Sleeper');
  });

  it('recognises an egress-policy body even with no telltale header', () => {
    const result = call({ bodyText: 'Host not in allowlist: api.sleeper.app. Add this host to your network egress settings.' });
    expect(result.classification).toBe('NETWORK_PROXY_BLOCKED');
  });

  it('treats 407 as an intermediary by definition', () => {
    expect(call({ status: 407, statusText: 'Proxy Authentication Required' }).classification)
      .toBe('NETWORK_PROXY_BLOCKED');
  });

  it('does NOT assume every 403 is a proxy — Sleeper may answer 403 for its own reasons', () => {
    const result = call({ bodyText: '{"error":"forbidden"}', headers: [['content-type', 'application/json']] });
    expect(result.classification).toBe('HTTP_PROVIDER_FAILURE');
    expect(result.detail).toBe('Sleeper answered 403 Forbidden');
  });

  it('attributes an ordinary provider error to the provider', () => {
    const result = call({ status: 503, statusText: 'Service Unavailable', bodyText: 'upstream down' });
    expect(result.classification).toBe('HTTP_PROVIDER_FAILURE');
    expect(result.detail).toContain('503');
  });

  it('matches the deny header case-insensitively', () => {
    expect(call({ headers: [['X-Deny-Reason', 'host_not_allowed']] }).classification).toBe('NETWORK_PROXY_BLOCKED');
  });
});

describe('players payload validation', () => {
  const player = (over: Record<string, unknown> = {}) => ({
    full_name: 'Josh Allen', position: 'QB', team: 'BUF', gsis_id: '00-0034857', ...over,
  });

  it('accepts the real shape: an object map keyed by sleeper player id', () => {
    const verdict = validateSleeperPlayers({ '4984': player(), '4034': player({ full_name: 'Christian McCaffrey', position: 'RB' }) });
    expect(verdict).toEqual({ ok: true, rows: 2, detail: '2/2 entries matched the player schema' });
  });

  it('tolerates the payload’s genuine oddities rather than calling the feed broken', () => {
    // Team defenses carry no name and free agents carry a null team. Both are real Sleeper
    // records, and a verifier that rejected them would report a healthy feed as malformed.
    const verdict = validateSleeperPlayers({
      BUF: { position: 'DEF', team: 'BUF' },
      '9999': player({ team: null }),
    });
    expect(verdict.ok).toBe(true);
  });

  it('rejects an array — the endpoint returns a keyed map, not a list', () => {
    expect(validateSleeperPlayers([player()])).toEqual({
      ok: false,
      detail: 'expected an object map keyed by sleeper player id',
    });
  });

  it('rejects an empty map instead of reporting zero players as success', () => {
    expect(validateSleeperPlayers({}).ok).toBe(false);
  });

  it('fails when the bulk of the payload does not parse', () => {
    const broken = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i), 'not an object']));
    const verdict = validateSleeperPlayers(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain('0/20');
  });
});

describe('trending payload validation', () => {
  it('accepts the documented shape and labels it as activity, not value', () => {
    const verdict = validateSleeperTrending([{ player_id: '4984', count: 1200 }]);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.detail).toContain('never a dynasty value');
  });

  it('treats an empty window as a quiet window, not a malformed response', () => {
    const verdict = validateSleeperTrending([]);
    expect(verdict).toEqual({ ok: true, rows: 0, detail: 'the array is empty — a quiet window, not a malformed response' });
  });

  it('rejects rows that are not { player_id: string, count: number }', () => {
    const verdict = validateSleeperTrending([{ player_id: 4984, count: '1200' }]);
    expect(verdict.ok).toBe(false);
  });

  it('rejects a keyed map — that is the players shape, not the trending shape', () => {
    expect(validateSleeperTrending({ '4984': 1200 }).ok).toBe(false);
  });
});

describe('overall verdict', () => {
  const check = (over: Partial<SleeperCheck> = {}): SleeperCheck => ({
    name: 'players',
    url: 'https://api.sleeper.app/v1/players/nfl',
    purpose: 'identity',
    elapsedMs: 12,
    classification: 'SUCCESS',
    httpStatus: 200,
    rows: 11000,
    detail: 'ok',
    ...over,
  });

  it('is SUCCESS only when every check succeeded', () => {
    expect(summarizeChecks([check(), check({ name: 'trending-add' })], 'https://api.sleeper.app/v1').overall).toBe('SUCCESS');
  });

  it('a single blocked check sinks the run — a partial pass has verified nothing', () => {
    const summary = summarizeChecks(
      [check(), check({ name: 'trending-add', classification: 'NETWORK_PROXY_BLOCKED', httpStatus: null, rows: null })],
      'https://api.sleeper.app/v1',
    );
    expect(summary.overall).toBe('NETWORK_PROXY_BLOCKED');
    expect(summary.advice).toContain('do not remove the integration');
  });

  it('a provider-side failure is named as one, and its advice points at Sleeper', () => {
    const summary = summarizeChecks([check({ classification: 'HTTP_PROVIDER_FAILURE', httpStatus: 503 })], 'https://x');
    expect(summary.overall).toBe('HTTP_PROVIDER_FAILURE');
    expect(summary.advice).toContain('provider-side result');
  });

  it('no checks at all is not silently a pass for anything but an empty run', () => {
    expect(summarizeChecks([], 'https://x').overall).toBe('SUCCESS');
  });
});
