// CSV decode tests. The provider's real exports quote fields containing commas and leave
// missing cells empty, so these cover the cases that would silently corrupt data rather
// than fail: quoting, raggedness, and the null-versus-zero distinction.

import { describe, expect, it } from 'vitest';
import { parseCsv, splitCsvRows, decodeCsvRows } from './csv';
import type { RawPayloadEnvelope } from './types';

describe('splitCsvRows — RFC 4180', () => {
  it('splits plain rows on LF, CRLF and lone CR', () => {
    expect(splitCsvRows('a,b\n1,2\n', ',')).toEqual([['a', 'b'], ['1', '2']]);
    expect(splitCsvRows('a,b\r\n1,2\r\n', ',')).toEqual([['a', 'b'], ['1', '2']]);
    expect(splitCsvRows('a,b\r1,2', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps a quoted field containing the delimiter intact', () => {
    // Verbatim shape of an nflverse headshot URL — the case a naive split corrupts.
    const row = splitCsvRows('id,url,pos\n7,"https://x/f_auto,q_auto/league/abc",QB\n', ',');
    expect(row[1]).toEqual(['7', 'https://x/f_auto,q_auto/league/abc', 'QB']);
  });

  it('handles escaped quotes and embedded newlines inside a quoted field', () => {
    expect(splitCsvRows('a\n"say ""hi"""\n', ',')[1]).toEqual(['say "hi"']);
    expect(splitCsvRows('a,b\n"one\ntwo",3\n', ',')[1]).toEqual(['one\ntwo', '3']);
  });

  it('does not emit a phantom row for a trailing newline, and strips a BOM', () => {
    expect(splitCsvRows('a\n1\n', ',')).toHaveLength(2);
    expect(splitCsvRows('﻿a,b\n1,2\n', ',')[0]).toEqual(['a', 'b']);
  });
});

describe('parseCsv — typing', () => {
  const rows = (text: string) => parseCsv(text, { nullTokens: ['NA'] }).rows;

  it('an empty cell and a null token become null, never zero', () => {
    const [r] = rows('carries,targets,team\n,NA,CIN\n');
    expect(r.carries).toBeNull();
    expect(r.targets).toBeNull();
    // The distinction that matters: a genuine zero stays a zero.
    expect(rows('carries\n0\n')[0].carries).toBe(0);
  });

  it('reads decimals and negatives as numbers', () => {
    const [r] = rows('a,b,c,d\n31,31.0,-3,0.482\n');
    expect(r).toEqual({ a: 31, b: 31, c: -3, d: 0.482 });
  });

  it('keeps identifier-shaped tokens as strings', () => {
    // A GSIS id and a zero-padded number must survive as text, or every identity join
    // keyed on them silently fails.
    const [r] = rows('gsis,jersey,game\n00-0034857,007,2025_01_DAL_PHI\n');
    expect(r.gsis).toBe('00-0034857');
    expect(r.jersey).toBe('007');
    expect(r.game).toBe('2025_01_DAL_PHI');
  });

  it('reads the R/CSV boolean spelling', () => {
    expect(rows('x,y\nTRUE,FALSE\n')[0]).toEqual({ x: true, y: false });
  });

  it('preserves file row order and header key order', () => {
    const parsed = parseCsv('b,a\n2,1\n4,3\n');
    expect(parsed.columns).toEqual(['b', 'a']);
    expect(Object.keys(parsed.rows[0])).toEqual(['b', 'a']);
    expect(parsed.rows.map((r) => r.b)).toEqual([2, 4]);
  });

  it('is byte-deterministic: the same text always decodes identically', () => {
    const text = 'a,b\n1,x\n2,\n';
    expect(parseCsv(text)).toEqual(parseCsv(text));
  });
});

describe('parseCsv — structural defects are reported, not smoothed over', () => {
  it('rejects a ragged row rather than dropping data', () => {
    // A short row is the signature of a truncated download; accepting it would publish a
    // partial file as if it were whole.
    expect(() => parseCsv('a,b,c\n1,2\n')).toThrow(/row 2 has 2 fields/);
  });

  it('rejects a duplicated column as ambiguous', () => {
    expect(() => parseCsv('a,a\n1,2\n')).toThrow(/duplicate CSV column/);
  });

  it('ignores a blank trailing line', () => {
    expect(parseCsv('a,b\n1,2\n\n').rows).toHaveLength(1);
  });

  it('an empty payload yields no rows rather than throwing', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
  });
});

describe('decodeCsvRows', () => {
  const envelope = { provider: 'nflverse', capability: 'games', requestKey: 'k' } as RawPayloadEnvelope;

  it('maps a structural defect to a non-retryable DECODE_FAILURE', () => {
    // The bytes are already checksummed and intact, so re-fetching them cannot help.
    try {
      decodeCsvRows(envelope, 'a,b\n1\n');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { code: string }).code).toBe('DECODE_FAILURE');
      expect((err as { retryable: boolean }).retryable).toBe(false);
    }
  });

  it('returns adapter-ready rows on success', () => {
    expect(decodeCsvRows(envelope, 'gsis_id,carries\n00-1,12\n', { nullTokens: ['NA'] })).toEqual([
      { gsis_id: '00-1', carries: 12 },
    ]);
  });
});
