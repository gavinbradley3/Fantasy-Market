// Network access for the market layer — the ONLY file here that touches the wire.
//
// Kept apart from `./dynastyProcess` on purpose: the adapter stays pure and therefore
// testable and replayable offline, while everything non-deterministic (a socket, a clock)
// lives here and is injected into it. `src/market/boundary.test.ts` enforces the split.
//
// LICENSING. These files come from github.com/dynastyprocess/data, which is GPL-3.0 and
// states it exists "for the purpose of supporting apps and developers". The VALUES themselves
// originate from FantasyPros expert consensus, whose republication rights DynastyProcess's own
// licence does not settle — see docs/MARKET_DATA_SOURCES.md. Nothing here bulk-exposes the
// source dataset; the ingestion path stores only the fields PlayerTicker actually compares.

/** DynastyProcess's published dynasty value table (both formats, with its own scrape_date). */
export const DYNASTYPROCESS_VALUES_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv';

/** The id crosswalk published in the same repository: fantasypros_id ↔ gsis_id and friends. */
export const DYNASTYPROCESS_IDS_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

/**
 * Minimal RFC4180-ish CSV reader: quoted fields, embedded commas, doubled quotes, CRLF.
 *
 * Exported because it is the part worth testing — a hand-rolled split(',') would corrupt any
 * player whose name contains a comma, and that corruption would look like a missing player
 * rather than a parse bug.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  // A row whose arity disagrees with the header is malformed; it is dropped rather than
  // zipped against the wrong columns, which would silently mis-assign values to players.
  return rows.slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

export interface FetchOptions {
  /** Injectable so the ingestion path can be exercised without a socket. */
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

/** GET one CSV resource and parse it. A non-2xx is an error, never an empty dataset. */
export async function fetchCsv(url: string, options: FetchOptions = {}): Promise<Record<string, string>[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const res = await fetchFn(url, { headers: { accept: 'text/csv' }, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim().length === 0) throw new Error(`${url} → empty body`);
    return parseCsv(text);
  } finally {
    clearTimeout(timer);
  }
}
