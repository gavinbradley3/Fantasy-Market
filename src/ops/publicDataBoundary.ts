import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PUBLIC_DATA_FILES } from '../config/release';

/** Fail closed without deleting private/stale artifacts. Deployment must use a clean output. */
export function assertPublicDataDirectory(directory: string): void {
  if (!existsSync(directory)) return;
  if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) {
    throw new Error('public data destination must be a real directory, not a symlink');
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !(PUBLIC_DATA_FILES as readonly string[]).includes(entry.name)) {
      throw new Error(`public data directory contains non-release artifact: ${entry.name}; use a clean destination`);
    }
  }
}

/** Vite's public directory is copied verbatim, so screen it before the build as well. */
export function assertNoPublicMarketArtifacts(directory: string): void {
  if (!existsSync(directory)) return;
  if (lstatSync(directory).isSymbolicLink()) throw new Error('public asset directory cannot be a symlink');
  function inspect(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`public asset cannot be a symlink: ${relative(directory, path)}`);
      if (/market(?:$|[-_.])|dynastyprocess|fantasypros|comparison/i.test(entry.name)) {
        throw new Error(`external-market artifact is excluded from this release: ${relative(directory, path)}`);
      }
      if (entry.isDirectory()) {
        if (entry.name === 'data') assertPublicDataDirectory(path);
        inspect(path);
      }
    }
  }
  inspect(directory);
}
