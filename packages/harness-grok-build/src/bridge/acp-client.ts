export type AcpClient = {
  request: (method: string, params?: unknown) => Promise<unknown>;
  notify: (method: string, params?: unknown) => void;
  onNotification: (method: string, handler: (params: unknown) => void) => void;
  onRequest: (
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ) => void;
  handleLine: (line: string) => void;
};

export type AcpTransport = {
  writeLine: (line: string) => void;
};

const METHOD_NOT_FOUND = -32601;

export function createAcpClient(io: AcpTransport): AcpClient {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  const notificationHandlers = new Map<string, (params: unknown) => void>();
  const requestHandlers = new Map<
    string,
    (params: unknown) => unknown | Promise<unknown>
  >();

  const write = (message: unknown) =>
    io.writeLine(JSON.stringify({ jsonrpc: '2.0', ...(message as object) }));

  const request = (method: string, params?: unknown): Promise<unknown> => {
    const id = nextId++;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      write({ id, method, params });
    });
  };

  const notify = (method: string, params?: unknown): void => {
    write({ method, params });
  };

  const onNotification = (
    method: string,
    handler: (params: unknown) => void,
  ): void => {
    notificationHandlers.set(method, handler);
  };

  const onRequest = (
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ): void => {
    requestHandlers.set(method, handler);
  };

  const handleResponse = (msg: Record<string, unknown>): void => {
    const entry = pending.get(msg.id as number);
    if (!entry) return;
    pending.delete(msg.id as number);
    if ('error' in msg) entry.reject(msg.error);
    else entry.resolve(msg.result);
  };

  const handleIncomingRequest = (msg: Record<string, unknown>): void => {
    const id = msg.id;
    const handler = requestHandlers.get(msg.method as string);
    if (!handler) {
      write({
        id,
        error: { code: METHOD_NOT_FOUND, message: 'Method not found' },
      });
      return;
    }
    Promise.resolve()
      .then(() => handler(msg.params))
      .then(result => write({ id, result }))
      .catch(err =>
        write({ id, error: { code: -32603, message: String(err) } }),
      );
  };

  const handleLine = (line: string): void => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if ('method' in msg) {
      if ('id' in msg) handleIncomingRequest(msg);
      else notificationHandlers.get(msg.method as string)?.(msg.params);
      return;
    }
    if ('id' in msg) handleResponse(msg);
  };

  return { request, notify, onNotification, onRequest, handleLine };
}
