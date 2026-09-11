// Sleeper verification logic — pure, offline, and therefore testable.
//
// The script that uses it (`npm run verify:sleeper`) opens sockets; this module does not. It
// answers two questions about whatever came back: what KIND of failure was this, and does the
// body match the schema the pipeline validates with. Keeping them apart is what lets the
// failure taxonomy be unit-tested without pretending to be a network.
//
// WHY THE TAXONOMY MATTERS HERE SPECIFICALLY
// In the Claude Code sandbox, `api.sleeper.app` is refused by an organization egress policy
// before any packet reaches Sleeper. Collapsing that into "Sleeper is down" would be a false
// statement about a third party, and — worse — an argument for deleting a working integration.
// So an intermediary's refusal, a DNS/TLS fault, and a real answer from Sleeper are three
// different verdicts, and this module keeps them apart.

import { sleeperPlayerSchema } from '@/pipeline/providers/sleeper/schema';

export type SleeperClassification =
  /** Sleeper answered and the body matched the schema. */
  | 'SUCCESS'
  /** An intermediary (proxy/egress policy) refused before Sleeper was reached. */
  | 'NETWORK_PROXY_BLOCKED'
  /** The name would not resolve, or the TLS handshake failed. */
  | 'DNS_TLS_FAILURE'
  /** Sleeper itself answered with a non-2xx status. */
  | 'HTTP_PROVIDER_FAILURE'
  /** Sleeper answered 2xx but the body is not the shape the pipeline consumes. */
  | 'SCHEMA_MISMATCH'
  /** No answer within the deadline. */
  | 'TIMEOUT'
  /** A socket-level failure that is none of the above; reported rather than guessed at. */
  | 'NETWORK_UNREACHABLE';

export interface SleeperCheck {
  readonly name: string;
  readonly url: string;
  readonly purpose: string;
  readonly elapsedMs: number;
  readonly classification: SleeperClassification;
  readonly httpStatus: number | null;
  readonly rows: number | null;
  readonly detail: string;
}

export interface SleeperVerificationSummary {
  readonly baseUrl: string;
  readonly overall: SleeperClassification;
  readonly checks: readonly SleeperCheck[];
  readonly advice: string;
}

/** Walk an error's `cause` chain collecting codes and messages — Node's fetch nests them. */
function errorTrail(err: unknown): { codes: string[]; message: string } {
  const codes: string[] = [];
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== null && current !== undefined && depth < 8; depth++) {
    if (typeof current !== 'object') break;
    const e = current as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === 'string') codes.push(e.code.toUpperCase());
    if (typeof e.name === 'string') codes.push(e.name.toUpperCase());
    if (typeof e.message === 'string') messages.push(e.message);
    current = e.cause;
  }
  return { codes, message: messages.join(' | ') };
}

const PROXY_CODES = ['ERR_PROXY_CONNECTION_FAILED', 'EPROXYAUTH'];
const DNS_CODES = ['ENOTFOUND', 'EAI_AGAIN'];
const TLS_CODE_PREFIXES = ['ERR_TLS', 'CERT_', 'UNABLE_TO_', 'SELF_SIGNED', 'ERR_SSL', 'DEPTH_ZERO'];

/**
 * Classify a thrown transport error.
 *
 * The proxy check comes first, and matches on the intermediary's own vocabulary (a 403/407 on
 * CONNECT, or an explicit proxy code). An org egress policy that refuses CONNECT looks, from
 * the socket's point of view, a lot like an unreachable host — and reporting it as one would
 * blame Sleeper for a local configuration decision.
 */
export function classifySleeperFailure(err: unknown): { classification: SleeperClassification; detail: string } {
  const { codes, message } = errorTrail(err);
  const haystack = `${codes.join(' ')} ${message}`.toUpperCase();

  if (codes.includes('ABORTERROR') || codes.includes('TIMEOUTERROR')) {
    return { classification: 'TIMEOUT', detail: `no response before the deadline (${message || 'aborted'})` };
  }
  if (
    PROXY_CODES.some((c) => codes.includes(c)) ||
    /\bPROXY\b/.test(haystack) ||
    /CONNECT.*\b(403|407)\b|\b(403|407)\b.*CONNECT/.test(haystack)
  ) {
    return {
      classification: 'NETWORK_PROXY_BLOCKED',
      detail:
        `an intermediary refused the connection before Sleeper was reached (${message || codes.join(', ')}). ` +
        'This says nothing about Sleeper: re-run from a host with open egress.',
    };
  }
  if (DNS_CODES.some((c) => codes.includes(c))) {
    return { classification: 'DNS_TLS_FAILURE', detail: `the hostname would not resolve (${codes.join(', ')})` };
  }
  if (codes.some((c) => TLS_CODE_PREFIXES.some((p) => c.startsWith(p)))) {
    return { classification: 'DNS_TLS_FAILURE', detail: `the TLS handshake failed (${codes.join(', ')})` };
  }
  return {
    classification: 'NETWORK_UNREACHABLE',
    detail: `socket-level failure (${codes.join(', ') || 'no code'}): ${message || 'no message'}`,
  };
}

/**
 * Classify a NON-2xx response.
 *
 * Necessary because an intermediary does not always fail the socket. This repository's own
 * sandbox proxy terminates TLS and answers the request itself with `403` plus
 * `x-deny-reason: host_not_allowed` — from `fetch`'s point of view a perfectly ordinary HTTP
 * response, which a thrown-error classifier never sees. Reporting that as
 * `HTTP_PROVIDER_FAILURE` would blame Sleeper for a local policy decision, which is precisely
 * what this verifier exists to prevent.
 *
 * EVIDENCE IS REQUIRED, in both directions. Treating every 403 as a proxy block would be the
 * mirror-image error — Sleeper is entitled to answer 403 for its own reasons. So an
 * intermediary is named only when the response says so: a proxy-authentication status, a
 * deny-reason header, or a plain-text body in the vocabulary of egress policy. Otherwise the
 * answer is attributed to the provider, where it belongs.
 */
export function classifyHttpFailure(input: {
  status: number;
  statusText?: string;
  headers: Iterable<readonly [string, string]>;
  bodyText: string;
}): { classification: SleeperClassification; detail: string } {
  const headers = [...input.headers].map(([k, v]) => [k.toLowerCase(), v] as const);

  // 407 is defined as "a proxy wants credentials" — it can only come from an intermediary.
  if (input.status === 407) {
    return {
      classification: 'NETWORK_PROXY_BLOCKED',
      detail: 'a proxy demanded authentication (407) — the request never reached Sleeper',
    };
  }

  const denyHeader = headers.find(([k]) => k.includes('deny-reason') || k.startsWith('x-proxy') || k === 'proxy-authenticate');
  if (denyHeader) {
    return {
      classification: 'NETWORK_PROXY_BLOCKED',
      detail:
        `an intermediary refused the request (${input.status}, ${denyHeader[0]}: ${denyHeader[1]}) — ` +
        'it never reached Sleeper. Re-run from a host with open egress.',
    };
  }

  const body = input.bodyText.slice(0, 500);
  if (/not in allowlist|not allowed|egress|blocked by|access denied by proxy|proxy/i.test(body)) {
    return {
      classification: 'NETWORK_PROXY_BLOCKED',
      detail:
        `an intermediary answered ${input.status} with an egress-policy message ("${body.trim().slice(0, 120)}") — ` +
        'the request never reached Sleeper. Re-run from a host with open egress.',
    };
  }

  return {
    classification: 'HTTP_PROVIDER_FAILURE',
    detail: `Sleeper answered ${input.status}${input.statusText ? ` ${input.statusText}` : ''}`,
  };
}

export type ValidationVerdict =
  | { ok: true; rows: number; detail: string }
  | { ok: false; detail: string };

/**
 * Validate `GET /players/nfl` — an object map keyed by Sleeper player id.
 *
 * Validated the way the pipeline does: PER RECORD, against the same lenient schema, because
 * the real payload holds ~11k entries of wildly varying shape (team defenses have no name,
 * free agents have `team: null`). One odd entry is not a broken feed. A payload is called a
 * schema mismatch only when it is not a keyed map at all, or when almost nothing in it parses.
 */
export function validateSleeperPlayers(body: unknown): ValidationVerdict {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, detail: 'expected an object map keyed by sleeper player id' };
  }
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, detail: 'the player map is empty' };

  let parsed = 0;
  for (const [key, value] of entries) {
    // The map key is the player id; Sleeper repeats it inside the record, and the schema
    // requires it there, so a record missing it is filled from the key exactly as the
    // transport decoder does before validation.
    const candidate = value !== null && typeof value === 'object' ? { player_id: key, ...(value as object) } : value;
    if (sleeperPlayerSchema.safeParse(candidate).success) parsed++;
  }

  const share = parsed / entries.length;
  if (share < 0.9) {
    return { ok: false, detail: `only ${parsed}/${entries.length} entries matched the player schema` };
  }
  return { ok: true, rows: entries.length, detail: `${parsed}/${entries.length} entries matched the player schema` };
}

/** Validate a trending endpoint — an array of `{ player_id, count }`. */
export function validateSleeperTrending(body: unknown): ValidationVerdict {
  if (!Array.isArray(body)) return { ok: false, detail: 'expected an array of { player_id, count }' };
  if (body.length === 0) {
    // Legitimately possible (a quiet lookback window), so it is not a failure — but it is
    // worth saying out loud rather than reporting a confident zero.
    return { ok: true, rows: 0, detail: 'the array is empty — a quiet window, not a malformed response' };
  }
  const bad = body.filter((row) => {
    if (row === null || typeof row !== 'object') return true;
    const r = row as { player_id?: unknown; count?: unknown };
    return typeof r.player_id !== 'string' || typeof r.count !== 'number';
  });
  if (bad.length > 0) {
    return { ok: false, detail: `${bad.length}/${body.length} rows are not { player_id: string, count: number }` };
  }
  return { ok: true, rows: body.length, detail: `${body.length} trending rows — an ACTIVITY signal, never a dynasty value` };
}

/**
 * Reduce the individual checks to one verdict.
 *
 * The worst classification wins, in the order below: a run where identity succeeded but the
 * proxy blocked trending has not verified Sleeper, and saying otherwise would be the exact
 * kind of optimistic rounding this script exists to prevent.
 */
const SEVERITY: readonly SleeperClassification[] = [
  'NETWORK_PROXY_BLOCKED',
  'DNS_TLS_FAILURE',
  'TIMEOUT',
  'NETWORK_UNREACHABLE',
  'HTTP_PROVIDER_FAILURE',
  'SCHEMA_MISMATCH',
  'SUCCESS',
];

const ADVICE: Readonly<Record<SleeperClassification, string>> = {
  SUCCESS: 'Sleeper is reachable and its responses match the schemas the pipeline validates with.',
  NETWORK_PROXY_BLOCKED:
    'Blocked by an intermediary, not by Sleeper. Re-run this command from a machine with open ' +
    'outbound HTTPS. Do NOT treat this as a Sleeper outage and do not remove the integration.',
  DNS_TLS_FAILURE:
    'The connection failed before HTTP: check DNS resolution and the CA bundle on this host.',
  TIMEOUT: 'No response within the deadline. Re-run with a longer --timeout before concluding anything.',
  NETWORK_UNREACHABLE: 'A socket-level failure that is neither a proxy refusal nor a DNS/TLS fault.',
  HTTP_PROVIDER_FAILURE:
    'Sleeper answered, but not with success — this one IS a provider-side result. Check Sleeper status ' +
    'and whether the endpoint path has changed.',
  SCHEMA_MISMATCH:
    'Sleeper answered 2xx with a body the pipeline does not recognise. The adapter schema in ' +
    'src/pipeline/providers/sleeper/schema.ts needs review before the data is trusted.',
};

export function summarizeChecks(checks: readonly SleeperCheck[], baseUrl: string): SleeperVerificationSummary {
  const overall =
    SEVERITY.find((c) => checks.some((check) => check.classification === c)) ?? 'SUCCESS';
  return { baseUrl, overall, checks, advice: ADVICE[overall] };
}
