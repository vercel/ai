import { createServer } from 'node:http';

/** A separate loopback callback listener for each request's OAuth flow. */
export async function createAuthorizationCallback(
  expectedState: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let resolveCode!: (value: {
    code: string;
    state: string;
    issuer?: string;
  }) => void;
  let rejectCode!: (error: Error) => void;
  const authorizationCode = new Promise<{
    code: string;
    state: string;
    issuer?: string;
  }>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Discovery may fail before the route starts awaiting the callback.
  void authorizationCode.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const close = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    server.close();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    rejectCode(error);
    close();
  };
  const onAbort = () => fail(new Error('Authorization request aborted'));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || url.pathname !== '/callback') {
      res.writeHead(404).end('Not found');
      return;
    }
    if (settled || url.searchParams.get('state') !== expectedState) {
      res.writeHead(400).end('Invalid authorization state');
      return;
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) {
      res.writeHead(400).end('Authorization failed');
      fail(new Error('Authorization failed'));
      return;
    }
    settled = true;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Authorization successful. You can close this window.');
    resolveCode({
      code,
      state: expectedState,
      issuer: url.searchParams.get('iss') ?? undefined,
    });
    close();
  });
  server.on('error', fail);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    close();
    throw new Error('Could not start OAuth callback listener');
  }
  timer = setTimeout(() => fail(new Error('Authorization timed out')), 300000);
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
    signal.throwIfAborted();
  }

  return {
    redirectUrl: `http://127.0.0.1:${address.port}/callback`,
    authorizationCode,
    close,
  };
}
