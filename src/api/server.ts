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

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

/** Wrap an ApiApp in a node:http server. Call `.listen(port)` to start; nothing else here. */
export function createHttpServer(app: ApiApp): Server {
  return createServer((req, res) => {
    void (async () => {
      try {
        const apiReq = await toApiRequest(req);
        const { status, body } = await app.handle(apiReq);
        send(res, status, body);
      } catch (err) {
        const { status, body } = toErrorResponse(err);
        send(res, status, body);
      }
    })();
  });
}
