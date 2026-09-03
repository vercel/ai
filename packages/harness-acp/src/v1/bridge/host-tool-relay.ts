import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';

export type HostToolCorrelationInvocation = {
  readonly token: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly order: number;
};

export type HostToolRelayTurn = {
  readonly emitToolCall: (options: {
    toolCallId: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
  }) => void;
  readonly emitToolResult: (options: {
    toolCallId: string;
    toolName: string;
    output: unknown;
    isError?: boolean;
  }) => void;
  readonly requestToolResult: (
    toolCallId: string,
  ) => Promise<{ output: unknown; isError?: boolean }>;
  readonly registerCorrelationInvocation: (
    options: HostToolCorrelationInvocation,
  ) => void;
  readonly removeCorrelationInvocation: (options: { token: string }) => void;
};

export type HostToolRelay = {
  readonly url: string;
  readonly credential: string;
  bindTurn(options: { turn: HostToolRelayTurn }): void;
  unbindTurn(options: { turn: HostToolRelayTurn }): void;
  updateCatalog(options: { tools: ReadonlyArray<HarnessV1BridgeToolWire> }): {
    changed: boolean;
    revision: number;
  };
  waitForCatalogRefresh(options: {
    revision: number;
    timeoutMs: number;
  }): Promise<boolean>;
  close(): Promise<void>;
};

type CatalogState = {
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  fingerprint: string;
  revision: number;
  servedRevision: number;
  closed: boolean;
  readonly changeWaiters: Set<() => void>;
  readonly refreshWaiters: Set<{
    readonly revision: number;
    readonly resolve: (refreshed: boolean) => void;
  }>;
};

export async function startHostToolRelay({
  tools,
  serverName,
}: {
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  serverName: string;
}): Promise<HostToolRelay> {
  const state: CatalogState = {
    tools: [...tools],
    fingerprint: catalogFingerprint({ tools }),
    revision: 1,
    servedRevision: 0,
    closed: false,
    changeWaiters: new Set(),
    refreshWaiters: new Set(),
  };
  const credential = randomBytes(32).toString('hex');
  let activeTurn: HostToolRelayTurn | undefined;
  let invocationOrder = 0;
  let closePromise: Promise<void> | undefined;
  const server = createServer(async (request, response) => {
    try {
      const result = await handleRequest({
        request,
        credential,
        state,
        serverName,
        turn: activeTurn,
        nextInvocationOrder: () => ++invocationOrder,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof RelayRequestError ? error.status : 500;
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
  await listen({ server });
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/invoke`,
    credential,
    bindTurn: ({ turn }) => {
      if (activeTurn != null && activeTurn !== turn) {
        throw new Error('A host tool relay turn is already active.');
      }
      activeTurn = turn;
    },
    unbindTurn: ({ turn }) => {
      if (activeTurn === turn) activeTurn = undefined;
    },
    updateCatalog: ({ tools: nextTools }) => {
      const fingerprint = catalogFingerprint({ tools: nextTools });
      if (fingerprint === state.fingerprint) {
        return { changed: false, revision: state.revision };
      }
      state.tools = [...nextTools];
      state.fingerprint = fingerprint;
      state.revision += 1;
      resolveCatalogChanges({ state });
      return { changed: true, revision: state.revision };
    },
    waitForCatalogRefresh: ({ revision, timeoutMs }) =>
      waitForCatalogRefresh({ state, revision, timeoutMs }),
    close: () => {
      if (closePromise != null) return closePromise;
      state.closed = true;
      resolveCatalogChanges({ state });
      resolveRefreshWaiters({ state, closing: true });
      closePromise = closeServer({ server });
      return closePromise;
    },
  };
}

async function handleRequest({
  request,
  credential,
  state,
  serverName,
  turn,
  nextInvocationOrder,
}: {
  request: IncomingMessage;
  credential: string;
  state: CatalogState;
  serverName: string;
  turn: HostToolRelayTurn | undefined;
  nextInvocationOrder: () => number;
}): Promise<unknown> {
  if (request.method !== 'POST') {
    throw new RelayRequestError({
      status: 404,
      message: 'Unknown host tool relay endpoint.',
    });
  }
  if (
    !credentialsMatch({
      expected: credential,
      actual: request.headers.authorization,
    })
  ) {
    throw new RelayRequestError({
      status: 401,
      message: 'Invalid host tool relay credential.',
    });
  }
  const body = await readJSONBody({ request });
  if (request.url === '/catalog/next') {
    return handleCatalogNext({ body, state });
  }
  if (request.url === '/catalog/seen') {
    return handleCatalogSeen({ body, state });
  }
  if (request.url === '/invoke') {
    return handleInvocation({
      body,
      state,
      serverName,
      turn,
      nextInvocationOrder,
    });
  }
  throw new RelayRequestError({
    status: 404,
    message: 'Unknown host tool relay endpoint.',
  });
}

async function handleCatalogNext({
  body,
  state,
}: {
  body: unknown;
  state: CatalogState;
}): Promise<unknown> {
  if (
    !isRecord(body) ||
    !Number.isSafeInteger(body.afterRevision) ||
    (body.afterRevision as number) < 0
  ) {
    throw new RelayRequestError({
      status: 400,
      message: 'Invalid host tool catalog poll request.',
    });
  }
  const afterRevision = body.afterRevision as number;
  if (!state.closed && afterRevision >= state.revision) {
    await waitForCatalogChange({ state });
  }
  if (state.closed) {
    return { closed: true, revision: state.revision };
  }
  return afterRevision < state.revision
    ? { revision: state.revision, tools: state.tools }
    : { revision: state.revision };
}

function handleCatalogSeen({
  body,
  state,
}: {
  body: unknown;
  state: CatalogState;
}): unknown {
  if (
    !isRecord(body) ||
    !Number.isSafeInteger(body.revision) ||
    (body.revision as number) < 1 ||
    (body.revision as number) > state.revision
  ) {
    throw new RelayRequestError({
      status: 400,
      message: 'Invalid host tool catalog acknowledgment.',
    });
  }
  state.servedRevision = Math.max(
    state.servedRevision,
    body.revision as number,
  );
  resolveRefreshWaiters({ state, closing: false });
  return { acknowledged: true };
}

async function handleInvocation({
  body,
  state,
  serverName,
  turn,
  nextInvocationOrder,
}: {
  body: unknown;
  state: CatalogState;
  serverName: string;
  turn: HostToolRelayTurn | undefined;
  nextInvocationOrder: () => number;
}): Promise<{
  output: unknown;
  isError?: boolean;
  correlationToken: string;
}> {
  if (turn == null) {
    throw new RelayRequestError({
      status: 409,
      message: 'No ACP prompt turn is active.',
    });
  }
  if (
    !isRecord(body) ||
    typeof body.requestId !== 'string' ||
    typeof body.toolName !== 'string' ||
    !isRecord(body.input) ||
    !Number.isSafeInteger(body.catalogRevision)
  ) {
    throw new RelayRequestError({
      status: 400,
      message: 'Invalid host tool relay request.',
    });
  }
  if (body.catalogRevision !== state.revision) {
    throw new RelayRequestError({
      status: 409,
      message:
        `Host tool ${body.toolName} was invoked from stale catalog revision ` +
        `${body.catalogRevision}; the active revision is ${state.revision}.`,
    });
  }
  const tool = state.tools.find(item => item.name === body.toolName);
  if (tool == null) {
    throw new RelayRequestError({
      status: 404,
      message:
        `Host tool ${body.toolName} is not active in catalog revision ` +
        `${state.revision}.`,
    });
  }

  const correlationToken = randomBytes(32).toString('hex');
  turn.registerCorrelationInvocation({
    token: correlationToken,
    serverName,
    toolName: tool.name,
    input: body.input,
    order: nextInvocationOrder(),
  });
  turn.emitToolCall({
    toolCallId: body.requestId,
    toolName: tool.name,
    input: body.input,
  });
  let result: { output: unknown; isError?: boolean };
  try {
    result = await turn.requestToolResult(body.requestId);
  } catch (error) {
    turn.removeCorrelationInvocation({ token: correlationToken });
    throw error;
  }
  turn.emitToolResult({
    toolCallId: body.requestId,
    toolName: tool.name,
    output: result.output,
    ...(result.isError ? { isError: true } : {}),
  });
  return {
    output: result.output,
    ...(result.isError ? { isError: true } : {}),
    correlationToken,
  };
}

function waitForCatalogChange({
  state,
}: {
  state: CatalogState;
}): Promise<void> {
  let changeWaiter!: () => void;
  const change = new Promise<void>(resolve => {
    changeWaiter = resolve;
    state.changeWaiters.add(changeWaiter);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, 20_000);
    timer.unref?.();
  });
  return Promise.race([change, timeout]).finally(() => {
    state.changeWaiters.delete(changeWaiter);
    if (timer != null) clearTimeout(timer);
  });
}

function resolveCatalogChanges({ state }: { state: CatalogState }): void {
  for (const resolve of [...state.changeWaiters]) resolve();
}

function waitForCatalogRefresh({
  state,
  revision,
  timeoutMs,
}: {
  state: CatalogState;
  revision: number;
  timeoutMs: number;
}): Promise<boolean> {
  if (state.servedRevision >= revision) return Promise.resolve(true);
  if (state.closed) return Promise.resolve(false);
  let waiter!: {
    readonly revision: number;
    readonly resolve: (refreshed: boolean) => void;
  };
  const refresh = new Promise<boolean>(resolve => {
    waiter = {
      revision,
      resolve,
    };
    state.refreshWaiters.add(waiter);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([refresh, timeout]).finally(() => {
    state.refreshWaiters.delete(waiter);
    if (timer != null) clearTimeout(timer);
  });
}

function resolveRefreshWaiters({
  state,
  closing,
}: {
  state: CatalogState;
  closing: boolean;
}): void {
  for (const waiter of [...state.refreshWaiters]) {
    if (closing || state.servedRevision >= waiter.revision) {
      waiter.resolve(!closing);
    }
  }
}

export function catalogFingerprint({
  tools,
}: {
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
}): string {
  return JSON.stringify(canonicalizeJSON({ value: tools }));
}

function canonicalizeJSON({ value }: { value: unknown }): unknown {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJSON({ value: item }));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => [key, canonicalizeJSON({ value: value[key] })]),
  );
}

async function readJSONBody({
  request,
}: {
  request: IncomingMessage;
}): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16 * 1024 * 1024) {
      throw new RelayRequestError({
        status: 413,
        message: 'Host tool relay request is too large.',
      });
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return await new Response(text, {
      headers: { 'content-type': 'application/json' },
    }).json();
  } catch {
    throw new RelayRequestError({
      status: 400,
      message: 'Host tool relay request is not valid JSON.',
    });
  }
}

function credentialsMatch({
  expected,
  actual,
}: {
  expected: string;
  actual: string | undefined;
}): boolean {
  const expectedValue = Buffer.from(`Bearer ${expected}`);
  const actualValue = Buffer.from(actual ?? '');
  return (
    expectedValue.length === actualValue.length &&
    timingSafeEqual(expectedValue, actualValue)
  );
}

function listen({ server }: { server: Server }): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer({ server }: { server: Server }): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error == null) resolve();
      else reject(error);
    });
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

class RelayRequestError extends Error {
  readonly status: number;

  constructor({ status, message }: { status: number; message: string }) {
    super(message);
    this.name = 'HostToolRelayRequestError';
    this.status = status;
  }
}
