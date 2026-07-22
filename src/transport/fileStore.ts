// Filesystem RawPayloadStore (Phase 5) — a simple, deterministic on-disk cache for local
// replay. One JSON file per captured envelope, named by its coordinate + checksum, so a
// payload captured in one process can be replayed in another WITHOUT the network. This is
// NOT database persistence (Phase 6+): no schema, no migrations, no indexes beyond the
// filenames. Imported directly (`@/transport/fileStore`) rather than from the browser-safe
// barrel, because it depends on `node:fs`.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from '@/inference/util/checksum';
import { requestCoordinate, selectLatest, type RawPayloadStore } from './store';
import type { RawPayloadEnvelope } from './types';

/** Filesystem-safe token from an arbitrary provider/capability/requestKey string. */
function safe(token: string): string {
  return token.replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Deterministic file name: coordinate parts + a requestKey digest + the checksum. */
function fileName(env: RawPayloadEnvelope): string {
  return `${safe(env.provider)}__${safe(env.capability)}__${digest(env.requestKey)}__${safe(env.payloadChecksum)}.json`;
}

function coordPrefix(provider: string, capability: string, requestKey: string): string {
  return `${safe(provider)}__${safe(capability)}__${digest(requestKey)}__`;
}

export class FilePayloadStore implements RawPayloadStore {
  constructor(private readonly dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  put(envelope: RawPayloadEnvelope): Promise<void> {
    const path = join(this.dir, fileName(envelope));
    // Idempotent: identical bytes → identical filename → a stable, byte-deterministic file.
    if (!existsSync(path)) {
      writeFileSync(path, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
    }
    return Promise.resolve();
  }

  getByChecksum(checksum: string): Promise<RawPayloadEnvelope | null> {
    const suffix = `__${safe(checksum)}.json`;
    for (const name of this.listFiles()) {
      if (name.endsWith(suffix)) return Promise.resolve(this.read(name));
    }
    return Promise.resolve(null);
  }

  getLatest(
    provider: RawPayloadEnvelope['provider'],
    capability: RawPayloadEnvelope['capability'],
    requestKey: string,
  ): Promise<RawPayloadEnvelope | null> {
    const prefix = coordPrefix(provider, capability, requestKey);
    const candidates: RawPayloadEnvelope[] = [];
    for (const name of this.listFiles()) {
      if (!name.startsWith(prefix)) continue;
      const env = this.read(name);
      // Guard against a hash-prefix collision by confirming the exact coordinate.
      if (env && requestCoordinate(env) === `${provider}|${capability}|${requestKey}`) candidates.push(env);
    }
    return Promise.resolve(selectLatest(candidates));
  }

  private listFiles(): string[] {
    if (!existsSync(this.dir)) return [];
    // Sort for deterministic iteration order across platforms.
    return readdirSync(this.dir).filter((n) => n.endsWith('.json')).sort();
  }

  private read(name: string): RawPayloadEnvelope | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as RawPayloadEnvelope;
    } catch {
      return null;
    }
  }
}
