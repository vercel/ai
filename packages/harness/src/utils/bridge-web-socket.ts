import { safeParseJSON } from '@ai-sdk/provider-utils';
import type { WebSocket } from 'ws';
import type { z } from 'zod/v4';
import { HarnessError } from '../errors/harness-error';
import type { HarnessV1PortEndpoint } from '../v1';
import { harnessV1BridgeHelloSchema } from '../v1/harness-v1-bridge-protocol';
import type { SandboxChannelConnectOptions } from './sandbox-channel';
import { sleep } from './sleep';

export type BridgeHello = z.infer<typeof harnessV1BridgeHelloSchema>;

export interface CreateBridgeWebSocketConnectOptions {
  /** Bridge endpoint, already authenticated with the bridge token. */
  endpoint: HarnessV1PortEndpoint;

  /**
   * `WebSocket` class from the `ws` package. Passed in by the adapter because
   * `ws` is an optional peer dependency of `@ai-sdk/harness`.
   */
  webSocketConstructor: typeof WebSocket;

  /**
   * Retry budget in milliseconds for the channel's initial open (connect
   * reason `'open'`). Omit for a single attempt. Reconnects always make a
   * single attempt, because the channel retries them itself.
   */
  openRetryTimeoutMs?: number;

  /**
   * Abort signal that additionally cancels the channel's initial open, e.g.
   * the abort signal of the harness start call. Not applied to reconnects.
   */
  startAbortSignal?: AbortSignal;

  /** Called with the `bridge-hello` frame after every successful connect. */
  onHello?: (hello: BridgeHello) => void;
}

const OPEN_TIMEOUT_MS = 10_000;
const HELLO_TIMEOUT_MS = 5_000;
const UNAUTHORIZED_CLOSE_CODE = 1008;

/**
 * Creates the `connect` function for a bridge `SandboxChannel`.
 *
 * A connection only counts as established once the socket is open and the
 * bridge has sent `bridge-hello`. Some sandbox runtimes complete the host-side
 * WebSocket upgrade before the connection reaches the bridge process, and
 * frames sent in that gap are dropped. The bridge sends `bridge-hello` the
 * instant it accepts a connection, and sends nothing else until the host sends
 * `start` or `resume`, so no frame is lost between the handshake and the
 * channel wiring the socket.
 */
export function createBridgeWebSocketConnect({
  endpoint,
  webSocketConstructor,
  openRetryTimeoutMs,
  startAbortSignal,
  onHello,
}: CreateBridgeWebSocketConnectOptions): (
  options: SandboxChannelConnectOptions,
) => Promise<WebSocket> {
  return async ({ abortSignal, reason }) => {
    const isInitialOpen = reason === 'open';
    const linkedAbort =
      isInitialOpen && startAbortSignal != null
        ? linkAbortSignals({ abortSignals: [abortSignal, startAbortSignal] })
        : undefined;
    const connectAbortSignal = linkedAbort?.abortSignal ?? abortSignal;

    try {
      const { ws, hello } =
        isInitialOpen && openRetryTimeoutMs != null
          ? await openBridgeWebSocketWithRetry({
              endpoint,
              webSocketConstructor,
              abortSignal: connectAbortSignal,
              retryTimeoutMs: openRetryTimeoutMs,
            })
          : await openBridgeWebSocket({
              endpoint,
              webSocketConstructor,
              abortSignal: connectAbortSignal,
              openTimeoutMs: OPEN_TIMEOUT_MS,
              getHelloTimeoutMs: () => HELLO_TIMEOUT_MS,
            });
      onHello?.(hello);
      return ws;
    } finally {
      linkedAbort?.dispose();
    }
  };
}

class BridgeWebSocketUnauthorizedError extends Error {}

async function openBridgeWebSocketWithRetry({
  endpoint,
  webSocketConstructor,
  abortSignal,
  retryTimeoutMs,
}: {
  endpoint: HarnessV1PortEndpoint;
  webSocketConstructor: typeof WebSocket;
  abortSignal: AbortSignal;
  retryTimeoutMs: number;
}): Promise<{ ws: WebSocket; hello: BridgeHello }> {
  const deadline = Date.now() + retryTimeoutMs;
  let attempt = 0;
  let lastError: unknown;

  while (!abortSignal.aborted && Date.now() < deadline) {
    attempt++;
    try {
      const remaining = Math.max(1, deadline - Date.now());
      return await openBridgeWebSocket({
        endpoint,
        webSocketConstructor,
        abortSignal,
        openTimeoutMs: Math.min(OPEN_TIMEOUT_MS, remaining),
        getHelloTimeoutMs: () =>
          Math.min(HELLO_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
      });
    } catch (error) {
      if (abortSignal.aborted) throw getAbortReason({ abortSignal });
      if (error instanceof BridgeWebSocketUnauthorizedError) throw error;
      lastError = error;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep({
        ms: Math.min(250 * attempt, 1_000, remaining),
        abortSignal,
      });
    }
  }

  if (abortSignal.aborted) throw getAbortReason({ abortSignal });

  throw new HarnessError({
    message: `The harness bridge did not complete the WebSocket handshake within ${retryTimeoutMs}ms after ${attempt} attempt(s). Last error: ${formatError(lastError)}`,
    cause: lastError,
  });
}

function openBridgeWebSocket({
  endpoint,
  webSocketConstructor,
  abortSignal,
  openTimeoutMs,
  getHelloTimeoutMs,
}: {
  endpoint: HarnessV1PortEndpoint;
  webSocketConstructor: typeof WebSocket;
  abortSignal: AbortSignal;
  openTimeoutMs: number;
  getHelloTimeoutMs: () => number;
}): Promise<{ ws: WebSocket; hello: BridgeHello }> {
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(getAbortReason({ abortSignal }));
      return;
    }

    const ws = new webSocketConstructor(endpoint.url, {
      headers: endpoint.headers == null ? undefined : { ...endpoint.headers },
    });
    let opened = false;
    let hello: BridgeHello | undefined;
    let settled = false;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let helloTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(openTimer);
      clearTimeout(helloTimer);
      ws.off('open', onOpen);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
      abortSignal.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      /*
       * Terminating a socket that is still connecting makes `ws` emit an
       * `error` event. Keep a no-op listener so that event cannot surface as
       * an unhandled error and the original failure reason is preserved.
       */
      ws.on('error', () => {});
      try {
        ws.terminate();
      } catch {
        try {
          ws.close();
        } catch {
          // best-effort
        }
      }
      reject(error);
    };
    const tryResolve = () => {
      if (settled || !opened || hello == null) return;
      settled = true;
      cleanup();
      resolve({ ws, hello });
    };
    const onOpen = () => {
      opened = true;
      clearTimeout(openTimer);
      const helloTimeoutMs = getHelloTimeoutMs();
      helloTimer = setTimeout(
        () =>
          fail(
            new Error(
              `The harness bridge did not send bridge-hello within ${helloTimeoutMs}ms.`,
            ),
          ),
        helloTimeoutMs,
      );
      unrefTimer(helloTimer);
      tryResolve();
    };
    const onMessage = (raw: unknown) => {
      void (async () => {
        const parsed = await safeParseJSON({
          text: webSocketMessageToString(raw),
          schema: harnessV1BridgeHelloSchema,
        });
        if (!parsed.success || settled) return;
        hello = parsed.value;
        tryResolve();
      })();
    };
    const onClose = (code: number) => {
      fail(
        code === UNAUTHORIZED_CLOSE_CODE
          ? new BridgeWebSocketUnauthorizedError(
              `The harness bridge rejected the WebSocket connection as unauthorized (code ${code}).`,
            )
          : new Error(
              `The harness bridge closed the WebSocket (code ${code}) before sending bridge-hello.`,
            ),
      );
    };
    const onError = (error: Error) => fail(error);
    const onAbort = () => fail(getAbortReason({ abortSignal }));

    ws.on('open', onOpen);
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
    abortSignal.addEventListener('abort', onAbort, { once: true });
    openTimer = setTimeout(
      () =>
        fail(
          new Error(
            `The harness bridge WebSocket did not open within ${openTimeoutMs}ms.`,
          ),
        ),
      openTimeoutMs,
    );
    unrefTimer(openTimer);
  });
}

function linkAbortSignals({ abortSignals }: { abortSignals: AbortSignal[] }): {
  abortSignal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  const dispose = () => {
    abortSignals.forEach((signal, index) =>
      signal.removeEventListener('abort', listeners[index]),
    );
  };
  for (const signal of abortSignals) {
    const onAbort = () => {
      controller.abort(signal.reason);
      dispose();
    };
    listeners.push(onAbort);
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return { abortSignal: controller.signal, dispose };
}

function getAbortReason({
  abortSignal,
}: {
  abortSignal: AbortSignal;
}): unknown {
  return abortSignal.reason ?? new Error('WebSocket connection aborted');
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  (timer as { unref?: () => void }).unref?.();
}

function webSocketMessageToString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
      'utf8',
    );
  }
  return String(raw);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
