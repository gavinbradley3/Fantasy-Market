import { describe, expect, it } from 'vitest';
import { CsvParseError, parseCsv } from '@/services/identity/csv';

describe('parseCsv', () => {
  it('parses plain rows keyed by header', () => {
    const t = parseCsv('a,b,c\n1,2,3\n4,5,6\n');
    expect(t.header).toEqual(['a', 'b', 'c']);
    expect(t.rows).toEqual([
      { a: '1', b: '2', c: '3' },
      { a: '4', b: '5', c: '6' },
    ]);
  });

  it('handles quoted fields with embedded commas, quotes, and newlines', () => {
    const t = parseCsv('name,note\n"Smith, John","said ""hi""\nthen left"\n');
    expect(t.rows[0]).toEqual({ name: 'Smith, John', note: 'said "hi"\nthen left' });
  });

  it('handles CRLF line endings and a missing trailing newline', () => {
    const t = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(t.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('short rows yield undefined cells rather than crashing', () => {
    const t = parseCsv('a,b,c\n1,2\n');
    expect(t.rows[0]).toEqual({ a: '1', b: '2', c: undefined });
  });

  it('rejects empty input and unterminated quotes loudly', () => {
    expect(() => parseCsv('')).toThrow(CsvParseError);
    expect(() => parseCsv('a,b\n"unclosed')).toThrow(CsvParseError);
  });
});
