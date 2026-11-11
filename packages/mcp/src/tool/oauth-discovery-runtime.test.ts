import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMCPClient } from './mcp-client';
import {
  type OAuthClientProvider,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from './oauth';

const originalProcess = globalThis.process;
const resource = 'https://mcp.example.com';
const issuer = 'https://auth.example.com';
const resourceMetadata = { resource, authorization_servers: [issuer] };
const authorizationMetadata = {
  issuer,
  authorization_endpoint: `${issuer}/authorize`,
  token_endpoint: `${issuer}/token`,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
};

describe.each([
  { name: 'Bun', versions: { bun: '1.3.5' } },
  { name: 'Deno', versions: { deno: '2.0.0' } },
  { name: 'Workers', title: 'workerd' },
  { name: 'edge', edgeRuntime: 'edge-runtime' },
])('OAuth discovery on $name', runtime => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('process', {
      ...originalProcess,
      release: { name: 'node' },
      title: runtime.title ?? originalProcess?.title,
      versions: { ...originalProcess?.versions, ...runtime.versions },
    });
    vi.stubGlobal('EdgeRuntime', runtime.edgeRuntime);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    'blocks an untrusted discovery host before native fetch (forwarded global: %s)',
    async forwardGlobal => {
      await expect(
        discoverAuthorizationServerMetadata(issuer, {
          fetchFn: forwardGlobal ? globalThis.fetch : undefined,
        }),
      ).rejects.toThrow(
        /requires a custom fetch with connect-time DNS validation/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['http', 'sse'] as const)(
    'preserves the native default distinction through the %s transport',
    async type => {
      fetchMock.mockImplementation(input => {
        const url = String(input);
        if (url.includes('/.well-known/oauth-protected-resource')) {
          return Promise.resolve(Response.json(resourceMetadata));
        }
        if (new URL(url).origin === issuer) {
          return Promise.resolve(Response.json(authorizationMetadata));
        }
        return Promise.resolve(new Response(null, { status: 401 }));
      });
      const provider: OAuthClientProvider = {
        redirectUrl: 'https://app.example.com/callback',
        clientMetadata: { redirect_uris: ['https://app.example.com/callback'] },
        clientInformation: () => ({ client_id: 'example-client' }),
        tokens: () => undefined,
        saveTokens: vi.fn(),
        saveCodeVerifier: vi.fn(),
        codeVerifier: () => 'unused',
        redirectToAuthorization: vi.fn(),
      };

      await expect(
        createMCPClient({
          transport: { type, url: resource, authProvider: provider },
        }),
      ).rejects.toThrow(
        /requires a custom fetch with connect-time DNS validation/,
      );
      expect(
        fetchMock.mock.calls.every(
          ([url]) => new URL(String(url)).origin === resource,
        ),
      ).toBe(true);
      expect(provider.redirectToAuthorization).not.toHaveBeenCalled();
    },
  );

  describe.each(['registration', 'code exchange', 'refresh'] as const)(
    '%s endpoints',
    operation => {
      const request = (trustedOrigin?: string) => {
        const metadata = {
          ...authorizationMetadata,
          registration_endpoint: `${issuer}/register`,
        };
        const clientInformation = { client_id: 'example-client' };
        if (operation === 'registration') {
          return registerClient(issuer, {
            metadata,
            clientMetadata: {
              redirect_uris: ['https://app.example.com/callback'],
            },
            trustedOrigin,
          });
        }
        if (operation === 'code exchange') {
          return exchangeAuthorization(issuer, {
            metadata,
            clientInformation,
            authorizationCode: 'unused',
            codeVerifier: 'unused',
            redirectUri: 'https://app.example.com/callback',
            trustedOrigin,
          });
        }
        return refreshAuthorization(issuer, {
          metadata,
          clientInformation,
          refreshToken: 'unused',
          trustedOrigin,
        });
      };

      it('blocks the untrusted endpoint before native fetch', async () => {
        await expect(request()).rejects.toThrow(
          /requires a custom fetch with connect-time DNS validation/,
        );
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('preserves an explicitly configured origin', async () => {
        fetchMock.mockResolvedValueOnce(
          Response.json({
            client_id: 'example-client',
            redirect_uris: ['https://app.example.com/callback'],
            access_token: 'example-token',
            token_type: 'Bearer',
          }),
        );

        await expect(request(issuer)).resolves.toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('allows the configured resource origin', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(resourceMetadata));

    await expect(
      discoverOAuthProtectedResourceMetadata(resource),
    ).resolves.toEqual(resourceMetadata);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows a configured authorization-server origin', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(authorizationMetadata));

    await expect(
      discoverAuthorizationServerMetadata(issuer, { trustedOrigin: issuer }),
    ).resolves.toEqual(authorizationMetadata);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['resource', 'authorization server'])(
    'blocks an untrusted redirect from a configured %s origin',
    async discovery => {
      fetchMock.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://discovery.example.com/metadata' },
        }),
      );

      await expect(
        discovery === 'resource'
          ? discoverOAuthProtectedResourceMetadata(resource)
          : discoverAuthorizationServerMetadata(issuer, {
              trustedOrigin: issuer,
            }),
      ).rejects.toThrow(
        /requires a custom fetch with connect-time DNS validation/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('allows same-origin discovery redirects', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: `${issuer}/metadata` },
        }),
      )
      .mockResolvedValueOnce(Response.json(authorizationMetadata));

    await expect(
      discoverAuthorizationServerMetadata(issuer, { trustedOrigin: issuer }),
    ).resolves.toEqual(authorizationMetadata);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('accepts an explicitly injected transport for untrusted discovery', async () => {
    const customFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(authorizationMetadata));

    await expect(
      discoverAuthorizationServerMetadata(issuer, { fetchFn: customFetch }),
    ).resolves.toEqual(authorizationMetadata);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not infer browser trust from worker globals', async () => {
    class WorkerScope {}
    vi.stubGlobal('WorkerGlobalScope', WorkerScope);
    vi.stubGlobal('self', new WorkerScope());

    await expect(discoverAuthorizationServerMetadata(issuer)).rejects.toThrow(
      /requires a custom fetch with connect-time DNS validation/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not treat a window alias without a document as a browser', async () => {
    vi.stubGlobal('window', globalThis);

    await expect(discoverAuthorizationServerMetadata(issuer)).rejects.toThrow(
      /requires a custom fetch with connect-time DNS validation/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
