import dns from 'node:dns';
import { createServer, type Server } from 'node:http';
import {
  DownloadError,
  fetchWithValidatedRedirects,
} from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuardedFetch, type GuardedFetch } from './create-guarded-fetch';

let server: Server;
let origin: string;
const transports: GuardedFetch[] = [];
const onConnection = vi.fn();
const onRequest = vi.fn();

function mockPrivateDns() {
  return vi.spyOn(dns, 'lookup').mockImplementation(((
    _host: string,
    _options: dns.LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      addresses: dns.LookupAddress[],
    ) => void,
  ) => {
    queueMicrotask(() => callback(null, [{ address: '127.0.0.1', family: 4 }]));
  }) as typeof dns.lookup);
}

function create(options?: Parameters<typeof createGuardedFetch>[0]) {
  const fetch = createGuardedFetch(options);
  transports.push(fetch);
  return fetch;
}

beforeEach(async () => {
  vi.clearAllMocks();
  server = createServer(async (request, response) => {
    onRequest(request.headers);
    response.setHeader('Connection', 'close');
    if (request.url === '/redirect') {
      response.writeHead(302, { location: 'http://files.example.com/file' });
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.end(chunks.length > 0 ? Buffer.concat(chunks) : 'content');
  });
  server.on('connection', onConnection);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address == null || typeof address === 'string')
    throw new Error('No TCP listener');
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all(transports.splice(0).map(fetch => fetch.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('createGuardedFetch', () => {
  it('rejects private DNS results before connecting, independently of global fetch', async () => {
    const lookup = mockPrivateDns();
    const fetch = create();
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);

    await expect(fetch('http://files.example.com/file')).rejects.toMatchObject({
      cause: { name: 'AI_DownloadError' },
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith(
      'files.example.com',
      expect.objectContaining({ all: true }),
      expect.any(Function),
    );
    expect(globalFetch).not.toHaveBeenCalled();
    expect(onConnection).not.toHaveBeenCalled();
  });

  it.each([
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://localhost/',
    'file:///tmp/file',
  ])('rejects an unsafe literal URL %s', async url => {
    await expect(create()(url)).rejects.toThrow(DownloadError);
    expect(onConnection).not.toHaveBeenCalled();
  });

  it('allows only explicitly trusted private origins', async () => {
    const fetch = create({ trustedOrigins: [`${origin}/api`] });
    await expect((await fetch(`${origin}/file`)).text()).resolves.toBe(
      'content',
    );
    await expect(fetch('http://127.0.0.1:1/file')).rejects.toThrow(
      DownloadError,
    );
    await expect(
      fetch(origin.replace('127.0.0.1', 'localhost')),
    ).rejects.toThrow(DownloadError);
    expect(onConnection).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'follow', 'error'] as const)(
    'does not automatically follow redirects with redirect %s',
    async redirect => {
      const fetch = create({ trustedOrigins: [origin] });
      await expect(fetch(`${origin}/redirect`, { redirect })).rejects.toThrow(
        'fetch failed',
      );
      expect(onConnection).toHaveBeenCalledTimes(1);
    },
  );

  it('returns manual redirects and revalidates their targets through SDK helpers', async () => {
    const lookup = mockPrivateDns();
    const fetch = create({ trustedOrigins: [origin] });
    const response = await fetch(`${origin}/redirect`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    await response.body?.cancel();
    await expect(
      fetchWithValidatedRedirects({
        url: `${origin}/redirect`,
        trustedOrigin: origin,
        fetch,
      }),
    ).rejects.toMatchObject({ cause: { name: 'AI_DownloadError' } });
    expect(lookup).toHaveBeenCalledTimes(1);
    // Only the explicitly trusted first hops connected.
    expect(onConnection).toHaveBeenCalledTimes(2);
  });

  it('accepts native Request objects and preserves body, headers, and init overrides', async () => {
    const fetch = create({ trustedOrigins: [origin] });
    const request = new Request(`${origin}/echo`, {
      method: 'POST',
      body: 'request body',
      headers: { 'x-test': 'old' },
    });
    const response = await fetch(request, { headers: { 'x-test': 'new' } });
    await expect(response.text()).resolves.toBe('request body');
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ 'x-test': 'new' }),
    );
  });

  it('preserves multipart form bodies', async () => {
    const fetch = create({ trustedOrigins: [origin] });
    const body = new FormData();
    body.set('prompt', 'hello');
    const response = await fetch(origin, { method: 'POST', body });
    await expect(response.text()).resolves.toContain('hello');
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        'content-type': expect.stringContaining(
          'multipart/form-data; boundary=',
        ),
      }),
    );
  });

  it.each(['url', 'request'] as const)(
    'preserves keepalive uploads from a %s input',
    async input => {
      const fetch = create({ trustedOrigins: [origin] });
      const init = { method: 'POST', body: 'content', keepalive: true };
      const response =
        input === 'request'
          ? await fetch(new Request(origin, init))
          : await fetch(origin, init);
      await expect(response.text()).resolves.toBe('content');
      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          'content-length': '7',
        }),
      );
    },
  );

  it('does not accept a dispatcher override', async () => {
    mockPrivateDns();
    const fetch = create();
    const dispatch = vi.fn();
    await expect(
      fetch('http://files.example.com/file', {
        dispatcher: { dispatch },
      } as RequestInit),
    ).rejects.toMatchObject({ cause: { name: 'AI_DownloadError' } });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onConnection).not.toHaveBeenCalled();
  });

  it('preserves abort signals', async () => {
    const fetch = create({ trustedOrigins: [origin] });
    await expect(
      fetch(origin, { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(onConnection).not.toHaveBeenCalled();
  });

  it('closes its pools and refuses subsequent requests', async () => {
    const fetch = create({ trustedOrigins: [origin] });
    await (await fetch(origin)).text();
    await fetch.close();
    await expect(fetch(origin)).rejects.toThrow();
  });

  it.each(['file:///tmp/file', 'https://user:password@example.com/'])(
    'rejects an invalid trusted origin %s',
    trustedOrigin => {
      expect(() => create({ trustedOrigins: [trustedOrigin] })).toThrow(
        TypeError,
      );
    },
  );
});
