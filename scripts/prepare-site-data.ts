/**
 * Fail-closed admission gate for the site-data checkout used by Pages deployment.
 *
 * 1. The board is read once and validated against the existing publication schema. Any failure
 *    ends the deploy job before artifact upload, so a missing or malformed board can never
 *    replace the live site.
 * 2. Only PUBLIC_DATA_FILES are copied. The external market capture is never deployed.
 * 3. Uncalibrated confidence/volatility fields are redacted from the deployed copy
 *    (REDACTED_BOARD_FIELDS). The canonical board on the data branch is not modified.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationResponseSchema } from '../src/services/api/publication';
import { PUBLIC_DATA_FILES, REDACTED_BOARD_FIELDS } from '../src/config/release';

interface Args {
  source: string;
  destination: string;
}

function parseArgs(argv: readonly string[]): Args {
  let source: string | undefined;
  let destination: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const value = () => argv[++i];
    switch (argv[i]) {
      case '--source': source = value(); break;
      case '--destination': destination = value(); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!source || !destination) throw new Error('usage: --source <site-data> --destination <dist/data>');
  return { source: resolve(source), destination: resolve(destination) };
}

export interface PrepareResult {
  readonly entryCount: number;
  readonly redactedFieldCount: number;
  readonly copied: readonly string[];
}

/** Null every redacted field on every entry. Returns how many non-null values were removed. */
export function redactBoard(document: { entries: Record<string, unknown>[] }): number {
  let removed = 0;
  for (const entry of document.entries) {
    for (const field of REDACTED_BOARD_FIELDS) {
      if (field in entry && entry[field] !== null) removed += 1;
      if (field in entry) entry[field] = null;
    }
  }
  return removed;
}

export function prepareSiteData(args: Args): PrepareResult {
  const boardPath = join(args.source, 'board.json');
  if (!existsSync(boardPath)) throw new Error(`required board is missing: ${boardPath}`);

  const text = readFileSync(boardPath, 'utf8');
  if (text.trim() === '') throw new Error('required board.json is empty');

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('required board.json is malformed JSON', { cause: error });
  }

  const parsed = publicationResponseSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(
      `required board.json violates the publication contract: ${parsed.error.issues[0]?.message ?? 'invalid structure'}`,
    );
  }
  const { entryCount } = parsed.data.publication;
  if (!Number.isInteger(entryCount) || entryCount <= 0) {
    throw new Error(`required board.json declares invalid entryCount ${entryCount}`);
  }
  if (parsed.data.entries.length === 0) throw new Error('required board.json contains no entries');
  if (entryCount !== parsed.data.entries.length) {
    throw new Error(
      `required board.json entryCount mismatch: declares ${entryCount}, contains ${parsed.data.entries.length}`,
    );
  }

  // Redact the RAW document (not the schema output), so fields the schema does not know about
  // pass through untouched and only the listed fields change.
  const raw = document as { entries: Record<string, unknown>[] };
  const redactedFieldCount = redactBoard(raw);

  mkdirSync(args.destination, { recursive: true });
  writeFileSync(join(args.destination, 'board.json'), JSON.stringify(raw));
  const copied: string[] = ['board.json'];

  for (const file of PUBLIC_DATA_FILES) {
    if (file === 'board.json') continue;
    const path = join(args.source, file);
    if (existsSync(path)) {
      writeFileSync(join(args.destination, file), readFileSync(path));
      copied.push(file);
    } else {
      console.warn(`::warning::optional ${file} is unavailable`);
    }
  }

  return { entryCount, redactedFieldCount, copied };
}

function main(): void {
  try {
    const result = prepareSiteData(parseArgs(process.argv.slice(2)));
    console.log(
      `board.json admitted: ${result.entryCount} entries; ${result.redactedFieldCount} uncalibrated values redacted; ` +
        `deployed files: ${result.copied.join(', ')}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::deployment data gate rejected site-data: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
