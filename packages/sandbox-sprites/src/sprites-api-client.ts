import { randomUUID } from 'node:crypto';
import {
  safeParseJSON,
  type Experimental_SandboxProcess,
} from '@ai-sdk/provider-utils';

/**
 * Default base URL of the Sprites control-plane REST/WS API. Overridable via
 * the `baseUrl` setting or the `SPRITES_API_URL` environment variable.
 */
export const SPRITES_DEFAULT_BASE_URL = 'https://api.sprites.dev';

/**
 * The single internal port a Sprite's public URL
 * (`https://<name>-<suffix>.sprites.app`) proxies to. Sprites expose exactly
 * one HTTP-proxied port; the harness bridge listens here and is reached via
 * {@link SpritesNetworkSandboxSession.getPortUrl}.
 */
export const SPRITE_HTTP_PORT = 8080;

/** URL authentication mode for a Sprite's always-on public URL. */
export type SpriteUrlAuth = 'public' | 'sprite';

/** A Sprite as returned by the control-plane API. */
export interface SpriteResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  /** Public URL, e.g. `https://<name>-<suffix>.sprites.app`. */
  readonly url: string;
  readonly urlAuth?: SpriteUrlAuth;
}

/** A single outbound domain rule in a Sprite's network policy. */
export interface SpriteNetworkRule {
  readonly domain: string;
  readonly action: 'allow' | 'deny';
}

/** Options accepted by {@link SpritesApiClient.exec}. */
export interface SpriteExecOptions {
  /** Argument vector. `argv[0]` is the executable. */
  argv: ReadonlyArray<string>;
  /** Working directory; defaults to the Sprite's login directory when unset. */
  cwd?: string;
  /** Extra environment variables, merged over the Sprite's defaults. */
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
}

/**
 * Minimal structural view of the global `WebSocket` we rely on. We use the
 * undici `headers` constructor option (Node.js >= 22) to send the
 * `Authorization` header, which the WHATWG `WebSocket` spec does not define —
 * so this package targets the Node runtime, not spec-compliant `WebSocket`
 * environments (browsers, edge/workerd, Deno), where the option is ignored and
 * auth would silently fail. `engines.node` and {@link getWebSocketCtor} guard
 * for the global's presence; typing only the surface we use keeps it
 * dependency-free.
 */
interface NodeWebSocket {
  binaryType: string;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror:
    | ((ev: { message?: string; error?: { message?: string } }) => void)
    | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
}
type NodeWebSocketCtor = new (
  url: string,
  options?: { headers?: Record<string, string> },
) => NodeWebSocket;

function getWebSocketCtor(): NodeWebSocketCtor {
  const ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (ctor == null) {
    throw new Error(
      '@ai-sdk/sandbox-sprites requires a global WebSocket (Node.js >= 22).',
    );
  }
  return ctor as unknown as NodeWebSocketCtor;
}

const WS_FRAME_STDOUT = 0x01;
const WS_FRAME_STDERR = 0x02;
const WS_FRAME_EXIT = 0x03;

/**
 * Thin client over the Sprites control-plane API. Lifecycle (create/get/
 * delete), URL auth, network policy, filesystem and process execution all go
 * through the authenticated cloud endpoint at `baseUrl`; only the bridge URL
 * (resolved separately from a Sprite's public `url`) leaves this surface.
 */
export class SpritesApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor({ apiKey, baseUrl }: { apiKey: string; baseUrl?: string }) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? SPRITES_DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  private spritePath(name: string, suffix = ''): string {
    return `${this.baseUrl}/v1/sprites/${encodeURIComponent(name)}${suffix}`;
  }

  private async request(
    url: string,
    init: RequestInit & { abortSignal?: AbortSignal },
  ): Promise<Response> {
    const { abortSignal, ...rest } = init;
    const response = await fetch(url, {
      ...rest,
      headers: this.authHeaders(rest.headers as Record<string, string>),
      ...(abortSignal ? { signal: abortSignal } : {}),
    });
    return response;
  }

  private async requestOk(
    url: string,
    init: RequestInit & { abortSignal?: AbortSignal },
  ): Promise<Response> {
    const response = await this.request(url, init);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Sprites API ${init.method ?? 'GET'} ${url} failed: ${response.status} ${response.statusText}${
          body ? ` — ${body}` : ''
        }`,
      );
    }
    return response;
  }

  /**
   * Issue a request that returns no useful body, releasing the response stream
   * so undici keep-alive connections are not held checked-out.
   */
  private async requestVoid(
    url: string,
    init: RequestInit & { abortSignal?: AbortSignal },
  ): Promise<void> {
    const response = await this.requestOk(url, init);
    await response.body?.cancel();
  }

  async getSprite(
    name: string,
    abortSignal?: AbortSignal,
  ): Promise<SpriteResource> {
    const response = await this.requestOk(this.spritePath(name), {
      method: 'GET',
      abortSignal,
    });
    return parseSprite(await response.text());
  }

  /**
   * Create a Sprite, or reuse the existing one if a Sprite with the same name
   * already exists. `created` is `true` only on a fresh create — callers wire
   * one-time setup (e.g. `onFirstCreate`) to that.
   */
  async getOrCreateSprite(options: {
    name: string;
    waitForCapacity?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<{ sprite: SpriteResource; created: boolean }> {
    const response = await this.request(`${this.baseUrl}/v1/sprites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: options.name,
        ...(options.waitForCapacity != null
          ? { wait_for_capacity: options.waitForCapacity }
          : {}),
      }),
      abortSignal: options.abortSignal,
    });
    if (response.ok) {
      return {
        sprite: await parseSprite(await response.text()),
        created: true,
      };
    }
    const body = await response.text().catch(() => '');
    const createError = new Error(
      `Sprites API POST ${this.baseUrl}/v1/sprites failed: ${response.status} ${response.statusText}${
        body ? ` — ${body}` : ''
      }`,
    );
    // The platform's "name already taken" status is ambiguous (docs say 400,
    // observed live 409), so probe for the sprite on either status rather than
    // trusting a single code. Only reuse it if the probe actually finds it —
    // otherwise surface the original create error, not the probe's, so a real
    // 4xx/5xx failure is not swallowed by an unrelated getSprite error.
    if (response.status === 400 || response.status === 409) {
      try {
        const sprite = await this.getSprite(options.name, options.abortSignal);
        return { sprite, created: false };
      } catch {
        throw createError;
      }
    }
    throw createError;
  }

  async deleteSprite(name: string, abortSignal?: AbortSignal): Promise<void> {
    const response = await this.request(this.spritePath(name), {
      method: 'DELETE',
      abortSignal,
    });
    // Treat a missing sprite as already deleted.
    if (!response.ok && response.status !== 404) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Sprites API DELETE ${this.spritePath(name)} failed: ${response.status} ${response.statusText}${
          body ? ` — ${body}` : ''
        }`,
      );
    }
    await response.body?.cancel();
  }

  async setUrlAuth(
    name: string,
    auth: SpriteUrlAuth,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    await this.requestVoid(this.spritePath(name), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url_settings: { auth } }),
      abortSignal,
    });
  }

  async setNetworkPolicy(
    name: string,
    rules: ReadonlyArray<SpriteNetworkRule>,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    await this.requestVoid(this.spritePath(name, '/policy/network'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rules }),
      abortSignal,
    });
  }

  async readFile(
    name: string,
    path: string,
    abortSignal?: AbortSignal,
  ): Promise<Uint8Array | null> {
    const url = this.spritePath(
      name,
      // `workingDir` is required by the fs endpoints per the platform docs;
      // paths passed here are always absolute already, so `/` is a no-op base.
      `/fs/read?path=${encodeURIComponent(path)}&workingDir=${encodeURIComponent('/')}`,
    );
    const response = await this.request(url, { method: 'GET', abortSignal });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Sprites API GET ${url} failed: ${response.status} ${response.statusText}${
          body ? ` — ${body}` : ''
        }`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async writeFile(
    name: string,
    path: string,
    content: Uint8Array,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const url = this.spritePath(
      name,
      // See the comment in readFile: `workingDir` is required by the fs
      // endpoints; paths passed here are always absolute already.
      `/fs/write?path=${encodeURIComponent(path)}&workingDir=${encodeURIComponent('/')}`,
    );
    await this.requestVoid(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      // Copy into a fresh ArrayBuffer-backed view so the body is a plain
      // BodyInit regardless of the source buffer's backing.
      body: content.slice(),
      abortSignal,
    });
  }

  /**
   * Execute a process in the Sprite over the control WebSocket. The returned
   * handle streams stdout/stderr (each binary frame is `[type][payload]`:
   * `0x01` stdout, `0x02` stderr, `0x03` exit + code byte) and exposes the
   * exit code via `wait()` (also surfaced as a JSON `{ type: 'exit' }` control
   * message). `kill()` terminates the in-Sprite session.
   *
   * Environment variables ({@link SpriteExecOptions.env}) are **not** sent on
   * the WS query string. A WebSocket handshake is an HTTP GET whose full URL —
   * query included — is routinely captured in server/proxy access logs, so
   * putting secret values there would defeat the reason the SandboxSession
   * contract offers env as an option. Instead they are written to a temporary
   * file inside the Sprite and sourced by a wrapper command, keeping them off
   * the URL entirely. The no-env path is unchanged: no extra round-trip, same
   * query, same behavior as before.
   */
  async exec(
    name: string,
    options: SpriteExecOptions,
  ): Promise<Experimental_SandboxProcess> {
    options.abortSignal?.throwIfAborted();

    let argv: ReadonlyArray<string> = options.argv;
    if (options.env != null && Object.keys(options.env).length > 0) {
      // Random filename so concurrent execs never clobber each other's env.
      const envPath = `/tmp/.ai-sdk-env-${randomUUID()}`;
      await this.writeFile(
        name,
        envPath,
        encodeEnvFile(options.env),
        options.abortSignal,
      );
      // `set -a; . f; set +a` merges the vars into (rather than replacing) the
      // Sprite's default environment, matching the platform's live behavior.
      // `rm -f` runs *before* the payload, so even a crashing or killed
      // command leaves no secret file behind. `exec "$@"` then runs the
      // original argv verbatim — no re-quoting — preserving semantics for
      // every call path (bash -c, raw argv, interactive spawn); `$0` is a
      // label, `"$@"` is the original argv.
      argv = [
        'bash',
        '-c',
        `set -a; . '${envPath}'; set +a; rm -f '${envPath}'; exec "$@"`,
        'ai-sdk-env-wrapper',
        ...options.argv,
      ];
    }

    return this.connectExec(name, argv, options.cwd, options.abortSignal);
  }

  private connectExec(
    name: string,
    argv: ReadonlyArray<string>,
    cwd: string | undefined,
    abortSignal: AbortSignal | undefined,
  ): Experimental_SandboxProcess {
    const WebSocketCtor = getWebSocketCtor();

    const query = new URLSearchParams();
    for (const arg of argv) query.append('cmd', arg);
    if (cwd != null) query.set('dir', cwd);

    const wsBase = this.baseUrl.replace(/^http(s?):\/\//, 'ws$1://');
    const url = `${wsBase}/v1/sprites/${encodeURIComponent(name)}/exec?${query.toString()}`;

    let stdoutController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    let stderrController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        stdoutController = controller;
      },
    });
    const stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        stderrController = controller;
      },
    });

    let sessionId: string | undefined;
    let exitCode: number | undefined;
    let exitObserved = false;
    let settled = false;
    let socketError: Error | undefined;
    // Promises for in-flight control-message parses. `wait()`/`kill()` drain
    // these before reading `exitCode`/`sessionId` so a clean exit delivered only
    // as a JSON `{type:'exit'}` frame is never lost to the close→resolve race.
    const pendingParses: Array<Promise<void>> = [];
    let onAbort: (() => void) | undefined;
    let resolveClosed!: () => void;
    const closed = new Promise<void>(resolve => {
      resolveClosed = resolve;
    });

    // The full `url` carries `cmd`/`dir` (the command text, potentially
    // sensitive) in its query string; never embed it in a user-facing error.
    // (Env values are routed through a temp file, never the query — see exec.)
    const safeUrl = `${wsBase}/v1/sprites/${encodeURIComponent(name)}/exec`;

    const ws = new WebSocketCtor(url, { headers: this.authHeaders() });
    ws.binaryType = 'arraybuffer';

    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (onAbort != null && abortSignal != null) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      stdoutController?.close();
      stderrController?.close();
      resolveClosed();
    };

    ws.onmessage = event => {
      const data = event.data;
      if (typeof data === 'string') {
        pendingParses.push(
          safeParseJSON({ text: data }).then(result => {
            if (!result.success) return;
            const message = result.value as {
              type?: string;
              [k: string]: unknown;
            };
            if (message.type === 'session_info') {
              const id = message['session_id'];
              if (typeof id === 'string') sessionId = id;
            } else if (message.type === 'exit') {
              const code = message['exit_code'];
              if (typeof code === 'number') {
                exitCode = code;
                exitObserved = true;
              }
            }
          }),
        );
        return;
      }
      if (data instanceof ArrayBuffer && data.byteLength > 0) {
        const bytes = new Uint8Array(data);
        const payload = bytes.subarray(1);
        switch (bytes[0]) {
          case WS_FRAME_STDOUT:
            stdoutController?.enqueue(payload);
            break;
          case WS_FRAME_STDERR:
            stderrController?.enqueue(payload);
            break;
          case WS_FRAME_EXIT:
            exitObserved = true;
            if (payload.byteLength > 0) exitCode = payload[0];
            break;
        }
      }
    };

    ws.onerror = event => {
      // Record on any error (pre- or post-open) so a mid-stream drop is not
      // mistaken for a clean finish. Query string omitted (see safeUrl).
      socketError ??= new Error(
        `Sprites exec WebSocket error for ${safeUrl}: ${
          event.message ?? event.error?.message ?? 'unknown error'
        }`,
      );
    };

    ws.onclose = () => {
      finish();
    };

    const killSession = async (): Promise<void> => {
      // Ensure session_info has been parsed so we know the session id.
      await Promise.allSettled(pendingParses);
      if (sessionId != null) {
        await this.request(
          this.spritePath(name, `/exec/${encodeURIComponent(sessionId)}/kill`),
          { method: 'POST' },
        )
          .then(res => res.body?.cancel())
          .catch(() => {});
      }
      try {
        ws.close();
      } catch {
        // already closing/closed
      }
    };

    if (abortSignal != null) {
      onAbort = (): void => {
        void killSession();
      };
      if (abortSignal.aborted) {
        onAbort();
      } else {
        abortSignal.addEventListener('abort', onAbort);
      }
    }

    return {
      stdout,
      stderr,
      async wait(): Promise<{ exitCode: number }> {
        await closed;
        await Promise.allSettled(pendingParses);
        // A genuine exit (JSON `{type:'exit'}` or the `0x03` frame) wins, even
        // if an abort raced in at the same instant the process completed.
        if (exitObserved) {
          return { exitCode: exitCode ?? 0 };
        }
        if (abortSignal?.aborted) {
          throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        // Closed without ever reporting an exit: a dropped/abnormal connection.
        // Surface it rather than masquerading as a successful `exitCode: 0`.
        throw (
          socketError ??
          new Error(
            `Sprites exec connection closed before the process reported an exit code (${safeUrl}).`,
          )
        );
      },
      async kill(): Promise<void> {
        await killSession();
      },
    };
  }
}

/**
 * Serialize env vars into a bash-sourceable file (used with `set -a` so each
 * assignment is auto-exported). Values are single-quoted with the `'\''`
 * escape so arbitrary characters — spaces, `$`, quotes, newlines — are taken
 * literally, never re-interpreted by the shell.
 */
function encodeEnvFile(env: Record<string, string>): Uint8Array {
  const body = Object.entries(env)
    .map(([key, value]) => `${key}='${value.replace(/'/g, `'\\''`)}'`)
    .join('\n');
  return new TextEncoder().encode(`${body}\n`);
}

async function parseSprite(text: string): Promise<SpriteResource> {
  const parsed = await safeParseJSON({ text });
  if (!parsed.success) {
    throw new Error(`Sprites API returned a non-JSON response: ${text}`);
  }
  const record = parsed.value as {
    id?: unknown;
    name?: unknown;
    status?: unknown;
    url?: unknown;
    url_settings?: { auth?: unknown };
  };
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.url !== 'string'
  ) {
    throw new Error(`Sprites API returned an unexpected sprite shape: ${text}`);
  }
  const auth = record.url_settings?.auth;
  return {
    id: record.id,
    name: record.name,
    status: typeof record.status === 'string' ? record.status : 'unknown',
    url: record.url,
    ...(auth === 'public' || auth === 'sprite' ? { urlAuth: auth } : {}),
  };
}
