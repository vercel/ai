import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

type JsonRpcId = number | string;

type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type CodexAppServerNotification = {
  method: string;
  params?: unknown;
};

export type CodexAppServerRequest = CodexAppServerNotification & {
  id: JsonRpcId;
};

export class CodexAppServerRequestError extends Error {
  readonly method: string;
  readonly code: number;
  readonly data: unknown;

  constructor({ method, error }: { method: string; error: JsonRpcError }) {
    super(`Codex app-server ${method} failed: ${error.message}`);
    this.name = 'CodexAppServerRequestError';
    this.method = method;
    this.code = error.code;
    this.data = error.data;
  }
}

export class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly onNotification: (
    notification: CodexAppServerNotification,
  ) => void;
  private readonly onRequest: (
    request: CodexAppServerRequest,
  ) => Promise<unknown>;
  private readonly onStderr: (text: string) => void;
  private readonly pending = new Map<
    JsonRpcId,
    {
      method: string;
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    }
  >();
  private nextRequestId = 1;
  private stdoutBuffer = '';
  private parseQueue = Promise.resolve();
  private closed = false;
  private failure: unknown;
  private readonly failed: Promise<unknown>;
  private resolveFailure: (error: unknown) => void = () => {};
  private exitResult: {
    code: number | null;
    signal: NodeJS.Signals | null;
  } | null = null;
  private readonly exited: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>;

  constructor({
    executable,
    args,
    cwd,
    env,
    onNotification,
    onRequest,
    onStderr,
  }: {
    executable: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    onNotification: (notification: CodexAppServerNotification) => void;
    onRequest: (request: CodexAppServerRequest) => Promise<unknown>;
    onStderr: (text: string) => void;
  }) {
    this.onNotification = onNotification;
    this.onRequest = onRequest;
    this.onStderr = onStderr;
    this.failed = new Promise(resolve => {
      this.resolveFailure = resolve;
    });
    this.child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.exited = new Promise(resolve => {
      this.child.once('exit', (code, signal) => {
        this.exitResult = { code, signal };
        this.fail(
          new Error(
            `Codex app-server exited (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`,
          ),
        );
        resolve(this.exitResult);
      });
    });
    this.child.once('error', error => this.fail(error));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => this.consumeStdout(String(chunk)));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', chunk => this.onStderr(String(chunk)));
  }

  async initialize({
    clientName,
    clientVersion,
  }: {
    clientName: string;
    clientVersion: string;
  }): Promise<void> {
    await this.request({
      method: 'initialize',
      params: {
        clientInfo: { name: clientName, version: clientVersion },
        capabilities: { experimentalApi: true },
      },
    });
    this.notify({ method: 'initialized' });
  }

  request({
    method,
    params,
  }: {
    method: string;
    params?: unknown;
  }): Promise<unknown> {
    if (this.closed || this.exitResult != null) {
      return Promise.reject(new Error('Codex app-server is not running.'));
    }
    const id = this.nextRequestId++;
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
    });
    try {
      this.write({ id, method, ...(params === undefined ? {} : { params }) });
    } catch (error) {
      this.pending.delete(id);
      return Promise.reject(error);
    }
    return response;
  }

  notify({ method, params }: { method: string; params?: unknown }): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    if (await this.waitForExit({ timeoutMs: 500 })) return;
    this.child.kill('SIGTERM');
    if (await this.waitForExit({ timeoutMs: 1_000 })) return;
    this.child.kill('SIGKILL');
    await this.waitForExit({ timeoutMs: 1_000 });
  }

  waitUntilExit(): Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }> {
    return this.exited;
  }

  waitUntilFailure(): Promise<never> {
    return this.failed.then(error => {
      throw error;
    });
  }

  private write(message: Record<string, unknown>): void {
    if (this.closed || this.exitResult != null || !this.child.stdin.writable) {
      throw new Error('Codex app-server is not writable.');
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.length > 0) {
        this.parseQueue = this.parseQueue
          .then(() => this.processLine(line))
          .catch(error => this.fail(error));
      }
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  private async processLine(line: string): Promise<void> {
    /*
     * Bridge code runs in an isolated runtime where provider-utils is not
     * available. The app-server is the bridge's own child process, and every
     * JSON-RPC field consumed below is checked before it is used.
     */
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      throw new Error('Codex app-server wrote an invalid JSON-RPC message.');
    }
    if (!isRecord(message)) {
      throw new Error('Codex app-server wrote an invalid JSON-RPC message.');
    }
    if (typeof message.method === 'string') {
      if (isJsonRpcId(message.id)) {
        void this.handleServerRequest({
          id: message.id,
          method: message.method,
          ...(message.params === undefined ? {} : { params: message.params }),
        });
      } else {
        this.onNotification({
          method: message.method,
          ...(message.params === undefined ? {} : { params: message.params }),
        });
      }
      return;
    }
    if (!isJsonRpcId(message.id)) {
      throw new Error('Codex app-server response is missing a valid id.');
    }
    const pending = this.pending.get(message.id);
    if (pending == null) return;
    this.pending.delete(message.id);
    if (isJsonRpcError(message.error)) {
      pending.reject(
        new CodexAppServerRequestError({
          method: pending.method,
          error: message.error,
        }),
      );
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(message, 'result')) {
      pending.reject(
        new Error(`Codex app-server ${pending.method} response has no result.`),
      );
      return;
    }
    pending.resolve(message.result);
  }

  private async handleServerRequest(
    request: CodexAppServerRequest,
  ): Promise<void> {
    try {
      const result = await this.onRequest(request);
      if (!this.closed && this.exitResult == null) {
        this.write({ id: request.id, result });
      }
    } catch (error) {
      if (!this.closed && this.exitResult == null) {
        this.write({
          id: request.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private failPending(error: unknown): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private fail(error: unknown): void {
    this.failPending(error);
    if (this.failure !== undefined) return;
    this.failure = error;
    this.resolveFailure(error);
  }

  private async waitForExit({
    timeoutMs,
  }: {
    timeoutMs: number;
  }): Promise<boolean> {
    if (this.exitResult != null) return true;
    return Promise.race([
      this.exited.then(() => true),
      new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        timer.unref?.();
      }),
    ]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || typeof value === 'number';
}

function isJsonRpcError(value: unknown): value is JsonRpcError {
  return (
    isRecord(value) &&
    typeof value.code === 'number' &&
    typeof value.message === 'string'
  );
}
