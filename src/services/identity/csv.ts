// Minimal RFC 4180 CSV parser for nflverse datasets. Zero dependencies on
// purpose: the repo has no CSV library, the ingestion script is the only
// production consumer, and nflverse CSVs are plain comma-separated files with
// quoted fields. Handles quoted fields, escaped quotes (""), embedded commas
// and newlines, and both \n and \r\n line endings. Anything fancier belongs to
// a real library — if this parser ever needs more features, add one instead.

export interface CsvTable {
  header: string[];
  /** Row objects keyed by header name. Short rows yield undefined cells. */
  rows: Record<string, string | undefined>[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      i++;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) throw new CsvParseError('Unterminated quoted field at end of input');
  // Flush a trailing record with no final newline.
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

/** Parse CSV text into header-keyed row objects. Empty lines are skipped. */
export function parseCsv(text: string): CsvTable {
  const records = parseRecords(text).filter((r) => !(r.length === 1 && r[0] === ''));
  if (records.length === 0) throw new CsvParseError('CSV input is empty');
  const [header, ...body] = records;
  const rows = body.map((cells) => {
    const row: Record<string, string | undefined> = {};
    header.forEach((name, idx) => {
      row[name] = cells[idx];
    });
    return row;
  });
  return { header, rows };
}
