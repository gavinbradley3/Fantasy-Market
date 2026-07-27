/**
 * PlayerTicker local API server (Phase 10).
 *
 *   npm run serve:api
 *
 * A LOCAL DEVELOPMENT entry point, deliberately deployment-neutral: it composes the audited
 * Phase 9 stack, opens a port, and shuts down cleanly. It implements no hosting, no process
 * management, no TLS, and no authentication.
 *
 * Environment:
 *   PLAYERTICKER_PORT             port to listen on            (default 8787)
 *   PLAYERTICKER_HOST             interface to bind            (default 127.0.0.1)
 *   PLAYERTICKER_DB               SQLite database path         (default .local/playerticker.db)
 *   PLAYERTICKER_ALLOWED_ORIGINS  comma-separated browser origins allowed to call this API.
 *                                 Only needed when the frontend talks to this server DIRECTLY
 *                                 (VITE_PLAYERTICKER_API_URL set to an absolute URL). The
 *                                 default local setup goes through Vite's `/api` proxy, which
 *                                 is same-origin and needs no CORS at all. Unset = CORS off.
 *   PLAYERTICKER_SEED             "1" to run one refresh on startup if the database has
 *                                 nothing published yet, so a fresh clone shows a real board.
 *   PLAYERTICKER_SEASONS          comma-separated seasons to ingest (default 2025). Career
 *                                 counting stats span exactly these seasons.
 *   PLAYERTICKER_CAPTURES         raw payload capture directory (default .local/captures)
 *   PLAYERTICKER_REPLAY_ONLY      "1" to serve from captured payloads only, never the network.
 *   PLAYERTICKER_AS_OF            pin the valuation as-of instant (default: refresh time)
 *
 * The refresh pipeline is the PRODUCTION one: it fetches nflverse's current releases through
 * the transport layer, captures them, and drives the same ingestion → inference → persistence
 * → publication path the scheduler uses. Set PLAYERTICKER_REPLAY_ONLY=1 to work offline from
 * whatever was captured previously.
 *
 * IMPORTING THIS FILE STARTS NOTHING. `main()` runs only under the `import.meta.main`-style
 * guard at the bottom, so tests can import `createLocalServer` without opening a port.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { composeApi, createHttpServer, type ComposedApi } from '@/api';
import { PersistenceStore } from '@/persistence';
import { FilePayloadStore } from '@/transport/fileStore';
import { createLivePipeline } from '@/runtime';
import type { TransportConfigDescriptor } from '@/application';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB = '.local/playerticker.db';
const DEFAULT_CAPTURES = '.local/captures';
const DEFAULT_SEASONS = [2025];

const TRANSPORT: TransportConfigDescriptor = { requiredProviders: ['nflverse'], replayEnabled: true };

export interface LocalServerConfig {
  readonly port: number;
  readonly host: string;
  readonly dbPath: string;
  readonly allowedOrigins: readonly string[];
  readonly seed: boolean;
  readonly seasons: readonly number[];
  readonly capturesDir: string;
  readonly replayOnly: boolean;
  /** Pinned as-of instant, or null to use the refresh time. */
  readonly asOf: string | null;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): LocalServerConfig {
  const port = Number.parseInt(env.PLAYERTICKER_PORT ?? '', 10);
  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    host: env.PLAYERTICKER_HOST || DEFAULT_HOST,
    dbPath: resolve(env.PLAYERTICKER_DB || DEFAULT_DB),
    allowedOrigins: (env.PLAYERTICKER_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    seed: env.PLAYERTICKER_SEED === '1',
    seasons: parseSeasons(env.PLAYERTICKER_SEASONS),
    capturesDir: resolve(env.PLAYERTICKER_CAPTURES || DEFAULT_CAPTURES),
    replayOnly: env.PLAYERTICKER_REPLAY_ONLY === '1',
    asOf: env.PLAYERTICKER_AS_OF && !Number.isNaN(Date.parse(env.PLAYERTICKER_AS_OF))
      ? new Date(env.PLAYERTICKER_AS_OF).toISOString()
      : null,
  };
}

/** Parse the seasons list, falling back to the default rather than ingesting nothing. */
function parseSeasons(raw: string | undefined): number[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v >= 1999 && v <= 2100);
  return parsed.length > 0 ? parsed : DEFAULT_SEASONS;
}

export interface LocalServer {
  readonly composed: ComposedApi;
  readonly server: Server;
  /** Close the HTTP server (owned here) AND the composed backend resources. Idempotent. */
  close(): Promise<void>;
}

/** Build the composed stack + an HTTP server. Does NOT listen — the caller decides. */
export function createLocalServer(config: LocalServerConfig): LocalServer {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.capturesDir, { recursive: true });

  let store: PersistenceStore;
  const composed = composeApi({
    dbPath: config.dbPath,
    transport: TRANSPORT,
    pipeline: createLivePipeline({
      store: () => store,
      payloadStore: new FilePayloadStore(config.capturesDir),
      seasons: config.seasons,
      // A pinned as-of makes every refresh reproducible; otherwise each run values as of
      // the moment it started, which is what a scheduled deployment wants.
      asOf: () => config.asOf ?? new Date().toISOString(),
      replayOnly: config.replayOnly,
    }),
  });
  store = composed.store;

  // The HTTP server handle belongs to THIS caller, not to ComposedApi — see the ownership note
  // on ComposedApi. Shutdown therefore closes both, server first.
  const server = createHttpServer(composed.api, { allowedOrigins: config.allowedOrigins });

  let closing: Promise<void> | null = null;
  return {
    composed,
    server,
    close() {
      if (closing) return closing;
      closing = new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections?.();
      }).then(() => {
        composed.close();
      });
      return closing;
    },
  };
}

/** Run one refresh if the database has nothing published yet. */
async function seedIfEmpty(local: LocalServer): Promise<void> {
  if (local.composed.store.getCurrentPublicationRecord()) {
    console.log('[playerticker] a publication already exists — not seeding');
    return;
  }
  const ack = await local.composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
  const body = ack.body as { published?: boolean; publicationId?: string | null };
  console.log(
    body.published
      ? `[playerticker] seeded publication ${body.publicationId}`
      : `[playerticker] seed refresh did not publish: ${JSON.stringify(body)}`,
  );
}

async function main(): Promise<void> {
  const config = readConfig();
  const local = createLocalServer(config);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[playerticker] ${signal} received — shutting down`);
    void local.close().then(
      () => process.exit(0),
      (err) => {
        console.error('[playerticker] shutdown failed', err);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (config.seed) await seedIfEmpty(local);

  local.server.listen(config.port, config.host, () => {
    console.log(`[playerticker] API listening on http://${config.host}:${config.port}`);
    console.log(`[playerticker] database: ${config.dbPath}`);
    console.log(`[playerticker] seasons: ${config.seasons.join(', ')}${config.replayOnly ? ' (replay only)' : ''}`);
    console.log(`[playerticker] captures: ${config.capturesDir}`);
    console.log(
      config.allowedOrigins.length > 0
        ? `[playerticker] CORS allowed origins: ${config.allowedOrigins.join(', ')}`
        : '[playerticker] CORS disabled (use the Vite /api proxy, or set PLAYERTICKER_ALLOWED_ORIGINS)',
    );
  });
}

// Run ONLY when this file is the process entry point. An import (a test, another script) gets
// the exported builders and nothing else — no port is opened, no database is touched.
const isEntryPoint =
  typeof process.argv[1] === 'string' && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntryPoint) {
  void main().catch((err) => {
    console.error('[playerticker] failed to start', err);
    process.exit(1);
  });
}
