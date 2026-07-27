// node:http adapter (Phase 9). The ONLY file coupled to a concrete HTTP transport. It parses an
// incoming request into the framework-agnostic `ApiRequest`, delegates to `ApiApp.handle`, and
// serializes the `ApiResponse` as JSON. All routing/validation/error logic lives in ApiApp, so
// this adapter stays trivially thin and swappable.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ApiApp } from './app';
import type { ApiRequest } from './dto';
import { toErrorResponse } from './middleware/errors';
import { BadRequestError } from './middleware/errors';

const MAX_BODY_BYTES = 64 * 1024; // internal API; bodies are tiny (POST /refresh takes none)

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequestError('request body too large', ['body exceeds 64KiB']);
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError('request body is not valid JSON', ['body must be JSON']);
  }
}

/** Build a normalized ApiRequest from a node:http message (exported for adapter tests). */
export async function toApiRequest(req: IncomingMessage): Promise<ApiRequest> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;
  const method = (req.method ?? 'GET').toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  return { method, path: url.pathname, query, body };
}

function send(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

export interface HttpServerOptions {
  /**
   * Exact origins allowed to call this API from a browser (e.g. `http://localhost:5173`).
   *
   * DEVELOPMENT SEAM ONLY, and deliberately minimal: the frontend dev server and this API run
   * on different ports, which makes every browser read a cross-origin request. Rather than a
   * middleware framework, this adds the two headers that unblocks — and only for origins the
   * operator listed explicitly. `*` is never sent, an unlisted origin gets no CORS headers at
   * all (the browser then blocks it), and no credentials are ever allowed. Omitted/empty =
   * CORS entirely off, which is the correct configuration when the API is reverse-proxied
   * behind the same origin as the app.
   */
  readonly allowedOrigins?: readonly string[];
}

/** The CORS headers for one request, or `{}` when the request's origin is not allowed. */
export function corsHeadersFor(
  origin: string | undefined,
  allowedOrigins: readonly string[] = [],
): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin, // echo the matched origin, never '*'
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin', // the response differs per origin, so it must not be cached across them
  };
}

/** Wrap an ApiApp in a node:http server. Call `.listen(port)` to start; nothing else here. */
export function createHttpServer(app: ApiApp, options: HttpServerOptions = {}): Server {
  const allowedOrigins = options.allowedOrigins ?? [];
  return createServer((req, res) => {
    void (async () => {
      const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
      const cors = corsHeadersFor(origin, allowedOrigins);
      try {
        // Preflight is answered by the adapter: it is a transport concern and never reaches
        // the router, so no route has to know CORS exists.
        if ((req.method ?? '').toUpperCase() === 'OPTIONS') {
          if (Object.keys(cors).length === 0) {
            send(res, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'origin is not allowed' } });
            return;
          }
          res.writeHead(204, cors); // 204 carries no body
          res.end();
          return;
        }
        const apiReq = await toApiRequest(req);
        const { status, body } = await app.handle(apiReq);
        send(res, status, body, cors);
      } catch (err) {
        const { status, body } = toErrorResponse(err);
        send(res, status, body, cors);
      }
    })();
  });
}
