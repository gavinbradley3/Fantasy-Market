// CSV decoding and the fetch wrapper.
//
// The parser is worth testing because its failure mode is invisible: a naive `split(',')`
// corrupts exactly the players whose names contain a comma, and the corruption presents as a
// missing player rather than as a parse error.

import { describe, expect, it, vi } from 'vitest';
import { fetchCsv, parseCsv, DYNASTYPROCESS_IDS_URL, DYNASTYPROCESS_VALUES_URL } from './fetch';

describe('parseCsv', () => {
  it('reads a plain table into keyed rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps a quoted field containing a comma intact', () => {
    const rows = parseCsv('player,team\n"Robinson, Bijan",ATL\n');
    expect(rows[0].player).toBe('Robinson, Bijan');
    expect(rows[0].team).toBe('ATL');
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('name\n"He said ""hi"""\n')[0].name).toBe('He said "hi"');
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('reads a final row with no trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([{ a: '1' }]);
  });

  it('drops a row whose arity disagrees with the header rather than mis-assigning columns', () => {
    // Zipping a short row against the header would put one player's value on another's row.
    expect(parseCsv('a,b,c\n1,2\n1,2,3\n')).toEqual([{ a: '1', b: '2', c: '3' }]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns nothing for a header with no data rows', () => {
    expect(parseCsv('a,b\n')).toEqual([]);
  });
});

describe('fetchCsv', () => {
  const ok = (body: string) =>
    vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } })) as unknown as typeof fetch;

  it('fetches and parses', async () => {
    const rows = await fetchCsv('https://example.test/x.csv', { fetchFn: ok('a,b\n1,2\n') });
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('treats a non-2xx as an error, never as an empty dataset', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchCsv('https://example.test/x.csv', { fetchFn })).rejects.toThrow('HTTP 404');
  });

  it('treats an empty 200 body as an error — a silent empty market is worse than a failure', async () => {
    await expect(fetchCsv('https://example.test/x.csv', { fetchFn: ok('   ') })).rejects.toThrow('empty body');
  });
});

describe('source urls', () => {
  it('point at DynastyProcess’s published files, over HTTPS, with no credentials', () => {
    for (const url of [DYNASTYPROCESS_VALUES_URL, DYNASTYPROCESS_IDS_URL]) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).not.toMatch(/[?&](token|key|auth)=/);
    }
    expect(DYNASTYPROCESS_VALUES_URL).toContain('values-players.csv');
    expect(DYNASTYPROCESS_IDS_URL).toContain('db_playerids.csv');
  });
});
