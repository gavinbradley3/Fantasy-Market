// Deterministic CSV decoding (RFC 4180) for the transport layer.
//
// SCOPE — this is STRUCTURAL decode only, exactly like `JSON.parse` is for a JSON payload.
// It turns delimited text into the row-object shape a Phase 4 adapter already expects. It
// knows no field names, no provider vocabulary, and no units; every semantic decision
// (which column means what, how to map an enum, which team abbreviation is canonical)
// remains the adapter's job.
//
// WHY A REAL PARSER. The provider's own exports quote fields that contain commas — e.g. a
// headshot URL `"https://.../f_auto,q_auto/league/..."`. Splitting on commas silently
// shifts every later column in the row, which would corrupt data rather than fail. So the
// parser implements RFC 4180 properly: quoted fields, `""` as an escaped quote, and
// delimiters/CR/LF inside quotes.
//
// TYPING. CSV is a typeless format: every cell arrives as text. A JSON payload would have
// handed the adapter real numbers, nulls and booleans, so the decoder recovers those by
// LEXICAL rules only, with no knowledge of which column it is looking at:
//
//   • empty cell, or a configured null token (nflverse writes `NA`) → `null`
//   • `TRUE` / `FALSE` (the R/CSV boolean spelling these exports use) → boolean
//   • a strict decimal literal                                      → number
//   • anything else                                                 → the string, verbatim
//
// NULL IS NOT ZERO. An empty cell becomes `null`, never `0`. That distinction is
// load-bearing all the way to the engines (a player with no recorded carries is not a
// player with zero carries), so it is fixed here at the boundary rather than downstream.
//
// IDENTIFIERS STAY STRINGS. The decimal rule deliberately rejects leading zeros, so
// provider identifiers keep their exact text: `00-0034857` (a GSIS id) and `007` are
// strings, while `31`, `-3`, `0.482` and `31.0` are numbers. Without that rule a numeric
// provider id would silently become a number and fail every string-keyed identity join.

import { TransportError } from './errors';
import type { RawPayloadEnvelope } from './types';

/** A decoded cell: the JSON-equivalent value a typed payload would have carried. */
export type CsvValue = string | number | boolean | null;

export interface CsvOptions {
  /** Field delimiter. Default `,`. */
  readonly delimiter?: string;
  /**
   * Cell texts that mean "no value" for this provider, in addition to the empty cell.
   * Compared case-sensitively and after trimming. nflverse uses `NA`.
   */
  readonly nullTokens?: readonly string[];
}

/**
 * A strict decimal literal: optional sign, then either `0` or a non-zero-leading integer,
 * then an optional fractional part. No exponent, no leading `+`, no leading zeros, no
 * whitespace — so identifier-shaped tokens are never mistaken for numbers.
 */
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function typeCell(text: string, nullTokens: ReadonlySet<string>): CsvValue {
  if (text.length === 0) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (nullTokens.has(trimmed)) return null;
  if (trimmed === 'TRUE') return true;
  if (trimmed === 'FALSE') return false;
  if (DECIMAL.test(trimmed)) return Number(trimmed);
  return text;
}

/**
 * Split CSV text into rows of raw cell strings, per RFC 4180.
 *
 * Handles LF, CRLF and lone-CR line endings, quoted fields containing delimiters and
 * newlines, and `""` as an escaped quote. A trailing newline does not produce an empty
 * final row. A UTF-8 BOM is stripped.
 */
export function splitCsvRows(input: string, delimiter: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // True only at a position where no character of the current field has been consumed yet,
  // which is the only place an opening quote is meaningful.
  let fieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped pair
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      fieldStart = true;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF is one terminator
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStart = true;
      continue;
    }

    field += ch;
    fieldStart = false;
  }

  // A final field/row is pending unless the text ended exactly on a row terminator.
  if (inQuotes || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvDecodeResult {
  /** Header names, in file order. */
  readonly columns: readonly string[];
  /** One object per data row, keys in header order, values lexically typed. */
  readonly rows: readonly Record<string, CsvValue>[];
}

/**
 * Parse CSV text into typed row objects. Purely structural and fully deterministic: row
 * order is file order and key order is header order, so the same bytes always decode to
 * the same rows.
 *
 * Structural defects are reported, never smoothed over — a duplicated header and a ragged
 * row are both signs of a corrupt or truncated payload, and silently dropping either would
 * hide missing data behind a plausible-looking result.
 */
export function parseCsv(text: string, options: CsvOptions = {}): CsvDecodeResult {
  const delimiter = options.delimiter ?? ',';
  if (delimiter.length !== 1) throw new Error(`csv delimiter must be one character, got ${JSON.stringify(delimiter)}`);
  const nullTokens = new Set(options.nullTokens ?? []);

  const raw = splitCsvRows(text, delimiter);
  if (raw.length === 0) return { columns: [], rows: [] };

  const columns = raw[0].map((c) => c.trim());
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c)) throw new Error(`duplicate CSV column "${c}" — the payload is ambiguous`);
    seen.add(c);
  }

  const rows: Record<string, CsvValue>[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    // A blank trailing line is not a data row.
    if (cells.length === 1 && cells[0].length === 0) continue;
    if (cells.length !== columns.length) {
      // Row numbers are 1-based including the header, matching what a text editor shows.
      throw new Error(
        `CSV row ${r + 1} has ${cells.length} fields but the header declares ${columns.length}`,
      );
    }
    const obj: Record<string, CsvValue> = {};
    for (let c = 0; c < columns.length; c++) obj[columns[c]] = typeCell(cells[c], nullTokens);
    rows.push(obj);
  }
  return { columns, rows };
}

/**
 * Decode an envelope's payload as CSV into adapter-ready rows, mapping any structural
 * defect to a typed, non-retryable DECODE_FAILURE (the bytes are already checksummed and
 * intact — re-fetching identical bytes cannot help).
 */
export function decodeCsvRows(
  envelope: RawPayloadEnvelope,
  text: string,
  options: CsvOptions = {},
): Record<string, CsvValue>[] {
  try {
    return [...parseCsv(text, options).rows];
  } catch (err) {
    throw new TransportError('DECODE_FAILURE', `payload is not valid CSV: ${(err as Error).message}`, {
      provider: envelope.provider,
      capability: envelope.capability,
      requestKey: envelope.requestKey,
      retryable: false,
      stage: 'decode',
    });
  }
}
