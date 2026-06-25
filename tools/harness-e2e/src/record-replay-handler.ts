/**
 * HTTP record/replay engine for deterministic real-CLI E2E tests.
 *
 * Recording: forwards real requests to the network and captures the
 * request/response pairs (secrets redacted, volatile values tokenized).
 * Replay: matches an incoming request against the recorded exchanges and serves
 * the canned response — never touching the network.
 *
 * The handler signature `(Request) => Promise<Response>` is the seam both the
 * in-sandbox proxy (`harness-http-proxy`) and the host-side fetch interceptor
 * plug into.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  FIXTURE_VERSION,
  type HttpExchange,
  type HttpFixture,
  type HttpFixtureBody,
  type HttpRequestMatchMetadata,
  type ReplayRuntimeIdentity,
} from './http-fixture';
import {
  auditHttpFixtureRedaction,
  bufferToArrayBuffer,
  bufferToFixtureBody,
  fixtureBodyExactKey,
  fixtureBodyToBuffer,
  fixtureizeHeaders,
  materializeHeaders,
  redactSecretHeaders,
} from './http-fixture-body';
import {
  canonicalizeBody,
  decodeBody,
  normalizeJsonValue,
  normalizeRouteKey,
  normalizeVolatileString,
  semanticRequestSignature,
  tryParseJsonBody,
} from './http-fixture-normalize';

const BODY_CAPTURE_IDLE_TIMEOUT_MS = Number(
  process.env.HTTP_REPLAY_BODY_CAPTURE_IDLE_TIMEOUT_MS ?? 2_000,
);
const BODY_CAPTURE_TOTAL_TIMEOUT_MS = Number(
  process.env.HTTP_REPLAY_BODY_CAPTURE_TOTAL_TIMEOUT_MS ?? 15_000,
);
const BODY_CAPTURE_STREAM_TOTAL_TIMEOUT_MS = Number(
  process.env.HTTP_REPLAY_STREAM_CAPTURE_TIMEOUT_MS ?? 60_000,
);

type MatchMode = 'exact' | 'canonical' | 'semantic' | 'first-turn' | 'reused';

function debug(event: string, attrs: Record<string, unknown>): void {
  if (process.env.HARNESS_E2E_DEBUG) {
    console.error(`[harness-e2e] ${event}`, JSON.stringify(attrs));
  }
}

type ReplayRequestContext = {
  request: Request;
  url: URL;
  body?: HttpFixtureBody;
};

type ReplayRoutePolicy = {
  name: string;
  matches: (ctx: ReplayRequestContext) => boolean;
  reusable?: boolean;
  skipRecording?: boolean;
  syntheticResponse?: (ctx: ReplayRequestContext) => Response;
};

function normalizeResponseHeaders(headers: Headers): Headers {
  const normalized = new Headers(headers);
  normalized.delete('content-encoding');
  normalized.delete('content-length');
  normalized.delete('transfer-encoding');
  return normalized;
}

async function captureResponseBody(
  response: Response,
): Promise<ArrayBuffer | undefined> {
  const clone = response.clone();
  if (!clone.body) {
    const body = await clone.arrayBuffer().catch(() => undefined);
    return body && body.byteLength > 0 ? body : undefined;
  }

  const contentType = clone.headers.get('content-type') ?? '';
  const isEventStream = contentType.includes('text/event-stream');
  const idleTimeoutMs = isEventStream
    ? undefined
    : BODY_CAPTURE_IDLE_TIMEOUT_MS;
  const totalTimeoutMs = isEventStream
    ? BODY_CAPTURE_STREAM_TOTAL_TIMEOUT_MS
    : BODY_CAPTURE_TOTAL_TIMEOUT_MS;
  const reader = clone.body.getReader();
  const chunks: Uint8Array[] = [];
  const startedAt = Date.now();
  let timedOut = false;

  try {
    while (Date.now() - startedAt < totalTimeoutMs) {
      const remaining = totalTimeoutMs - (Date.now() - startedAt);
      const nextChunk = await new Promise<
        | { type: 'read'; value: ReadableStreamReadResult<Uint8Array> }
        | { type: 'timeout'; kind: 'idle' | 'total' }
      >((resolve, reject) => {
        let settled = false;
        const totalTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (idleTimer) clearTimeout(idleTimer);
          resolve({ type: 'timeout', kind: 'total' });
        }, remaining);
        const idleTimer =
          idleTimeoutMs == null
            ? undefined
            : setTimeout(
                () => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(totalTimer);
                  resolve({ type: 'timeout', kind: 'idle' });
                },
                Math.min(idleTimeoutMs, remaining),
              );

        reader
          .read()
          .then(value => {
            if (settled) return;
            settled = true;
            clearTimeout(totalTimer);
            if (idleTimer) clearTimeout(idleTimer);
            resolve({ type: 'read', value });
          })
          .catch(error => {
            if (settled) return;
            settled = true;
            clearTimeout(totalTimer);
            if (idleTimer) clearTimeout(idleTimer);
            reject(error);
          });
      });

      if (nextChunk.type === 'timeout') {
        timedOut = true;
        break;
      }
      if (nextChunk.value.done) break;
      chunks.push(nextChunk.value.value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation failures from already-closed streams.
    }
  }

  if (timedOut) {
    debug('replay.body_capture_timeout', {
      contentType: contentType || 'unknown content-type',
      timeoutMs: totalTimeoutMs,
    });
  }

  if (chunks.length === 0) return undefined;
  const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  return body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength,
  ) as ArrayBuffer;
}

function buildForwardRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  // Strip proxy-specific hop-by-hop headers before forwarding through undici.
  // Codex emits a raw CONNECT-style header set that fetch rejects verbatim.
  for (const header of [
    'accept-encoding',
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(header);
  }
  return new Request(request, { headers });
}

const REPLAY_ROUTE_POLICIES: ReplayRoutePolicy[] = [
  {
    name: 'anthropic-event-logging',
    matches: ({ url }) => url.pathname === '/api/event_logging/batch',
    skipRecording: true,
    syntheticResponse: () => new Response(null, { status: 204 }),
  },
  {
    name: 'anthropic-claude-code-metrics-enabled',
    matches: ({ url }) =>
      url.pathname === '/api/claude_code/organizations/metrics_enabled',
    skipRecording: true,
    syntheticResponse: () =>
      Response.json(
        {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'invalid x-api-key',
            details: { error_visibility: 'user_facing' },
          },
        },
        { status: 401 },
      ),
  },
  {
    name: 'otel-metrics',
    matches: ({ url }) => url.pathname === '/otlp/v1/metrics',
    skipRecording: true,
    syntheticResponse: () => new Response(null, { status: 204 }),
  },
  {
    name: 'anthropic-mcp-registry',
    matches: ({ url }) => url.pathname === '/mcp-registry/v0/servers',
    skipRecording: true,
    syntheticResponse: () =>
      new Response(JSON.stringify({ servers: [], metadata: { count: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  },
  {
    name: 'anthropic-title-generation',
    matches: ({ url, body }) =>
      url.pathname === '/v1/messages' && isTitleGenerationRequest(body),
    skipRecording: true,
    syntheticResponse: ({ body }) => makeSyntheticAnthropicTextStream(body),
  },
];

function getReplayRoutePolicy(
  ctx: ReplayRequestContext,
): ReplayRoutePolicy | undefined {
  return REPLAY_ROUTE_POLICIES.find(policy => policy.matches(ctx));
}

function isReusableRequest(
  method: string,
  policy?: ReplayRoutePolicy,
): boolean {
  return policy?.reusable ?? method === 'GET';
}

function buildRequestMatchMetadata(
  method: string,
  url: URL,
  body?: HttpFixtureBody,
  policy?: ReplayRoutePolicy,
): HttpRequestMatchMetadata {
  return {
    routeKey: normalizeRouteKey(url),
    canonicalBody: canonicalizeBody(body),
    semanticSignature: semanticRequestSignature(body),
    firstTurnSignature: semanticRequestSignature(body, {
      firstUserTurnOnly: true,
    }),
    routePolicy: policy?.name ?? 'default',
    reusable: isReusableRequest(method, policy),
  };
}

function getRecordedRequestMetadata(
  exchange: HttpExchange,
): HttpRequestMatchMetadata {
  const url = new URL(exchange.request.url);
  const policy = getReplayRoutePolicy({
    request: new Request(exchange.request.url, {
      method: exchange.request.method,
    }),
    url,
    body: exchange.request.body,
  });

  return buildRequestMatchMetadata(
    exchange.request.method,
    url,
    exchange.request.body,
    policy,
  );
}

function isTitleGenerationRequest(body?: HttpFixtureBody): boolean {
  const parsed = tryParseJsonBody(body);
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  const record = parsed as Record<string, unknown>;
  const system = Array.isArray(record.system)
    ? record.system
        .map(part => {
          if (!part || typeof part !== 'object') return '';
          const value = part as Record<string, unknown>;
          if (typeof value.text === 'string') return value.text;
          if (typeof value.content === 'string') return value.content;
          return '';
        })
        .join('\n')
    : typeof record.system === 'string'
      ? record.system
      : '';

  return (
    system.includes('You are a title generator.') ||
    system.includes('Generate a concise, sentence-case title')
  );
}

function makeSyntheticAnthropicTextStream(
  body?: HttpFixtureBody,
  text = 'Conversation Title',
): Response {
  const parsed = tryParseJsonBody(body);
  const record =
    parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  const model = typeof record.model === 'string' ? record.model : 'mock-model';
  const responseBody = [
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: 'msg_replay_title',
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })}\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })}\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: 0,
    })}\n`,
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { input_tokens: 0, output_tokens: text.length },
    })}\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n`,
  ].join('\n');

  return new Response(responseBody, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function makeReplayResponse(
  response: HttpExchange['response'],
  runtimeIdentity?: ReplayRuntimeIdentity,
): Response {
  const headers = new Headers(
    materializeHeaders(response.headers, runtimeIdentity),
  );
  const normalizedHeaders = normalizeResponseHeaders(headers);
  const body = fixtureBodyToBuffer(response.body, runtimeIdentity);
  const contentType = normalizedHeaders.get('content-type') ?? '';

  if (body && contentType.includes('text/event-stream')) {
    const encoder = new TextEncoder();
    const text = body.toString('utf8');
    const chunks = text
      .split('\n\n')
      .filter(Boolean)
      .map(chunk => `${chunk}\n\n`);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: response.status,
      headers: normalizedHeaders,
    });
  }

  return new Response(body ? bufferToArrayBuffer(body) : undefined, {
    status: response.status,
    headers: normalizedHeaders,
  });
}

function collectJsonDiffs(
  actual: unknown,
  expected: unknown,
  path = '$',
  diffs: string[] = [],
  limit = 12,
): string[] {
  if (diffs.length >= limit) return diffs;

  if (typeof actual !== typeof expected) {
    diffs.push(`${path}: type ${typeof actual} !== ${typeof expected}`);
    return diffs;
  }

  if (typeof actual === 'string' && typeof expected === 'string') {
    if (normalizeVolatileString(actual) !== normalizeVolatileString(expected)) {
      diffs.push(
        `${path}: "${normalizeVolatileString(actual).slice(0, 120)}" !== "${normalizeVolatileString(expected).slice(0, 120)}"`,
      );
    }
    return diffs;
  }

  if (
    actual == null ||
    expected == null ||
    typeof actual !== 'object' ||
    typeof expected !== 'object'
  ) {
    if (actual !== expected) {
      diffs.push(`${path}: ${String(actual)} !== ${String(expected)}`);
    }
    return diffs;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      diffs.push(`${path}.length: ${actual.length} !== ${expected.length}`);
    }
    const length = Math.min(actual.length, expected.length);
    for (let i = 0; i < length && diffs.length < limit; i++) {
      collectJsonDiffs(actual[i], expected[i], `${path}[${i}]`, diffs, limit);
    }
    return diffs;
  }

  const actualRecord = actual as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)]),
  ).sort();

  for (const key of keys) {
    if (diffs.length >= limit) break;

    if (!(key in actualRecord)) {
      diffs.push(`${path}.${key}: missing in request`);
      continue;
    }

    if (!(key in expectedRecord)) {
      diffs.push(`${path}.${key}: extra in request`);
      continue;
    }

    collectJsonDiffs(
      actualRecord[key],
      expectedRecord[key],
      `${path}.${key}`,
      diffs,
      limit,
    );
  }

  return diffs;
}

function collectRequestJsonDiffs(
  actualBody?: HttpFixtureBody,
  expectedBody?: HttpFixtureBody,
): string[] {
  return collectJsonDiffs(
    normalizeJsonValue(tryParseJsonBody(actualBody)),
    normalizeJsonValue(tryParseJsonBody(expectedBody)),
  );
}

function buildRerecordCommand(fixture: HttpFixture): string | undefined {
  const [adapterName, ...scenarioParts] = fixture.description
    .trim()
    .split(/\s+/);
  const scenario = scenarioParts.join(' ');

  if (!adapterName || !scenario) {
    return undefined;
  }

  return `RECORD_ALL=true pnpm --filter harness-e2e test:integration -t "${scenario}: '${adapterName}'"`;
}

/**
 * Create a handler that records real HTTP exchanges to a fixture file. Forwards
 * every request to the live network, captures the pair, and (on `save()`)
 * writes the redaction-audited fixture, dropping `skipRecording` route policies.
 *
 * `options.fetchImpl` overrides how the request is forwarded (defaults to the
 * global `fetch`). The host-fetch interceptor passes the original `fetch` it
 * captured before overriding `globalThis.fetch`, so forwarding does not recurse
 * back into the interceptor.
 */
export function createRecordingHandler(
  fixturePath: string,
  description: string,
  runtimeIdentity?: ReplayRuntimeIdentity,
  options?: { fetchImpl?: typeof globalThis.fetch },
) {
  const forward = options?.fetchImpl ?? globalThis.fetch;
  const exchanges: HttpExchange[] = [];
  const pendingRecordings: Promise<void>[] = [];

  const handler = async (request: Request): Promise<Response> => {
    const reqClone = request.clone();
    const reqBody = Buffer.from(await reqClone.arrayBuffer());
    const reqHeaders: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      reqHeaders[k] = v;
    });
    const recordedReqBody = bufferToFixtureBody(
      reqBody,
      reqHeaders,
      runtimeIdentity,
    );
    const url = new URL(reqClone.url);
    const policy = getReplayRoutePolicy({
      request: reqClone,
      url,
      body: recordedReqBody,
    });
    const requestMeta = buildRequestMatchMetadata(
      reqClone.method,
      url,
      recordedReqBody,
      policy,
    );
    const recordedReqHeaders = redactSecretHeaders(
      fixtureizeHeaders(reqHeaders, runtimeIdentity),
    );

    // Forward a sanitized request to avoid compressed-response mismatches.
    const responsePromise = forward(buildForwardRequest(request)).then(
      response => {
        const normalizedHeaders = normalizeResponseHeaders(response.headers);
        return new Response(response.body, {
          status: response.status,
          headers: normalizedHeaders,
        });
      },
    );

    // Track the full recording lifecycle immediately so save() can wait even if
    // the request is still in flight when the test finishes.
    const pending = responsePromise.then(async response => {
      const resClone = response.clone();
      const resHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });
      const resBody = await captureResponseBody(resClone);
      const recordedResBody = resBody
        ? bufferToFixtureBody(Buffer.from(resBody), resHeaders, runtimeIdentity)
        : undefined;
      exchanges.push({
        request: {
          method: reqClone.method,
          url: reqClone.url,
          headers: recordedReqHeaders,
          body: recordedReqBody,
          meta: requestMeta,
        },
        response: {
          status: response.status,
          headers: redactSecretHeaders(
            fixtureizeHeaders(resHeaders, runtimeIdentity),
          ),
          body: recordedResBody,
        },
      });
      debug('replay.exchange_recorded', {
        fixturePath,
        method: reqClone.method,
        routeKey: requestMeta.routeKey,
        statusCode: response.status,
      });
    });
    pendingRecordings.push(pending);

    return responsePromise;
  };

  const save = async () => {
    await Promise.allSettled(pendingRecordings);
    // Skip writing empty fixtures — they just fall through to real HTTP anyway.
    if (exchanges.length === 0) return;
    const fixture: HttpFixture = {
      version: FIXTURE_VERSION,
      description,
      recordedAt: new Date().toISOString(),
      exchanges: exchanges.filter(exchange => {
        const policy = getReplayRoutePolicy({
          request: new Request(exchange.request.url, {
            method: exchange.request.method,
          }),
          url: new URL(exchange.request.url),
          body: exchange.request.body,
        });
        return !policy?.skipRecording;
      }),
    };
    if (fixture.exchanges.length === 0) return;
    auditHttpFixtureRedaction(fixture, runtimeIdentity);
    const dir = dirname(fixturePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
    debug('replay.fixture_saved', {
      fixturePath,
      exchangeCount: fixture.exchanges.length,
    });
  };

  return { handler, save, exchanges };
}

/**
 * Create a handler that replays recorded exchanges with no network access.
 * Matches on method + route key, then a 4-tier body match (exact → canonical →
 * semantic → first-turn). GET / policy-reusable requests may re-match consumed
 * exchanges; others consume once. Throws a diagnostic miss (with diffs + the
 * re-record command) when nothing matches.
 */
export function createReplayHandler(
  fixturePath: string,
  runtimeIdentity?: ReplayRuntimeIdentity,
) {
  const raw = readFileSync(fixturePath, 'utf8');
  const fixture: HttpFixture = JSON.parse(raw);
  const isAbortFixture = fixture.description.toLowerCase().includes('abort');
  const consumed = new Array<boolean>(fixture.exchanges.length).fill(false);
  let exchangesReplayed = 0;
  let lastMatchMode: MatchMode | undefined;

  const handler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const reqBody =
      request.method === 'GET'
        ? undefined
        : Buffer.from(await request.clone().arrayBuffer());
    const requestHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      requestHeaders[key] = value;
    });
    const replayReqBody = bufferToFixtureBody(
      reqBody ?? Buffer.alloc(0),
      requestHeaders,
      runtimeIdentity,
    );
    const policy = getReplayRoutePolicy({ request, url, body: replayReqBody });

    if (policy?.syntheticResponse) {
      debug('replay.synthetic_response', {
        fixturePath,
        method: request.method,
        routeKey: normalizeRouteKey(url),
        policy: policy.name,
      });
      return policy.syntheticResponse({ request, url, body: replayReqBody });
    }

    const requestMeta = buildRequestMatchMetadata(
      request.method,
      url,
      replayReqBody,
      policy,
    );
    const reusableRequest = requestMeta.reusable;

    const findMatch = (allowConsumedReuse: boolean) => {
      for (let i = 0; i < fixture.exchanges.length; i++) {
        if (consumed[i] && !allowConsumedReuse) continue;
        const exchange = fixture.exchanges[i];
        const recordedMeta = getRecordedRequestMetadata(exchange);

        if (request.method !== exchange.request.method) continue;
        if (requestMeta.routeKey !== recordedMeta.routeKey) continue;

        let matchMode: MatchMode = 'exact';
        if (
          fixtureBodyExactKey(exchange.request.body) !==
          fixtureBodyExactKey(replayReqBody)
        ) {
          if (recordedMeta.canonicalBody !== requestMeta.canonicalBody) {
            if (
              !requestMeta.semanticSignature ||
              requestMeta.semanticSignature !== recordedMeta.semanticSignature
            ) {
              if (
                !requestMeta.firstTurnSignature ||
                requestMeta.firstTurnSignature !==
                  recordedMeta.firstTurnSignature
              ) {
                continue;
              }
              matchMode = 'first-turn';
            } else {
              matchMode = 'semantic';
            }
          } else {
            matchMode = 'canonical';
          }
        }

        if (consumed[i] && allowConsumedReuse) {
          matchMode = 'reused';
        }

        return { exchange, index: i, matchMode };
      }

      return undefined;
    };

    // Prefer an exact match on method + path + body. This keeps replay fully
    // isolated from live network and avoids mixing up repeated calls to the
    // same endpoint when adapter-internal ordering shifts under load.
    const match =
      findMatch(false) ?? (reusableRequest ? findMatch(true) : undefined);
    if (match) {
      if (!consumed[match.index]) {
        consumed[match.index] = true;
      }
      exchangesReplayed++;
      lastMatchMode = match.matchMode;

      debug('replay.match', {
        fixturePath,
        method: request.method,
        routeKey: requestMeta.routeKey,
        matchIndex: match.index,
        matchMode: match.matchMode,
        reusable: reusableRequest,
      });

      return makeReplayResponse(match.exchange.response, runtimeIdentity);
    }

    const remainingSameRoute = fixture.exchanges
      .map((exchange, index) => ({ exchange, index }))
      .filter(({ exchange, index }) => {
        if (consumed[index]) return false;
        const recordedMeta = getRecordedRequestMetadata(exchange);
        return (
          request.method === exchange.request.method &&
          recordedMeta.routeKey === requestMeta.routeKey
        );
      });

    const consumedSameRoute = fixture.exchanges
      .map((exchange, index) => ({ exchange, index }))
      .filter(({ exchange, index }) => {
        if (!consumed[index]) return false;
        const recordedMeta = getRecordedRequestMetadata(exchange);
        return (
          request.method === exchange.request.method &&
          recordedMeta.routeKey === requestMeta.routeKey
        );
      });

    if (isAbortFixture) {
      const fallback = remainingSameRoute[0];
      if (fallback) {
        consumed[fallback.index] = true;
        exchangesReplayed++;

        debug('replay.abort_fallback', {
          fixturePath,
          method: request.method,
          routeKey: requestMeta.routeKey,
          matchIndex: fallback.index,
        });

        return makeReplayResponse(fallback.exchange.response, runtimeIdentity);
      }

      if (url.pathname === '/v1/messages') {
        debug('replay.synthetic_abort_fallback', {
          fixturePath,
          method: request.method,
          routeKey: requestMeta.routeKey,
        });

        return makeSyntheticAnthropicTextStream(
          replayReqBody,
          'Working on it...',
        );
      }
    }

    const candidates = remainingSameRoute
      .map(({ exchange, index }) => {
        const bodyPreview =
          decodeBody(exchange.request.body)?.slice(0, 200) ?? '<no body>';
        const recordedMeta = getRecordedRequestMetadata(exchange);
        const canonicalPreview =
          recordedMeta.canonicalBody?.slice(0, 200) ?? '<no canonical body>';
        const diffs = collectRequestJsonDiffs(
          replayReqBody,
          exchange.request.body,
        );
        return `#${index} raw=${bodyPreview}\n#${index} canonical=${canonicalPreview}\n#${index} diffs=${diffs.join(' | ') || '<none>'}`;
      })
      .join('\n');

    const consumedCandidates = consumedSameRoute
      .map(({ exchange, index }) => {
        const bodyPreview =
          decodeBody(exchange.request.body)?.slice(0, 200) ?? '<no body>';
        const recordedMeta = getRecordedRequestMetadata(exchange);
        const canonicalPreview =
          recordedMeta.canonicalBody?.slice(0, 200) ?? '<no canonical body>';
        const diffs = collectRequestJsonDiffs(
          replayReqBody,
          exchange.request.body,
        );
        return `#${index} raw=${bodyPreview}\n#${index} canonical=${canonicalPreview}\n#${index} diffs=${diffs.join(' | ') || '<none>'}`;
      })
      .join('\n');

    const requestPreview =
      decodeBody(replayReqBody)?.slice(0, 400) ?? '<no body>';
    const canonicalRequestPreview =
      requestMeta.canonicalBody?.slice(0, 400) ?? '<no canonical body>';
    const rerecordCommand = buildRerecordCommand(fixture);
    debug('replay.miss', {
      fixturePath,
      method: request.method,
      routeKey: requestMeta.routeKey,
      routePolicy: requestMeta.routePolicy,
      reusable: requestMeta.reusable,
      remainingCandidates: remainingSameRoute.length,
      consumedCandidates: consumedSameRoute.length,
      rerecordCommand,
    });

    throw new Error(
      `Replay miss for ${request.method} ${requestMeta.routeKey} in ${fixturePath}\n` +
        `Route policy: ${requestMeta.routePolicy} (reusable=${requestMeta.reusable})\n` +
        `Request body:\n${requestPreview}\n` +
        `Canonical request body:\n${canonicalRequestPreview}\n` +
        `Remaining candidates:\n${candidates || '<none>'}\n` +
        `Previously consumed candidates:\n${consumedCandidates || '<none>'}\n` +
        `Re-record command:\n${rerecordCommand ?? '<unavailable>'}`,
    );
  };

  return {
    handler,
    fixture,
    get exchangesReplayed() {
      return exchangesReplayed;
    },
    get totalExchanges() {
      return fixture.exchanges.length;
    },
    get lastMatchMode() {
      return lastMatchMode;
    },
  };
}
