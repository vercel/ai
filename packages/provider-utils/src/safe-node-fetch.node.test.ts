import dns from 'node:dns';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = globalThis.fetch;
const onConnection = vi.fn();
let server: Server;
let url: string;

const lookup = vi.fn(
  (
    _hostname: string,
    options: dns.LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    queueMicrotask(() => {
      if (options.all) {
        callback(null, [{ address: '127.0.0.1', family: 4 }]);
      } else {
        callback(null, '127.0.0.1', 4);
      }
    });
  },
);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(dns, 'lookup').mockImplementation(
    lookup as unknown as typeof dns.lookup,
  );

  server = createServer((_request, response) => {
    response.setHeader('Connection', 'close');
    response.end('private content');
  });
  server.on('connection', onConnection);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected a TCP listener');
  }
  url = `http://files.example.com:${address.port}/file`;
  lookup.mockClear();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe.each(['before', 'after'] as const)(
  'global fetch wrapped %s module initialization',
  timing => {
    it.each(['endpoint', 'redirects', 'forwarded global', 'blob'] as const)(
      'blocks a private DNS result before connecting (%s)',
      async entryPoint => {
        const wrappedFetch = vi.fn<typeof globalThis.fetch>((input, init) =>
          originalFetch(input, init),
        );
        if (timing === 'before') {
          vi.stubGlobal('fetch', wrappedFetch);
        }
        const { fetchWithValidatedEndpoint, fetchWithValidatedRedirects } =
          await import('./fetch-with-validated-redirects');
        const { downloadBlob } = await import('./download-blob');
        if (timing === 'after') {
          vi.stubGlobal('fetch', wrappedFetch);
        }

        // Prove the same hostname reaches the local listener without the guard.
        await expect((await wrappedFetch(url)).text()).resolves.toBe(
          'private content',
        );
        expect(onConnection).toHaveBeenCalledTimes(1);
        vi.clearAllMocks();

        const request =
          entryPoint === 'endpoint'
            ? fetchWithValidatedEndpoint({ url })
            : entryPoint === 'blob'
              ? downloadBlob(url)
              : fetchWithValidatedRedirects({
                  url,
                  fetch:
                    entryPoint === 'forwarded global'
                      ? globalThis.fetch
                      : undefined,
                });

        // Undici wraps the validating lookup's DownloadError as the cause.
        const dnsError = {
          name: 'AI_DownloadError',
          message: expect.stringContaining(
            'resolved to disallowed IP address 127.0.0.1',
          ),
        };
        await expect(request).rejects.toMatchObject({
          cause: entryPoint === 'blob' ? { cause: dnsError } : dnsError,
        });
        expect(lookup).toHaveBeenCalledExactlyOnceWith(
          'files.example.com',
          expect.objectContaining({ all: true }),
          expect.any(Function),
        );
        expect(wrappedFetch).not.toHaveBeenCalled();
        expect(onConnection).not.toHaveBeenCalled();
      },
    );
  },
);

it('still validates DNS when global fetch is unavailable at import time', async () => {
  vi.stubGlobal('fetch', undefined);
  const { fetchWithValidatedEndpoint } =
    await import('./fetch-with-validated-redirects');

  await expect(fetchWithValidatedEndpoint({ url })).rejects.toMatchObject({
    cause: {
      name: 'AI_DownloadError',
      message: expect.stringContaining(
        'resolved to disallowed IP address 127.0.0.1',
      ),
    },
  });
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(onConnection).not.toHaveBeenCalled();
});

it('uses an explicitly supplied custom transport', async () => {
  const { fetchWithValidatedEndpoint } =
    await import('./fetch-with-validated-redirects');
  const response = await fetchWithValidatedEndpoint({
    url,
    fetch: (input, init) => originalFetch(input, init),
  });

  await expect(response.text()).resolves.toBe('private content');
  expect(onConnection).toHaveBeenCalledTimes(1);
});

it('does not fall back to global fetch when loading Node built-ins fails', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const error = new Error('Node built-in loading failed');
  vi.spyOn(process, 'getBuiltinModule').mockImplementation(() => {
    throw error;
  });
  const { fetchWithValidatedEndpoint } =
    await import('./fetch-with-validated-redirects');

  await expect(fetchWithValidatedEndpoint({ url })).rejects.toBe(error);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
  expect(onConnection).not.toHaveBeenCalled();
});

it.each(['endpoint', 'redirects'] as const)(
  'uses wrapped global fetch for a trusted origin (%s)',
  async entryPoint => {
    const wrappedFetch = vi.fn<typeof globalThis.fetch>((input, init) =>
      originalFetch(input, init),
    );
    vi.stubGlobal('fetch', wrappedFetch);
    const { fetchWithValidatedEndpoint, fetchWithValidatedRedirects } =
      await import('./fetch-with-validated-redirects');
    const options = { url, trustedOrigin: new URL(url).origin };
    const response =
      entryPoint === 'endpoint'
        ? await fetchWithValidatedEndpoint(options)
        : await fetchWithValidatedRedirects(options);

    await expect(response.text()).resolves.toBe('private content');
    expect(wrappedFetch).toHaveBeenCalledTimes(1);
    expect(onConnection).toHaveBeenCalledTimes(1);
  },
);
