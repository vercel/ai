import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadError } from './download-error';
import { fetchWithValidatedRedirects } from './fetch-with-validated-redirects';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: unknown }).window;
});

function redirectResponse(location: string, status = 302): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ location }),
    body: null,
  } as unknown as Response;
}

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'image/png' }),
    body: null,
  } as unknown as Response;
}

describe('fetchWithValidatedRedirects', () => {
  it('validates the initial URL before requesting it', async () => {
    const fetchMock = vi.fn();

    await expect(
      fetchWithValidatedRedirects({
        url: 'http://localhost/file',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses redirect: manual and omits headers when none are provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/file', {
      signal: undefined,
      redirect: 'manual',
    });
  });

  it('follows a redirect to a safe URL, validating the hop', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.com/file'))
      .mockResolvedValueOnce(okResponse());

    const response = await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      fetch: fetchMock,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/file',
      {
        signal: undefined,
        redirect: 'manual',
      },
    );
  });

  it.each([301, 302, 303, 307, 308])(
    'rejects HTTPS to HTTP downgrades for a %d redirect before requesting the target',
    async status => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(okResponse())
        .mockResolvedValueOnce({
          ...redirectResponse('http://example.com/file', status),
          body: { cancel },
        });

      await expect(
        fetchWithValidatedRedirects({
          url: 'https://example.com/file',
          headers: { authorization: 'Bearer secret' },
          fetch: fetchMock,
        }),
      ).rejects.toThrow(DownloadError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it.each([undefined, 'http://cdn.example.com'])(
    'rejects cross-host HTTPS downgrades even with trustedOrigin %s and no caller headers',
    async trustedOrigin => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(okResponse())
        .mockResolvedValueOnce(redirectResponse('http://cdn.example.com/file'));

      await expect(
        fetchWithValidatedRedirects({
          url: 'https://example.com/file',
          trustedOrigin,
          fetch: fetchMock,
        }),
      ).rejects.toThrow(DownloadError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a downgrade after an HTTP request upgrades to HTTPS', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse())
      .mockResolvedValueOnce(redirectResponse('https://example.com/secure'))
      .mockResolvedValueOnce(redirectResponse('http://example.com/file'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'http://example.com/file',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['http://example.com/next', 'https://example.com/next'])(
    'allows an initial HTTP URL to redirect to %s',
    async location => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(redirectResponse(location))
        .mockResolvedValueOnce(okResponse());

      const response = await fetchWithValidatedRedirects({
        url: 'http://example.com/file',
        fetch: fetchMock,
      });

      expect(response.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('rejects a redirect to a private address without requesting it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://169.254.169.254/'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'https://evil.com/redirect',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the redirect response body before moving to the next hop (prevents socket leak)', async () => {
    const onCancel = vi.fn();
    const redirectWithBody = (location: string): Response =>
      ({
        ok: false,
        status: 302,
        headers: new Headers({ location }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('redirecting'));
            controller.close();
          },
          cancel() {
            onCancel();
          },
        }),
      }) as unknown as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectWithBody('https://cdn.example.com/file'))
      .mockResolvedValueOnce(redirectWithBody('https://169.254.169.254/'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'https://example.com/file',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);

    // Both the followed hop and the hop rejected by the SSRF guard must have
    // their bodies cancelled so the redirect chain does not leak sockets.
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('resolves relative redirect targets against the current URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('/internal'))
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/start',
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/internal',
      { signal: undefined, redirect: 'manual' },
    );
  });

  it('preserves headers on the same origin and drops them permanently after crossing origins', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://api.example.com/next'))
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.com/image'))
      .mockResolvedValueOnce(redirectResponse('https://api.example.com/image'))
      .mockResolvedValueOnce(okResponse());
    const headers = {
      'x-key': 'secret',
      authorization: 'Bearer secret',
      'custom-provider-key': 'secret',
      'user-agent': 'test-agent',
    };

    await fetchWithValidatedRedirects({
      url: 'https://api.example.com/start',
      headers,
      fetch,
    });

    for (const [, init] of fetch.mock.calls.slice(0, 2)) {
      expect(Object.fromEntries(new Headers(init.headers))).toEqual(headers);
    }
    for (const [, init] of fetch.mock.calls.slice(2)) {
      expect(Object.fromEntries(new Headers(init.headers))).toEqual({
        'user-agent': 'test-agent',
      });
    }
    expect(headers['x-key']).toBe('secret');
  });

  it.each(['https://example.com/final', 'https://127.0.0.1/blocked'])(
    'does not wait for redirect body cancellation before validating %s',
    async location => {
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new ReadableStream({ cancel }), {
            status: 302,
            headers: { location },
          }),
        )
        .mockResolvedValueOnce(okResponse());

      const result = fetchWithValidatedRedirects({
        url: 'https://example.com/start',
        fetch,
      });
      if (location.startsWith('https://127.0.0.1/')) {
        await expect(result).rejects.toThrow(DownloadError);
        expect(fetch).toHaveBeenCalledTimes(1);
      } else {
        await expect(result).resolves.toHaveProperty('ok', true);
        expect(fetch).toHaveBeenCalledTimes(2);
      }
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects once the redirect limit is exceeded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(redirectResponse('https://example.com/next'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'https://example.com/start',
        maxRedirects: 2,
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
  });

  it('fails closed on an opaque redirect outside the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      type: 'opaqueredirect',
      status: 0,
      ok: false,
      headers: new Headers(),
      body: null,
    } as unknown as Response);

    await expect(
      fetchWithValidatedRedirects({
        url: 'https://example.com/redirect',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows redirects natively on an opaque redirect in the browser', async () => {
    (globalThis as { window?: unknown }).window = {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'opaqueredirect',
        status: 0,
        ok: false,
        headers: new Headers(),
        body: null,
      } as unknown as Response)
      .mockResolvedValueOnce(okResponse());

    const response = await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      fetch: fetchMock,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/file', {
      signal: undefined,
      redirect: 'follow',
    });
  });

  it.each(['http://localhost:5000', 'https://service.internal'])(
    'skips validation for hops same-origin with trustedOrigin %s',
    async trustedOrigin => {
      // A self-hosted deployment: the configured origin is private, and its
      // response URLs (and same-origin redirects) point back at it.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(redirectResponse(`${trustedOrigin}/final`))
        .mockResolvedValueOnce(okResponse());

      const response = await fetchWithValidatedRedirects({
        url: `${trustedOrigin}/predictions/123`,
        trustedOrigin,
        fetch: fetchMock,
      });

      expect(response.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['http://169.254.169.254/', 'https://other.internal/file'])(
    'validates hops on other origins even when trustedOrigin is set: %s',
    async redirectUrl => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(redirectResponse(redirectUrl));

      await expect(
        fetchWithValidatedRedirects({
          url: 'http://localhost:5000/predictions/123',
          trustedOrigin: 'http://localhost:5000',
          fetch: fetchMock,
        }),
      ).rejects.toThrow(DownloadError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
