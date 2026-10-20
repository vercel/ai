import { describe, expect, it, vi } from 'vitest';
import { DownloadError } from './download-error';
import { fetchUntrustedUrl } from './fetch-untrusted-url';

const okResponse = () => new Response('file contents');
const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { location } });

describe('fetchUntrustedUrl', () => {
  it.each([
    undefined,
    'https://provider.example.com',
    'http://example.com',
    'https://example.com:8443',
  ])(
    'withholds credentials and unknown headers without a matching credentialedOrigin (%s)',
    async credentialedOrigin => {
      const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

      await fetchUntrustedUrl({
        url: 'https://example.com/file',
        credentialedOrigin,
        headers: {
          authorization: 'Bearer secret',
          'x-key': 'provider-secret',
          'x-jfrog-art-api': 'vendor-secret',
          'x-access-token': 'access-token',
          'x-client-secret': 'client-secret',
          'x-goog-api-key': 'google-api-key',
          'custom-vendor-header': 'another-secret',
          accept: 'image/*',
          range: 'bytes=0-1023',
          'idempotency-key': 'operation-id',
          'x-request-id': 'request-id',
          'user-agent': 'ai-sdk/test',
        },
        fetch: fetchMock,
      });

      expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({
        accept: 'image/*',
        range: 'bytes=0-1023',
        'idempotency-key': 'operation-id',
        'x-request-id': 'request-id',
        'user-agent': 'ai-sdk/test',
      });
    },
  );

  it.each([
    { credentialedOrigin: 'https://example.com/api' },
    { trustedOrigin: 'https://example.com' },
  ])('preserves sanitized headers for a matching origin: %j', async origin => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());
    const headers = new Headers({
      authorization: 'Bearer secret',
      'x-jfrog-art-api': 'vendor-secret',
      'x-custom-metadata': 'custom-value',
      cookie: 'session=abc',
      'metadata-flavor': 'Google',
      'x-forwarded-for': '10.0.0.1',
    });

    await fetchUntrustedUrl({
      url: 'https://example.com/file',
      ...origin,
      headers,
      fetch: fetchMock,
    });

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({
      authorization: 'Bearer secret',
      'x-jfrog-art-api': 'vendor-secret',
      'x-custom-metadata': 'custom-value',
    });
    expect(headers.get('cookie')).toBe('session=abc');
    expect(headers.get('metadata-flavor')).toBe('Google');
  });

  it('withholds credentials when only a non-matching trustedOrigin is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchUntrustedUrl({
      url: 'https://cdn.example.com/file',
      trustedOrigin: 'https://api.example.com',
      headers: { authorization: 'Bearer secret', 'x-key': 'provider-secret' },
      fetch: fetchMock,
    });

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({});
  });

  it('uses credentialedOrigin to narrow a matching trustedOrigin', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchUntrustedUrl({
      url: 'http://localhost:5000/predictions/123',
      trustedOrigin: 'http://localhost:5000',
      credentialedOrigin: 'https://api.example.com',
      headers: { authorization: 'Bearer secret', accept: 'application/json' },
      fetch: fetchMock,
    });

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({
      accept: 'application/json',
    });
  });

  it('preserves caller-approved metadata but cannot reintroduce sanitized headers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse());

    await fetchUntrustedUrl({
      url: 'https://example.com/file',
      headers: [
        ['Authorization', 'Bearer secret'],
        ['Proxy-Authorization', 'Basic secret'],
        ['X-Protocol-Version', '2026-09-24'],
      ],
      untrustedFirstHopHeaders: ['X-Protocol-Version', 'Proxy-Authorization'],
      fetch: fetchMock,
    });

    expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({
      'x-protocol-version': '2026-09-24',
    });
  });

  it('preserves headers on same-origin redirects, drops them across origins, and never reattaches them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://example.com/next'))
      .mockResolvedValueOnce(redirectTo('https://cdn.example.net/file'))
      .mockResolvedValueOnce(redirectTo('https://example.com/back'))
      .mockResolvedValueOnce(okResponse());
    const headers = {
      authorization: 'Bearer secret',
      'x-key': 'provider-secret',
      'x-protocol-version': '2026-09-24',
      'user-agent': 'ai-sdk/test',
    };

    await fetchUntrustedUrl({
      url: 'https://example.com/file',
      credentialedOrigin: 'https://example.com',
      headers,
      untrustedFirstHopHeaders: ['x-protocol-version'],
      fetch: fetchMock,
    });

    const sent = fetchMock.mock.calls.map(([, init]) =>
      Object.fromEntries(init.headers),
    );
    expect(sent).toEqual([
      headers,
      headers,
      { 'user-agent': 'ai-sdk/test' },
      { 'user-agent': 'ai-sdk/test' },
    ]);
  });

  it('never attaches withheld credentials when an untrusted first hop redirects to the credentialed origin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://api.example.com/file'))
      .mockResolvedValueOnce(okResponse());

    await fetchUntrustedUrl({
      url: 'https://untrusted.example/file',
      credentialedOrigin: 'https://api.example.com',
      headers: { authorization: 'Bearer secret', 'x-key': 'provider-secret' },
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(Object.fromEntries(init.headers)).toEqual({});
    }
  });

  it('rejects private URLs even when credentialedOrigin matches', async () => {
    const fetchMock = vi.fn();

    await expect(
      fetchUntrustedUrl({
        url: 'http://127.0.0.1/file',
        credentialedOrigin: 'http://127.0.0.1',
        headers: { authorization: 'Bearer secret' },
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a configured private origin but rejects a redirect to another private origin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('http://10.0.0.1/file'));

    await expect(
      fetchUntrustedUrl({
        url: 'http://localhost:5000/file',
        trustedOrigin: 'http://localhost:5000',
        headers: { authorization: 'Bearer secret' },
        fetch: fetchMock,
      }),
    ).rejects.toThrow(DownloadError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.get('authorization')).toBe(
      'Bearer secret',
    );
  });

  it('passes abort signals and redirect limits through without adding headers to a bare request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://example.com/next'));
    const { signal } = new AbortController();

    await expect(
      fetchUntrustedUrl({
        url: 'https://example.com/file',
        abortSignal: signal,
        maxRedirects: 0,
        fetch: fetchMock,
      }),
    ).rejects.toThrow('Too many redirects (max 0)');

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/file',
      {
        signal,
        redirect: 'manual',
      },
    );
  });
});
