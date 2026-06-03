import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HttpHandler } from './proxy-handler';

/**
 * Thin record/replay handlers — the minimum needed to prove the proxy substrate
 * supports offline replay: capture real exchanges to a file, then serve them
 * back offline.
 *
 * This is deliberately NOT the production fixture machinery (versioned format,
 * normalization/redaction, semantic matcher, synthetic route policies), which
 * would build on top of the same `httpHandler` seam this exercises.
 */

interface RecordedBody {
  /** base64-encoded body, omitted when empty. */
  b64?: string;
}

interface RecordedExchange {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: RecordedBody;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: RecordedBody;
  };
}

interface Cassette {
  version: 1;
  recordedAt: string;
  exchanges: RecordedExchange[];
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function bufferToBody(buf: Buffer): RecordedBody | undefined {
  return buf.byteLength > 0 ? { b64: buf.toString('base64') } : undefined;
}

/**
 * Records every exchange by forwarding to the live network and capturing the
 * request/response pair. Returns `{ handler, save }`; call `save()` after the
 * run to write the cassette. `recordedAt` is stamped at save time.
 */
export function createRecordingHandler(filePath: string): {
  handler: HttpHandler;
  save: () => void;
  exchanges: RecordedExchange[];
} {
  const exchanges: RecordedExchange[] = [];

  const handler: HttpHandler = async (request: Request): Promise<Response> => {
    const reqBuf = Buffer.from(await request.clone().arrayBuffer());
    const response = await fetch(request);
    const resBuf = Buffer.from(await response.clone().arrayBuffer());

    exchanges.push({
      request: {
        method: request.method,
        url: request.url,
        headers: headersToObject(request.headers),
        body: bufferToBody(reqBuf),
      },
      response: {
        status: response.status,
        headers: headersToObject(response.headers),
        body: bufferToBody(resBuf),
      },
    });

    return response;
  };

  const save = (): void => {
    const cassette: Cassette = {
      version: 1,
      recordedAt: new Date().toISOString(),
      exchanges,
    };
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(cassette, null, 2));
  };

  return { handler, save, exchanges };
}

/**
 * Replays a previously recorded cassette with no network access. Matches the
 * first unconsumed exchange with the same method + URL pathname; throws on a
 * miss (the test should re-record). Intentionally simple — semantic matching is
 * out of scope here.
 */
export function createReplayHandler(filePath: string): {
  handler: HttpHandler;
  get remaining(): number;
} {
  const cassette = JSON.parse(readFileSync(filePath, 'utf8')) as Cassette;
  const consumed = new Array<boolean>(cassette.exchanges.length).fill(false);

  const handler: HttpHandler = (request: Request): Response => {
    const url = new URL(request.url);
    const index = cassette.exchanges.findIndex((exchange, i) => {
      if (consumed[i]) return false;
      if (exchange.request.method !== request.method) return false;
      return new URL(exchange.request.url).pathname === url.pathname;
    });

    if (index === -1) {
      throw new Error(
        `Replay miss for ${request.method} ${url.pathname} in ${filePath} ` +
          `(${consumed.filter(Boolean).length}/${cassette.exchanges.length} consumed)`,
      );
    }

    consumed[index] = true;
    const recorded = cassette.exchanges[index].response;
    const body = recorded.body?.b64
      ? Buffer.from(recorded.body.b64, 'base64')
      : undefined;
    return new Response(body, {
      status: recorded.status,
      headers: recorded.headers,
    });
  };

  return {
    handler,
    get remaining() {
      return consumed.filter(c => !c).length;
    },
  };
}
