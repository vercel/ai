import { createServer, type Server } from 'node:http';
import {
  gzipSync,
  deflateSync,
  deflateRawSync,
  brotliCompressSync,
} from 'node:zlib';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  getDefaultDownloadFetch,
  createSafeNodeFetch,
} from './safe-node-fetch';

let server: Server;
let origin: string;
beforeEach(async () => {
  server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address == null || typeof address === 'string')
    throw new Error('Expected TCP address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }),
  );
});

// Exercise the transport directly using a literal loopback address (no DNS).
// Production callers validate URLs before entering this transport; separate
// security tests prove that untrusted literal IPs and DNS results are blocked.
it('streams and decompresses a response with native Response metadata and clones', async () => {
  server.on('request', (_request, response) => {
    response.writeHead(200, {
      'Content-Encoding': 'gzip',
      'X-Test': 'present',
    });
    response.end(gzipSync('compressed content'));
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(`${origin}/file`);
  expect(response).toBeInstanceOf(Response);
  expect(response.url).toBe(`${origin}/file`);
  expect(response.headers.get('x-test')).toBe('present');
  const clone = response.clone();
  expect(clone.url).toBe(response.url);
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toBe('compressed content');
  expect((await reader.read()).done).toBe(true);
  expect(await clone.text()).toBe('compressed content');
});

it('accepts native Request objects with bodies and headers', async () => {
  server.on('request', async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.end(
      `${request.method}:${request.headers['x-test']}:${Buffer.concat(chunks).toString()}`,
    );
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(
    new Request(origin, {
      method: 'POST',
      headers: { 'X-Test': 'value' },
      body: 'payload',
    }),
  );
  expect(await response.text()).toBe('POST:value:payload');
});

it('leaves redirects to the validated redirect loop', async () => {
  let requests = 0;
  server.on('request', (_request, response) => {
    requests++;
    response.writeHead(302, { Location: '/next' });
    response.end();
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin, { redirect: 'manual' });
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('/next');
  await response.body?.cancel();
  expect(requests).toBe(1);
});

it('cancels the underlying response when its Web Stream is cancelled', async () => {
  let closed!: Promise<unknown>;
  server.on('request', (_request, response) => {
    closed = once(response, 'close');
    response.write('first chunk');
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin);
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await closed;
});

it('aborts a response body after headers arrive', async () => {
  server.on('request', (_request, response) => response.write('first chunk'));
  const controller = new AbortController();
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin, { signal: controller.signal });
  const reader = response.body!.getReader();
  await reader.read();
  controller.abort();
  await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
});

it('returns a null body for no-content responses', async () => {
  server.on('request', (_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin);
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
});

it('keeps HEAD responses bodyless', async () => {
  server.on('request', (_request, response) => response.end());
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin, { method: 'HEAD' });
  expect(response.body).toBeNull();
});

it('preserves separate Set-Cookie headers', async () => {
  server.on('request', (_request, response) => {
    response.setHeader('Set-Cookie', ['a=1', 'b=2']);
    response.end();
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin);
  expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
  await response.text();
});

it('rejects when the response stream is truncated', async () => {
  server.on('request', (_request, response) => {
    response.writeHead(200, { 'Content-Length': '100' });
    response.write('short');
    setImmediate(() => response.destroy());
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin);
  await expect(response.text()).rejects.toThrow();
});

it.each([
  ['deflate', deflateSync],
  ['br', brotliCompressSync],
] as const)('decodes %s responses', async (encoding, compress) => {
  server.on('request', (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': encoding });
    response.end(compress('decoded content'));
  });
  const fetch = await getDefaultDownloadFetch();
  expect(await (await fetch(origin)).text()).toBe('decoded content');
});

it.each(['gzip', 'deflate', 'br'])(
  'rejects malformed %s responses',
  async encoding => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Encoding': encoding });
      response.end('not gzip');
    });
    const fetch = await getDefaultDownloadFetch();
    await expect((await fetch(origin)).text()).rejects.toThrow();
  },
);

it('cancels a compressed response and closes its socket', async () => {
  let closed!: Promise<unknown>;
  server.on('request', (_request, response) => {
    closed = once(response, 'close');
    response.writeHead(200, { 'Content-Encoding': 'gzip' });
    response.write(gzipSync('first chunk'));
  });
  const fetch = await getDefaultDownloadFetch();
  const response = await fetch(origin);
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await closed;
});

it.each(['error', 'follow'] as const)(
  'does not follow redirects in %s mode',
  async redirect => {
    let requests = 0;
    server.on('request', (_request, response) => {
      requests++;
      response.writeHead(302, { Location: '/next' });
      response.end();
    });
    const fetch = await getDefaultDownloadFetch();
    await expect(fetch(origin, { redirect })).rejects.toThrow(
      'validated redirect loop',
    );
    expect(requests).toBe(1);
  },
);

it('rejects an already aborted request without opening a socket', async () => {
  let connections = 0;
  server.on('connection', () => connections++);
  const controller = new AbortController();
  const reason = new Error('cancelled before download');
  controller.abort(reason);
  const fetch = await getDefaultDownloadFetch();
  await expect(fetch(origin, { signal: controller.signal })).rejects.toBe(
    reason,
  );
  expect(connections).toBe(0);
});

it('uploads native FormData without an external encoder', async () => {
  server.on('request', async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.end(
      `${request.headers['content-type']}\n${Buffer.concat(chunks).toString()}`,
    );
  });
  const form = new FormData();
  form.set('file', new Blob(['file content']), 'test.txt');
  const fetch = await getDefaultDownloadFetch();
  const text = await (
    await fetch(origin, { method: 'POST', body: form })
  ).text();
  expect(text).toContain('multipart/form-data; boundary=');
  expect(text).toContain('filename="test.txt"');
  expect(text).toContain('file content');
});

it('supports inline data URLs without a socket', async () => {
  const fetch = await getDefaultDownloadFetch();
  expect(await (await fetch('data:text/plain;base64,aGVsbG8=')).text()).toBe(
    'hello',
  );
});

it.each(['gzip', 'deflate', 'br'])(
  'accepts empty %s responses',
  async encoding => {
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Encoding': encoding });
      response.end();
    });
    const fetch = await getDefaultDownloadFetch();
    expect(await (await fetch(origin)).text()).toBe('');
  },
);

it.each([
  ['deflate', deflateRawSync('decoded content')],
  ['gzip, br', brotliCompressSync(gzipSync('decoded content'))],
  ['deflate, gzip', gzipSync(deflateRawSync('decoded content'))],
] as const)('decodes legacy or stacked %s', async (encoding, data) => {
  server.on('request', (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': encoding });
    response.write(data.subarray(0, 1));
    setImmediate(() => response.end(data.subarray(1)));
  });
  const fetch = await getDefaultDownloadFetch();
  expect(await (await fetch(origin)).text()).toBe('decoded content');
});

it('preserves an unknown encoding stack without partially decoding it', async () => {
  const data = gzipSync('opaque content');
  server.on('request', (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': 'unknown, gzip' });
    response.end(data);
  });
  const fetch = await getDefaultDownloadFetch();
  expect(Buffer.from(await (await fetch(origin)).arrayBuffer())).toEqual(data);
});

it.each([
  'hello 🌍',
  new URLSearchParams({ code: 'hello 🌍' }),
  new Blob(['hello 🌍']),
  new Uint8Array([0, 1, 255]),
  new ArrayBuffer(3),
])('sends the byte length of known bodies', async body => {
  server.on('request', async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.end(
      JSON.stringify({
        length: request.headers['content-length'],
        actual: Buffer.concat(chunks).length,
        chunked: request.headers['transfer-encoding'],
      }),
    );
  });
  const fetch = await getDefaultDownloadFetch();
  const result = await (await fetch(origin, { method: 'POST', body })).json();
  expect(result.length).toBe(String(result.actual));
  expect(result.chunked).toBeUndefined();
});

it('times out while waiting for response headers and closes the socket', async () => {
  let closed!: Promise<unknown>;
  server.on('request', request => {
    closed = once(request.socket, 'close');
  });
  const fetch = await createSafeNodeFetch({ idleTimeout: 40 });
  await expect(fetch(origin)).rejects.toThrow('socket timed out');
  await closed;
});

it('times out a stalled response body', async () => {
  server.on('request', (_request, response) => response.write('first'));
  const fetch = await createSafeNodeFetch({ idleTimeout: 40 });
  const response = await fetch(origin);
  await expect(response.text()).rejects.toThrow('socket timed out');
});

it('does not impose an overall deadline on active downloads', async () => {
  server.on('request', (_request, response) => {
    const timer = setInterval(() => response.write('.'), 10);
    const end = setTimeout(() => response.end(), 160);
    response.on('close', () => {
      clearInterval(timer);
      clearTimeout(end);
    });
  });
  const fetch = await createSafeNodeFetch({ idleTimeout: 80 });
  expect((await (await fetch(origin)).text()).length).toBeGreaterThan(3);
});

it('rejects protocol upgrades instead of leaving a pending request', async () => {
  server.on('request', (_request, response) => {
    response.writeHead(101, { Connection: 'Upgrade', Upgrade: 'websocket' });
    response.end();
  });
  const fetch = await getDefaultDownloadFetch();
  await expect(fetch(origin)).rejects.toThrow('upgrades are unsupported');
});

it.each([
  { integrity: 'sha256-test' },
  { cache: 'force-cache' as const },
  { referrer: 'https://example.com/' },
  { keepalive: true },
])('rejects unsupported semantics before connecting: %j', async init => {
  let connections = 0;
  server.on('connection', () => connections++);
  const fetch = await getDefaultDownloadFetch();
  await expect(fetch(origin, init)).rejects.toThrow();
  expect(connections).toBe(0);
});

it('propagates a custom abort reason while waiting for headers', async () => {
  const controller = new AbortController();
  const reason = new Error('user cancelled');
  server.on('request', () => controller.abort(reason));
  const fetch = await getDefaultDownloadFetch();
  await expect(fetch(origin, { signal: controller.signal })).rejects.toBe(
    reason,
  );
});

it.each([205, 304])('returns no body for status %s', async status => {
  server.on('request', (_request, response) => {
    response.writeHead(status, { 'Content-Encoding': 'gzip' });
    response.end();
  });
  const fetch = await getDefaultDownloadFetch();
  expect((await fetch(origin)).body).toBeNull();
});

it.each<Record<string, string>>([
  { 'Content-Length': '1' },
  { 'Content-Length': '-1' },
  { 'Content-Length': 'no' },
  { 'Transfer-Encoding': 'chunked' },
])(
  'rejects conflicting request framing before connecting: %j',
  async headers => {
    let connections = 0;
    server.on('connection', () => connections++);
    const fetch = await getDefaultDownloadFetch();
    await expect(
      fetch(origin, { method: 'POST', body: 'hello', headers }),
    ).rejects.toThrow();
    expect(connections).toBe(0);
  },
);

it('reuses a connection after a complete response without retaining its abort signal', async () => {
  let connections = 0;
  server.on('connection', () => connections++);
  server.on('request', (_request, response) => response.end('complete'));
  const controller = new AbortController();
  const fetch = await createSafeNodeFetch({ idleTimeout: 80 });
  expect(
    await (await fetch(origin, { signal: controller.signal })).text(),
  ).toBe('complete');
  controller.abort();
  expect(await (await fetch(origin)).text()).toBe('complete');
  expect(connections).toBe(1);
});

it('propagates upload errors and closes the request', async () => {
  const reason = new Error('upload failed');
  const body = new ReadableStream({
    start(controller) {
      controller.error(reason);
    },
  });
  const fetch = await getDefaultDownloadFetch();
  await expect(
    fetch(
      new Request(origin, {
        method: 'POST',
        body,
        ...{ duplex: 'half' },
      }),
    ),
  ).rejects.toBe(reason);
});

it('cancels a streaming upload when the request is aborted', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled = true;
    },
  });
  server.on('request', () => controller.abort());
  const fetch = await getDefaultDownloadFetch();
  await expect(
    fetch(
      new Request(origin, {
        method: 'POST',
        body,
        signal: controller.signal,
        ...{ duplex: 'half' },
      }),
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelled).toBe(true);
});

it('bounds DNS lookup time without falling back to global fetch', async () => {
  const lookup = vi
    .spyOn(process.getBuiltinModule('node:dns'), 'lookup')
    .mockImplementation(() => {});
  try {
    const fetch = await createSafeNodeFetch({ connectTimeout: 40 });
    await expect(fetch('http://files.example.com')).rejects.toThrow(
      'connection timed out',
    );
  } finally {
    lookup.mockRestore();
  }
});

it('bounds the header wait even if a server keeps sending incomplete headers', async () => {
  server.on('request', request => {
    request.socket.write('HTTP/1.1 200 OK\r\n');
    const interval = setInterval(
      () => request.socket.write('X-Slow: header\r\n'),
      10,
    );
    request.socket.on('close', () => clearInterval(interval));
  });
  const fetch = await createSafeNodeFetch({
    headersTimeout: 80,
    idleTimeout: 200,
  });
  await expect(fetch(origin)).rejects.toThrow('headers timed out');
});

it.each(['gzip', 'gzip, br'])(
  'preserves custom abort reasons during %s decoding',
  async encoding => {
    const controller = new AbortController();
    const reason = new Error('stop decoding');
    server.on('request', (_request, response) => {
      response.writeHead(200, { 'Content-Encoding': encoding });
      const data = gzipSync('first chunk');
      response.write(encoding === 'gzip' ? data : brotliCompressSync(data));
    });
    const fetch = await getDefaultDownloadFetch();
    const response = await fetch(origin, { signal: controller.signal });
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort(reason);
    await expect(reader.read()).rejects.toBe(reason);
  },
);

it('bounds the TLS handshake, not just the TCP connection', async () => {
  const { createServer } = process.getBuiltinModule('node:net');
  const { server: stalled, address } = await new Promise<{
    server: ReturnType<typeof createServer>;
    address: string;
  }>(resolve => {
    const server = createServer(socket => {
      socket.on('data', () => {});
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected TCP address');
      resolve({ server, address: `https://127.0.0.1:${address.port}` });
    });
  });
  try {
    const fetch = await createSafeNodeFetch({ connectTimeout: 40 });
    await expect(fetch(address)).rejects.toThrow('connection timed out');
  } finally {
    await new Promise<void>(resolve => stalled.close(() => resolve()));
  }
});
