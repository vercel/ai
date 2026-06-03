import { WebSocket } from 'ws';
import {
  type ConnectHandler,
  type HttpHandler,
  allowAllConnectHandler,
} from './proxy-handler';
import {
  PROXY_PROTOCOL_VERSION,
  type ConnectRequest,
  type HostToSandbox,
  type HttpRequest,
  type ReadyAck,
  type SandboxToHost,
  fromResponse,
  toRequest,
} from './proxy-protocol';

/** Env vars pointing the in-sandbox CLI at the proxy. */
export interface ProxyUrlEnv {
  HTTP_PROXY: string;
  http_proxy: string;
  HTTPS_PROXY: string;
  https_proxy: string;
  NO_PROXY: string;
  no_proxy: string;
}

interface ProxySession {
  sessionId: string;
  token: string;
  proxyPort: number;
  httpHandler: HttpHandler;
  connectHandler: ConnectHandler;
}

export interface ProxyChannelDebugEvent {
  event: string;
  attrs?: Record<string, unknown>;
}

/**
 * Host-side WebSocket client to the in-sandbox Go proxy. A faithful reduction of
 * `agent-harness-sdk/packages/ws-proxy/src/channel.ts`, stripped of the agent
 * event/control/tool plumbing and the binary-install path (which moves to
 * `install-proxy.ts`). It owns only: the `ready` → `ready-ack` handshake (with
 * protocol-version check), session registration, and the HTTP/CONNECT
 * request→response dispatch to the registered handlers.
 *
 * The Go binary is the WebSocket server; this connects in as the client.
 */
export class ProxyChannel {
  private ws: WebSocket | null = null;
  private attached = false;
  private readonly sessions = new Map<string, ProxySession>();
  private readonly onDebug?: (event: ProxyChannelDebugEvent) => void;

  constructor(opts?: { onDebug?: (event: ProxyChannelDebugEvent) => void }) {
    this.onDebug = opts?.onDebug;
  }

  /** Connect to the proxy's `/ws` endpoint and complete the ready handshake. */
  async connect(wsUrl: string, opts?: { timeoutMs?: number }): Promise<void> {
    await this.connectWithRetry(wsUrl, opts?.timeoutMs ?? 10_000);
    this.attached = true;
  }

  /**
   * Register a proxy session and return the env vars to point the CLI at the
   * proxy. Mirrors the original `channel.proxy(...)`.
   */
  async register(opts: {
    sessionId: string;
    token: string;
    proxyPort: number;
    httpHandler: HttpHandler;
    connectHandler?: ConnectHandler;
  }): Promise<ProxyUrlEnv> {
    if (!this.attached) throw new Error('ProxyChannel not connected');

    const session: ProxySession = {
      sessionId: opts.sessionId,
      token: opts.token,
      proxyPort: opts.proxyPort,
      httpHandler: opts.httpHandler,
      connectHandler: opts.connectHandler ?? allowAllConnectHandler,
    };
    this.sessions.set(session.sessionId, session);
    try {
      await this.registerAndWait(session.sessionId, session.token);
    } catch (error) {
      this.sessions.delete(session.sessionId);
      throw error;
    }

    const url = `http://${session.sessionId}:${session.token}@127.0.0.1:${session.proxyPort}`;
    return {
      HTTP_PROXY: url,
      http_proxy: url,
      HTTPS_PROXY: url,
      https_proxy: url,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    };
  }

  async close(): Promise<void> {
    this.attached = false;
    this.sessions.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private async handleMessage(raw: string): Promise<void> {
    let msg: SandboxToHost;
    try {
      msg = JSON.parse(raw) as SandboxToHost;
    } catch {
      return;
    }

    switch (msg.type) {
      // The Go binary uses the short aliases `request` / `connect`.
      case 'request':
      case 'http-request':
        await this.handleHttpRequest(
          msg.type === 'request' ? { ...msg, type: 'http-request' } : msg,
        );
        break;
      case 'connect':
      case 'connect-request':
        await this.handleConnectRequest(
          msg.type === 'connect' ? { ...msg, type: 'connect-request' } : msg,
        );
        break;
      default:
        // ready-ack / register-ack are handled in their await loops; ignore here.
        break;
    }
  }

  private async handleHttpRequest(msg: HttpRequest): Promise<void> {
    const session = this.sessions.get(msg.sessionId);
    if (!session) {
      this.send({
        type: 'request-error',
        requestId: msg.requestId,
        message: `No handler for session ${msg.sessionId}`,
      });
      return;
    }

    try {
      const request = toRequest(msg);
      const response = await session.httpHandler(request);
      const protoResp = await fromResponse(msg.requestId, response);
      this.onDebug?.({
        event: 'proxy.request',
        attrs: { method: msg.method, url: msg.url, status: response.status },
      });
      // The Go binary expects `response`, not `http-response`.
      this.send({ ...protoResp, type: 'response' });
    } catch (err) {
      this.send({
        type: 'error',
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : 'Handler error',
      });
    }
  }

  private async handleConnectRequest(msg: ConnectRequest): Promise<void> {
    const session = this.sessions.get(msg.sessionId);
    if (!session) {
      this.send({
        type: 'request-error',
        requestId: msg.requestId,
        message: `No handler for session ${msg.sessionId}`,
      });
      return;
    }

    let allow = false;
    try {
      allow = await session.connectHandler(msg.host);
    } catch {
      allow = false;
    }
    this.onDebug?.({
      event: 'proxy.connect',
      attrs: { host: msg.host, allow },
    });
    this.send({ type: 'connect-response', requestId: msg.requestId, allow });
  }

  // -------------------------------------------------------------------------
  // WS plumbing
  // -------------------------------------------------------------------------

  private send(msg: HostToSandbox): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private sendOrThrow(msg: HostToSandbox): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('Proxy WS not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  private registerAndWait(sessionId: string, token: string): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Proxy WS not connected'));
    }
    const timeoutMs = Number(
      process.env.AGENT_PROXY_REGISTER_TIMEOUT_MS ?? 3_000,
    );

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        ws.removeListener('message', onMessage);
        ws.removeListener('close', onClose);
        ws.removeListener('error', onError);
      };
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };
      const onMessage = (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          const registered: unknown = Array.isArray(msg.sessions)
            ? msg.sessions
                .map((s: { sessionId?: unknown }) => s.sessionId)
                .filter((id: unknown): id is string => typeof id === 'string')
            : msg.sessionIds;
          if (
            msg.type === 'register-ack' &&
            Array.isArray(registered) &&
            registered.includes(sessionId)
          ) {
            settle(resolve);
          }
        } catch {
          // ignore malformed frames during registration
        }
      };
      const onClose = () =>
        settle(() =>
          reject(
            new Error(`Proxy WS closed before session ${sessionId} registered`),
          ),
        );
      const onError = (error: Error) => settle(() => reject(error));
      const timeout = setTimeout(
        () =>
          settle(() =>
            reject(
              new Error(
                `Proxy session ${sessionId} registration timed out after ${timeoutMs}ms`,
              ),
            ),
          ),
        timeoutMs,
      );

      ws.on('message', onMessage);
      ws.once('close', onClose);
      ws.once('error', onError);
      try {
        this.sendOrThrow({
          type: 'register',
          sessions: [{ sessionId, token }],
        });
      } catch (error) {
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      }
    });
  }

  private async connectWithRetry(
    url: string,
    timeoutMs: number,
  ): Promise<void> {
    const start = performance.now();
    let delayMs = 50;
    let lastError: unknown;
    while (performance.now() - start < timeoutMs) {
      try {
        await this.connectOnce(url, Math.min(3_000, timeoutMs));
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 1.5, 1_000);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`Proxy WS connect failed after ${timeoutMs}ms`);
  }

  private connectOnce(url: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new Error(`Proxy WS connect timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'ready' }));
      });

      ws.on('message', data => {
        const raw = data.toString();
        if (!settled) {
          let ack: ReadyAck | null = null;
          try {
            const parsed = JSON.parse(raw) as SandboxToHost;
            if (parsed.type === 'ready-ack') ack = parsed;
          } catch {
            // not the ack yet
          }
          if (ack) {
            if (ack.version !== PROXY_PROTOCOL_VERSION) {
              settled = true;
              clearTimeout(timeout);
              ws.close();
              reject(
                new Error(
                  `Proxy protocol mismatch: expected ${PROXY_PROTOCOL_VERSION}, got ${ack.version}`,
                ),
              );
              return;
            }
            settled = true;
            clearTimeout(timeout);
            this.ws = ws;
            resolve();
            return;
          }
        }
        void this.handleMessage(raw);
      });

      ws.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!this.ws) reject(err);
      });

      ws.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Proxy WS closed before opening'));
        }
        if (this.ws === ws) {
          this.ws = null;
          this.attached = false;
        }
      });
    });
  }
}
