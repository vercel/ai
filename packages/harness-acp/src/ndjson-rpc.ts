export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface NdjsonTransport {
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): () => void;
  close(): Promise<void>;
}

type RequestHandler = (params: unknown, id: number) => Promise<unknown>;

export class NdjsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly notificationHandlers = new Map<
    string,
    Array<(params: unknown) => void | Promise<void>>
  >();
  private readonly requestHandlers = new Map<string, RequestHandler>();

  constructor(private readonly transport: NdjsonTransport) {
    this.transport.onMessage((message) => {
      void this.handleMessage(message);
    });
  }

  onNotification(method: string, handler: (params: unknown) => void | Promise<void>): () => void {
    const handlers = this.notificationHandlers.get(method) ?? [];
    handlers.push(handler);
    this.notificationHandlers.set(method, handlers);
    return () => {
      const current = this.notificationHandlers.get(method) ?? [];
      this.notificationHandlers.set(
        method,
        current.filter((entry) => entry !== handler),
      );
    };
  }

  onRequest(method: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(method, handler);
    return () => {
      this.requestHandlers.delete(method);
    };
  }

  async request(method: string, params?: unknown, timeoutMs = 120_000): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      void this.transport.send(payload).catch((error) => {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.transport.send({ jsonrpc: "2.0", method, params });
  }

  respond(id: number, result: unknown): Promise<void> {
    return this.transport.send({ jsonrpc: "2.0", id, result });
  }

  respondError(id: number, message: string): Promise<void> {
    return this.transport.send({
      jsonrpc: "2.0",
      id,
      error: { message },
    });
  }

  async close(): Promise<void> {
    for (const [, pending] of this.pending) {
      pending.reject(new Error("RPC client closed"));
    }
    this.pending.clear();
    await this.transport.close();
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    if (
      "method" in message &&
      message.method &&
      "id" in message &&
      typeof message.id === "number"
    ) {
      const handler = this.requestHandlers.get(message.method);
      if (handler) {
        try {
          const result = await handler(message.params, message.id);
          await this.respond(message.id, result);
        } catch (error) {
          await this.respondError(
            message.id,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      return;
    }

    if ("method" in message && message.method && !("id" in message)) {
      const handlers = this.notificationHandlers.get(message.method) ?? [];
      for (const handler of handlers) {
        await handler(message.params);
      }
      return;
    }

    if (!("id" in message) || typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if ("error" in message && message.error) {
      pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      return;
    }

    pending.resolve("result" in message ? (message.result ?? {}) : {});
  }
}

export function parseNdjsonLine(line: string): JsonRpcMessage | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed) as JsonRpcMessage;
}