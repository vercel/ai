import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadError } from './download-error';
import {
  fetchWithValidatedEndpoint,
  fetchWithValidatedRedirects,
} from './fetch-with-validated-redirects';

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

describe('fetchWithValidatedEndpoint', () => {
  it('validates the URL before issuing the request', async () => {
    const fetchMock = vi.fn();

    await expect(
      fetchWithValidatedEndpoint({
        url: 'http://169.254.169.254/token',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses redirect: error for credential-bearing requests', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());
    const body = new URLSearchParams({ code: 'secret-code' });

    await fetchWithValidatedEndpoint({
      url: new URL('https://auth.example.com/token'),
      init: {
        method: 'POST',
        headers: { authorization: 'Basic secret' },
        body,
      },
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://auth.example.com/token'),
      {
        method: 'POST',
        headers: { authorization: 'Basic secret' },
        body,
        redirect: 'error',
      },
    );
  });
});

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

  it('rejects a redirect to a private address without requesting it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('http://169.254.169.254/'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'https://evil.com/redirect',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts cancelling redirect response bodies to prevent socket leaks', async () => {
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
      .mockResolvedValueOnce(redirectWithBody('http://169.254.169.254/'));

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

  it.each([301, 302, 303, 307, 308])(
    'does not wait for cancellation before following a %d redirect',
    async status => {
      let markCancelEntered!: () => void;
      const cancelEntered = new Promise<void>(resolve => {
        markCancelEntered = resolve;
      });
      let finishCancellation!: () => void;
      const cancelPending = new Promise<void>(resolve => {
        finishCancellation = resolve;
      });
      const redirect = {
        ok: false,
        status,
        headers: new Headers({ location: 'https://cdn.example.com/file' }),
        body: {
          cancel() {
            markCancelEntered();
            return cancelPending;
          },
        },
      } as unknown as Response;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(redirect)
        .mockResolvedValueOnce(okResponse());

      const download = fetchWithValidatedRedirects({
        url: 'https://example.com/file',
        fetch: fetchMock,
      });

      await cancelEntered;
      await Promise.resolve();

      try {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        finishCancellation();
        await download;
      }
    },
  );

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

  it.each([301, 302, 303, 307, 308])('follows a %d redirect', async status => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        redirectResponse('https://cdn.example.com/file', status),
      )
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([300, 304])(
    'returns a %d response as final even when it carries a Location header',
    async status => {
      // Per the fetch spec, only 301/302/303/307/308 are redirect statuses.
      // A hostile Location on a non-redirect status must not be followed —
      // not even to a private address.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          redirectResponse('http://169.254.169.254/', status),
        );

      const response = await fetchWithValidatedRedirects({
        url: 'https://example.com/file',
        fetch: fetchMock,
      });

      expect(response.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('passes each hop an independent header snapshot (later hops must not mutate earlier ones)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://other.example.net/a'))
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      headers: { authorization: 'Bearer secret' },
      credentialedOrigin: 'https://example.com',
      fetch: fetchMock,
    });

    const firstHop = fetchMock.mock.calls[0][1].headers as Headers;
    const secondHop = fetchMock.mock.calls[1][1].headers as Headers;
    expect(firstHop).not.toBe(secondHop);
    // The cross-origin credential drop on the second hop must not be visible
    // in the header set the first hop was issued with.
    expect(firstHop.get('authorization')).toBe('Bearer secret');
    expect(secondHop.get('authorization')).toBeNull();
  });

  it('skips validation for hops same-origin with trustedOrigin', async () => {
    // A self-hosted deployment: the configured origin is private, and its
    // response URLs (and same-origin redirects) point back at it.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('http://localhost:5000/final'))
      .mockResolvedValueOnce(okResponse());

    const response = await fetchWithValidatedRedirects({
      url: 'http://localhost:5000/predictions/123',
      trustedOrigin: 'http://localhost:5000',
      fetch: fetchMock,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('validates hops on other origins even when trustedOrigin is set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('http://169.254.169.254/'));

    await expect(
      fetchWithValidatedRedirects({
        url: 'http://localhost:5000/predictions/123',
        trustedOrigin: 'http://localhost:5000',
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the injected fetch instead of the global one', async () => {
    globalThis.fetch = vi.fn();
    const injected = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      fetch: injected,
    });

    expect(injected).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['no credentialed origin', undefined],
    ['a different credentialed origin', 'https://provider.example.com'],
  ])(
    'withholds credential and custom headers but keeps safe download headers from a first hop with %s',
    async (_, origin) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

      await fetchWithValidatedRedirects({
        url: 'https://example.com/file',
        headers: {
          accept: 'image/*',
          authorization: 'Bearer secret',
          range: 'bytes=0-1023',
          'x-key': 'provider-api-key',
          'x-request-id': 'request-id',
          'user-agent': 'ai-sdk/test',
        },
        credentialedOrigin: origin,
        fetch: fetchMock,
      });

      const sent = fetchMock.mock.calls[0][1].headers as Headers;
      expect(sent.get('accept')).toBe('image/*');
      expect(sent.get('authorization')).toBeNull();
      expect(sent.get('range')).toBe('bytes=0-1023');
      expect(sent.get('x-key')).toBeNull();
      expect(sent.get('x-request-id')).toBeNull();
      expect(sent.get('user-agent')).toBe('ai-sdk/test');
    },
  );

  it('sends sanitized caller headers to a matching credentialed origin', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      credentialedOrigin: 'https://example.com',
      headers: {
        authorization: 'Bearer secret',
        'metadata-flavor': 'Google',
        'x-forwarded-for': '10.0.0.1',
        'x-request-id': 'request-id',
        cookie: 'session=abc',
      },
      fetch: fetchMock,
    });

    const sent = fetchMock.mock.calls[0][1].headers as Headers;
    expect(sent.get('metadata-flavor')).toBeNull();
    expect(sent.get('x-forwarded-for')).toBeNull();
    expect(sent.get('cookie')).toBeNull();
    expect(sent.get('authorization')).toBe('Bearer secret');
    expect(sent.get('x-request-id')).toBe('request-id');
  });

  it('drops all caller headers except user-agent on a cross-origin redirect but keeps them same-origin', async () => {
    // cross-origin: no caller header — including custom API-key headers the
    // fetch spec would let through — may follow to a different host.
    const crossOrigin = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://other.example.net/a'))
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      credentialedOrigin: 'https://example.com',
      headers: {
        authorization: 'Bearer secret',
        'x-key': 'provider-api-key',
        'user-agent': 'ai-sdk/test',
      },
      fetch: crossOrigin,
    });

    const secondHop = crossOrigin.mock.calls[1][1].headers as Headers;
    expect(secondHop.get('authorization')).toBeNull();
    expect(secondHop.get('x-key')).toBeNull();
    expect(secondHop.get('user-agent')).toBe('ai-sdk/test');

    // same-origin: caller headers are preserved across the hop.
    const sameOrigin = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://example.com/next'))
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      credentialedOrigin: 'https://example.com',
      headers: { authorization: 'Bearer secret', 'x-key': 'provider-api-key' },
      fetch: sameOrigin,
    });

    const sameOriginHop = sameOrigin.mock.calls[1][1].headers as Headers;
    expect(sameOriginHop.get('authorization')).toBe('Bearer secret');
    expect(sameOriginHop.get('x-key')).toBe('provider-api-key');
  });

  it('does not re-attach dropped headers when a later hop returns to the original origin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://other.example.net/a'))
      .mockResolvedValueOnce(redirectResponse('https://example.com/back'))
      .mockResolvedValueOnce(okResponse());

    await fetchWithValidatedRedirects({
      url: 'https://example.com/file',
      credentialedOrigin: 'https://example.com',
      headers: { authorization: 'Bearer secret', 'x-key': 'provider-api-key' },
      fetch: fetchMock,
    });

    const thirdHop = fetchMock.mock.calls[2][1].headers as Headers;
    expect(thirdHop.get('authorization')).toBeNull();
    expect(thirdHop.get('x-key')).toBeNull();
  });
});
