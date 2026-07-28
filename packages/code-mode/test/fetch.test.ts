import { describe, expect, it, vi } from 'vitest';
import { experimental_runCodeMode as runCodeMode } from '../dist/index.js';
import { deferred, withTimeout } from './helpers.js';

describe('fetch support', () => {
  it('does not expose fetch by default', async () => {
    await expect(
      runCodeMode({
        js: 'return typeof fetch;',
        tools: {},
      }),
    ).resolves.toBe('undefined');
  });

  it('allows configured fetch origins', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.json();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('allows configured URL prefixes', async () => {
    await expect(
      runCodeMode({
        js: "const response = await fetch('https://example.test/public/item'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('ok'),
            allowedUrlPrefixes: ['https://example.test/public/'],
          },
        },
      }),
    ).resolves.toBe('ok');
  });

  it('allows exact and nested path matches for configured URL prefixes', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));

    await expect(
      runCodeMode({
        js: `
          const exact = await fetch('https://example.test/public');
          const nested = await fetch('https://example.test/public/item?x=1');
          return [await exact.text(), await nested.text()];
        `,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedUrlPrefixes: ['https://example.test/public'],
          },
        },
      }),
    ).resolves.toEqual(['ok', 'ok']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['https://example.test/public?tenant=a'],
    ['https://example.test/public#tenant-a'],
  ])(
    'rejects URL prefix policies with query or fragment components: %s',
    async prefix => {
      const fetchMock = vi.fn(async () => new Response('should not run'));

      await expect(
        runCodeMode({
          js: "const response = await fetch('https://example.test/public/item'); return await response.text();",
          tools: {},
          options: {
            fetchPolicy: {
              fetch: fetchMock,
              allowedUrlPrefixes: [prefix],
            },
          },
        }),
      ).rejects.toThrow(/query strings or fragments/);

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('denies unconfigured fetch origins', async () => {
    await expect(
      runCodeMode({
        js: "return await fetch('https://blocked.example.test/data');",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('blocked'),
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it('denies invalid fetch URLs before calling host fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: "return await fetch('not a url');",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/Invalid fetch URL/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['javascript:alert(1)'],
    ['file:///etc/passwd'],
    ['data:text/plain,hello'],
    ['ftp://api.example.test/file'],
  ])('denies non-http fetch URL %s before calling host fetch', async url => {
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: `return await fetch(${JSON.stringify(url)});`,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/http and https/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['https://api.example.test.evil.example/data'],
    ['https://api.example.test@evil.example.test/data'],
    ['https://evil.example.test/?next=https://api.example.test/data'],
  ])('denies origin-confusion fetch URL %s', async url => {
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: `return await fetch(${JSON.stringify(url)});`,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/not allowed/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('denies embedded credentials even when the origin is allowed', async () => {
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: "return await fetch('https://user:pass@api.example.test/data');",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/credentials/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['https://example.test/public.evil/item'],
    ['https://example.test/private'],
    ['https://example.test/public/../private'],
    ['https://example.test/public/%2e%2e/private'],
    ['https://other.example.test/public/item'],
  ])('denies URL prefix bypass attempt %s', async url => {
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: `return await fetch(${JSON.stringify(url)});`,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedUrlPrefixes: ['https://example.test/public'],
          },
        },
      }),
    ).rejects.toThrow(/not allowed/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('denies methods outside the fetch policy', async () => {
    await expect(
      runCodeMode({
        js: "return await fetch('https://api.example.test/data', { method: 'POST', body: 'x' });",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('should not run'),
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).rejects.toThrow(/method "POST" is not allowed/);
  });

  it('passes allowed method, headers, and body to host fetch', async () => {
    const fetchMock = vi.fn(
      async () => new Response('created', { status: 201 }),
    );

    await expect(
      runCodeMode({
        js: `
          const response = await fetch('https://api.example.test/data', {
            method: 'POST',
            headers: { 'x-test': 'yes' },
            body: 'payload'
          });
          return { status: response.status, body: await response.text() };
        `,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            allowedMethods: ['GET', 'POST'],
          },
        },
      }),
    ).resolves.toEqual({ status: 201, body: 'created' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/data',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: { 'x-test': 'yes' },
        body: 'payload',
      }),
    );
  });

  it('follows allowed redirects through user-land fetch policy', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === 'https://api.example.test/data') {
        return new Response('', {
          status: 302,
          headers: { location: '/final' },
        });
      }
      return new Response('redirected', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return { url: response.url, body: await response.text() };",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            allowRedirects: true,
          },
        },
      }),
    ).resolves.toEqual({
      url: 'https://api.example.test/final',
      body: 'redirected',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/data',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/final',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('does not follow redirects unless allowRedirects is true', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('redirect body', {
        status: 302,
        headers: { location: '/final' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return { status: response.status, body: await response.text() };",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
        },
      }),
    ).resolves.toEqual({ status: 302, body: 'redirect body' });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('denies redirected fetches outside the policy before the next host fetch', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('', {
        status: 302,
        headers: { location: 'https://evil.example.test/data' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            allowRedirects: true,
          },
        },
      }),
    ).rejects.toThrow(/not allowed/);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('denies redirected fetches with embedded credentials before the next host fetch', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('', {
        status: 302,
        headers: { location: 'https://user:pass@api.example.test/data' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            allowRedirects: true,
          },
        },
      }),
    ).rejects.toThrow(/credentials/);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('applies method policy to redirected fetches', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('', {
        status: 303,
        headers: { location: '/after-post' },
      });
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data', { method: 'POST', body: 'payload' }); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            allowedMethods: ['POST'],
            allowRedirects: true,
          },
        },
      }),
    ).rejects.toThrow(/method "GET" is not allowed/);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('enforces fetch response size limits', async () => {
    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => new Response('too large'),
            allowedOrigins: ['https://api.example.test'],
            maxResponseBytes: 3,
          },
        },
      }),
    ).rejects.toThrow(/size limit/);
  });

  it('enforces streamed fetch response size limits before reading the whole body', async () => {
    let pulls = 0;
    const chunk = new TextEncoder().encode('abcd');
    const fetchMock = vi.fn(async () => {
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++;
            controller.enqueue(chunk);
            if (pulls >= 10) {
              controller.close();
            }
          },
        }),
      );
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            maxResponseBytes: 5,
          },
        },
      }),
    ).rejects.toThrow(/size limit/);

    expect(pulls).toBeLessThan(10);
  });

  it('rejects oversized content-length before reading the response body', async () => {
    let bodyRead = false;
    const fetchMock = vi.fn(async () => {
      return {
        url: 'https://api.example.test/data',
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-length': '999' }),
        body: {
          getReader() {
            bodyRead = true;
            throw new Error('body should not be read');
          },
        } as unknown as ReadableStream<Uint8Array>,
        text: async () => {
          bodyRead = true;
          return 'body should not be read';
        },
      } as Response;
    });

    await expect(
      runCodeMode({
        js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
            maxResponseBytes: 5,
          },
        },
      }),
    ).rejects.toThrow(/size limit/);

    expect(bodyRead).toBe(false);
  });

  it('passes an abort signal to host fetch and aborts pending reads on timeout', async () => {
    const fetchStarted = deferred<void>();
    let seenSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        seenSignal = init?.signal ?? undefined;
        fetchStarted.resolve();
        return new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              return new Promise<void>(() => undefined);
            },
          }),
        );
      },
    );

    const run = runCodeMode({
      js: "const response = await fetch('https://api.example.test/data'); return await response.text();",
      tools: {},
      options: {
        executionPolicy: { timeoutMs: 150 },
        fetchPolicy: {
          fetch: fetchMock,
          allowedOrigins: ['https://api.example.test'],
        },
      },
    });

    await withTimeout(fetchStarted.promise, 1_000);
    await expect(run).rejects.toThrow(/timed out|aborted|interrupted/i);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
  });
});
