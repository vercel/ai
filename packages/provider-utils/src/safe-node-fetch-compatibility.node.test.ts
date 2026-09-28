import { createServer, type Server } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { getDefaultDownloadFetch } from './safe-node-fetch';

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

it('rejects malformed compressed responses', async () => {
  server.on('request', (_request, response) => {
    response.writeHead(200, { 'Content-Encoding': 'gzip' });
    response.end('not gzip');
  });
  const fetch = await getDefaultDownloadFetch();
  await expect((await fetch(origin)).text()).rejects.toThrow();
});

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
