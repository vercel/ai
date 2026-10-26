import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createFal } from '@ai-sdk/fal';
import { createMCPClient } from '@ai-sdk/mcp';
import {
  fetchUntrustedUrl,
  fetchWithValidatedRedirects,
  validateDownloadUrl,
} from '@ai-sdk/provider-utils';
import { createDownload, generateImage } from 'ai';
import {
  createGuardedFetch,
  isSafeIpAddress,
  type GuardedFetch,
} from 'guarded-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;
let handler: Handler;
let server: ReturnType<typeof createServer>;
let providerOrigin: string;
let fileOrigin: string;
const transports: GuardedFetch[] = [];
const received = vi.fn();

function create(options?: Parameters<typeof createGuardedFetch>[0]) {
  const fetch = createGuardedFetch(options);
  transports.push(fetch);
  return fetch;
}

function resolveTo(addresses: dns.LookupAddress[]) {
  return vi
    .spyOn(dns, 'lookup')
    .mockImplementation(((
      _hostname: string,
      options: dns.LookupOptions,
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string | dns.LookupAddress[],
        family?: number,
      ) => void,
    ) =>
      queueMicrotask(() =>
        options.all
          ? callback(null, addresses)
          : callback(null, addresses[0]?.address ?? '', addresses[0]?.family),
      )) as typeof dns.lookup);
}

beforeEach(async () => {
  received.mockReset();
  handler = (_request, response) => {
    response.end('content');
  };
  server = createServer((request, response) => {
    received(request.url, request.headers);
    response.setHeader('connection', 'close');
    Promise.resolve(handler(request, response)).catch(() => {
      response.writeHead(500).end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('No TCP listener');
  providerOrigin = `http://provider.example.com:${address.port}`;
  fileOrigin = `http://files.example.com:${address.port}`;
});

afterEach(async () => {
  await Promise.all(transports.splice(0).map(fetch => fetch.close()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('AI SDK with the patched standalone guarded-fetch', () => {
  it('preserves every IP literal block in the SDK URL validation corpus', () => {
    const source = readFileSync(
      new URL(
        '../../../../packages/provider-utils/src/validate-download-url.test.ts',
        import.meta.url,
      ),
      'utf8',
    );
    let compared = 0;
    for (const match of source.matchAll(/'(https?:\/\/[^']+)'/g)) {
      const url = new URL(match[1]);
      const address = url.hostname.replace(/^\[|\]$/g, '');
      if (!net.isIP(address)) continue;
      let blocked = false;
      try {
        validateDownloadUrl(url.toString());
      } catch {
        blocked = true;
      }
      if (blocked) {
        expect(isSafeIpAddress(address), address).toBe(false);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(40);
  });

  it('preserves inline data URL downloads', async () => {
    const result = await createDownload({ fetch: create() })({
      url: new URL('data:text/plain;base64,aGVsbG8='),
    });
    expect(new TextDecoder().decode(result.data)).toBe('hello');
  });
  it.each(
    [
      [{ address: '127.0.0.1', family: 4 }],
      [
        { address: '8.8.8.8', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ],
      [{ address: '::1', family: 6 }],
      [],
      [{ address: '8.8.8.8', family: 6 }],
    ].map(addresses => ({ addresses })),
  )(
    'blocks unsafe DNS results before core downloads connect: $addresses',
    async ({ addresses }) => {
      resolveTo(addresses);
      const download = createDownload({ fetch: create() });
      await expect(
        download({ url: new URL(`${fileOrigin}/file`) }),
      ).rejects.toThrow();
      expect(received).not.toHaveBeenCalled();
    },
  );

  it('uses the injected transport for core downloads independently of global fetch', async () => {
    resolveTo([{ address: '127.0.0.1', family: 4 }]);
    // These exact origins are trusted solely to reach this test's local server.
    const fetch = create({ trustedOrigins: [fileOrigin] });
    const globalFetch = vi.fn(() => {
      throw new Error('Global fetch must not run');
    });
    vi.stubGlobal('fetch', globalFetch);
    const result = await createDownload({ fetch })({
      url: new URL(`${fileOrigin}/file`),
    });
    expect(new TextDecoder().decode(result.data)).toBe('content');
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('keeps SDK redirect credential isolation across origins and on return', async () => {
    resolveTo([{ address: '127.0.0.1', family: 4 }]);
    const fetch = create({ trustedOrigins: [providerOrigin, fileOrigin] });
    handler = (request, response) => {
      if (request.url === '/start')
        response.writeHead(302, { location: `${fileOrigin}/foreign` }).end();
      else if (request.url === '/foreign')
        response.writeHead(302, { location: `${providerOrigin}/end` }).end();
      else response.end('done');
    };
    const response = await fetchWithValidatedRedirects({
      url: `${providerOrigin}/start`,
      fetch,
      trustedOrigin: providerOrigin,
      headers: {
        authorization: 'Bearer test-secret',
        'x-vendor-key': 'test-secret',
        'user-agent': 'test-client',
      },
    });
    expect(await response.text()).toBe('done');
    expect(received.mock.calls[0][1]).toMatchObject({
      authorization: 'Bearer test-secret',
      'x-vendor-key': 'test-secret',
    });
    for (const [, headers] of received.mock.calls.slice(1)) {
      expect(headers.authorization).toBeUndefined();
      expect(headers['x-vendor-key']).toBeUndefined();
      expect(headers['user-agent']).toBe('test-client');
    }
  });

  it('withholds custom credentials from an untrusted first hop', async () => {
    resolveTo([{ address: '127.0.0.1', family: 4 }]);
    const fetch = create({ trustedOrigins: [fileOrigin] });
    const response = await fetchUntrustedUrl({
      url: `${fileOrigin}/file`,
      fetch,
      credentialedOrigin: providerOrigin,
      headers: {
        authorization: 'test-secret',
        'x-vendor-key': 'test-secret',
        accept: 'text/plain',
      },
    });
    await response.text();
    expect(received.mock.calls[0][1]).toMatchObject({ accept: 'text/plain' });
    expect(received.mock.calls[0][1].authorization).toBeUndefined();
    expect(received.mock.calls[0][1]['x-vendor-key']).toBeUndefined();
  });

  it('uses the same transport for Fal generation and response URL downloads without disclosing its API key', async () => {
    resolveTo([{ address: '127.0.0.1', family: 4 }]);
    const fetch = create({ trustedOrigins: [providerOrigin, fileOrigin] });
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7mUAAAAASUVORK5CYII=',
      'base64',
    );
    handler = (request, response) => {
      if (request.url === '/model') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            images: [{ url: `${fileOrigin}/image`, content_type: 'image/png' }],
          }),
        );
      } else {
        response.setHeader('content-type', 'image/png');
        response.end(image);
      }
    };
    const fal = createFal({
      baseURL: providerOrigin,
      apiKey: 'test-secret',
      fetch,
    });
    const result = await generateImage({
      model: fal.image('model'),
      prompt: 'test',
      maxRetries: 0,
    });
    expect(result.image.uint8Array).toEqual(new Uint8Array(image));
    expect(received.mock.calls[0][1].authorization).toBe('Key test-secret');
    expect(received.mock.calls[1][1].authorization).toBeUndefined();
  });

  it('initializes MCP and lists tools through real HTTP event streams', async () => {
    resolveTo([{ address: '127.0.0.1', family: 4 }]);
    const fetch = create({ trustedOrigins: [providerOrigin] });
    handler = async (request, response) => {
      if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const message = JSON.parse(Buffer.concat(chunks).toString());
      if (message.id === undefined) {
        response.writeHead(202).end();
        return;
      }
      const result =
        message.method === 'initialize'
          ? {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'local', version: '1' },
            }
          : {
              tools: [
                {
                  name: 'echo',
                  description: 'Echo',
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
            };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`,
      );
    };
    const client = await createMCPClient({
      protocolVersionDiscovery: false,
      transport: { type: 'http', url: `${providerOrigin}/mcp`, fetch },
    });
    try {
      expect(await client.tools()).toHaveProperty('echo');
    } finally {
      await client.close();
    }
  });
});
