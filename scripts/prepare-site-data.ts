/**
 * Fail-closed admission gate for the immutable site-data checkout used by Pages deployment.
 * The board is read once, validated with the existing publication schema, then those exact
 * bytes are copied into the build. Supplementary documents remain optional.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { publicationResponseSchema } from '../src/services/api/publication';

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

export function prepareSiteData(args: Args): { entryCount: number; boardBytes: number } {
  const boardPath = join(args.source, 'board.json');
  if (!existsSync(boardPath)) throw new Error(`required board is missing: ${boardPath}`);

  // Keep the original buffer: validation must not reserialize or otherwise change the bytes
  // that become the deployed board.
  const boardBytes = readFileSync(boardPath);
  if (boardBytes.toString('utf8').trim() === '') throw new Error('required board.json is empty');

  let document: unknown;
  try {
    document = JSON.parse(boardBytes.toString('utf8')) as unknown;
  } catch (error) {
    throw new Error('required board.json is malformed JSON', { cause: error });
  }

  const parsed = publicationResponseSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(`required board.json violates the publication contract: ${parsed.error.issues[0]?.message ?? 'invalid structure'}`);
  }
  const { entryCount } = parsed.data.publication;
  if (!Number.isInteger(entryCount) || entryCount <= 0) {
    throw new Error(`required board.json declares invalid entryCount ${entryCount}`);
  }
  if (parsed.data.entries.length === 0) throw new Error('required board.json contains no entries');
  if (entryCount !== parsed.data.entries.length) {
    throw new Error(`required board.json entryCount mismatch: declares ${entryCount}, contains ${parsed.data.entries.length}`);
  }

  mkdirSync(args.destination, { recursive: true });
  writeFileSync(join(args.destination, 'board.json'), boardBytes);

  // These documents are deliberately supplementary: their absence never weakens or blocks a
  // valid board deployment.
  for (const file of ['status.json', 'market-latest.json']) {
    const path = join(args.source, file);
    if (existsSync(path)) writeFileSync(join(args.destination, basename(path)), readFileSync(path));
    else console.warn(`::warning::optional ${file} is unavailable`);
  }

  return { entryCount, boardBytes: boardBytes.length };
}

function main(): void {
  try {
    const result = prepareSiteData(parseArgs(process.argv.slice(2)));
    console.log(`board.json admitted: ${result.entryCount} entries, ${result.boardBytes} exact bytes copied`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::PT-09 deployment data gate rejected site-data: ${message}`);
    process.exitCode = 1;
  }
}

main();
