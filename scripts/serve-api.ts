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
 *   PLAYERTICKER_SEED             "1" to publish one fixture-backed board on startup if the
 *                                 database has nothing published yet, so a fresh clone shows a
 *                                 real board instead of an empty state.
 *
 * The refresh pipeline is FIXTURE-BACKED (no network): it replays the same committed synthetic
 * provider payloads the persistence tests use. Wiring a live pipeline is a deployment concern
 * and is intentionally out of scope here.
 *
 * IMPORTING THIS FILE STARTS NOTHING. `main()` runs only under the `import.meta.main`-style
 * guard at the bottom, so tests can import `createLocalServer` without opening a port.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { composeApi, createHttpServer, type ComposedApi } from '@/api';
import { persistRefreshResult, PersistenceStore } from '@/persistence';
import { mockedSuccessfulRefresh } from '@/persistence/__fixtures';
import type { RefreshPipeline } from '@/scheduler';
import type { TransportConfigDescriptor } from '@/application';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DB = '.local/playerticker.db';

const TRANSPORT: TransportConfigDescriptor = { requiredProviders: ['nflverse'], replayEnabled: true };

export interface LocalServerConfig {
  readonly port: number;
  readonly host: string;
  readonly dbPath: string;
  readonly allowedOrigins: readonly string[];
  readonly seed: boolean;
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
  };
}

/**
 * A fixture-backed refresh pipeline: replay committed synthetic provider payloads, persist the
 * real artifacts they produce, publish the board. No network access anywhere in this path.
 */
function fixturePipeline(getStore: () => PersistenceStore): RefreshPipeline {
  return {
    async refresh() {
      return mockedSuccessfulRefresh();
    },
    async persist(ctx, refreshResult) {
      const { result, builds } = refreshResult as Awaited<ReturnType<typeof mockedSuccessfulRefresh>>;
      const startedAt = ctx.startedAt;
      const outcome = persistRefreshResult(getStore(), {
        result,
        inferenceBuilds: builds,
        runId: ctx.runId,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return { status: outcome.status, publishable: outcome.publishable, snapshotId: outcome.snapshotId };
    },
    async publish(ctx) {
      const published = getStore().publishBoard({ runId: ctx.runId });
      return { publicationId: published.publicationId, entryCount: published.entryCount };
    },
  };
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

  let store: PersistenceStore;
  const composed = composeApi({
    dbPath: config.dbPath,
    pipeline: fixturePipeline(() => store),
    transport: TRANSPORT,
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

/** Publish one fixture-backed board if the database has nothing published yet. */
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
