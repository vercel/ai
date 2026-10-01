import { describe, expect, it, vi } from 'vitest';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { auth, type OAuthClientProvider } from './oauth';
import type { OAuthTokens } from './oauth-types';

const serverUrl = 'https://api.example.com/mcp';
const authorizationServerInformation = {
  authorizationServerUrl: 'https://auth.example.com',
  tokenEndpoint: 'https://auth.example.com/token',
};
const oldTokens: OAuthTokens = {
  access_token: 'old-access',
  refresh_token: 'old-refresh',
  token_type: 'Bearer',
};
const newTokens: OAuthTokens = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  token_type: 'Bearer',
};

function createProvider(store: { tokens?: OAuthTokens }) {
  const provider = {
    redirectUrl: 'http://localhost:3000/callback',
    clientMetadata: { redirect_uris: ['http://localhost:3000/callback'] },
    clientInformation: () => ({ client_id: 'shared-client' }),
    authorizationServerInformation: () => authorizationServerInformation,
    saveAuthorizationServerInformation: vi.fn(),
    tokens: () => store.tokens,
    saveTokens: vi.fn((tokens: OAuthTokens) => {
      store.tokens = tokens;
    }),
    invalidateCredentials: vi.fn(
      (
        scope: Parameters<
          NonNullable<OAuthClientProvider['invalidateCredentials']>
        >[0],
        context?: { tokens: OAuthTokens },
      ) => {
        if (scope === 'tokens' || scope === 'all') {
          // No await between comparison and deletion: atomic for this memory store.
          if (
            !context ||
            (store.tokens?.access_token === context.tokens.access_token &&
              store.tokens?.refresh_token === context.tokens.refresh_token)
          ) {
            store.tokens = undefined;
          }
        }
      },
    ),
    redirectToAuthorization: vi.fn(),
    saveCodeVerifier: vi.fn(),
    codeVerifier: () => 'verifier',
  } satisfies OAuthClientProvider;
  return provider;
}

function createFetch(
  handleToken: (params: URLSearchParams) => Response | Promise<Response>,
): FetchFunction {
  return async (input, init) => {
    const url = String(input);
    if (url.includes('/.well-known/oauth-protected-resource')) {
      return Response.json({
        resource: serverUrl,
        authorization_servers: ['https://auth.example.com'],
      });
    }
    if (url.includes('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: authorizationServerInformation.tokenEndpoint,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (url === authorizationServerInformation.tokenEndpoint) {
      return handleToken(init?.body as URLSearchParams);
    }
    return new Response(null, { status: 404 });
  };
}

function invalidGrant() {
  return Response.json({ error: 'invalid_grant' }, { status: 400 });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('OAuth credential invalidation', () => {
  it('preserves a concurrent refresh winner in shared storage and retries its tokens', async () => {
    const store = { tokens: { ...oldTokens } as OAuthTokens | undefined };
    const first = createProvider(store);
    const second = createProvider(store);
    const bothRefreshing = deferred();
    const winnerSaved = deferred();
    let oldRefreshes = 0;
    const refreshTokens: string[] = [];

    for (const provider of [first, second]) {
      provider.saveTokens.mockImplementation(tokens => {
        store.tokens = tokens;
        winnerSaved.resolve();
      });
    }

    const fetchFn = createFetch(async params => {
      const refreshToken = params.get('refresh_token')!;
      refreshTokens.push(refreshToken);
      if (refreshToken === oldTokens.refresh_token) {
        const attempt = ++oldRefreshes;
        if (attempt === 2) bothRefreshing.resolve();
        await bothRefreshing.promise;
        if (attempt === 2) {
          await winnerSaved.promise;
          return invalidGrant();
        }
      }
      return Response.json(newTokens);
    });

    const results = await Promise.all([
      auth(first, { serverUrl, fetchFn }),
      auth(second, { serverUrl, fetchFn }),
    ]);

    expect(results).toEqual(['AUTHORIZED', 'AUTHORIZED']);
    expect(store.tokens).toMatchObject(newTokens);
    expect(refreshTokens).toEqual([
      'old-refresh',
      'old-refresh',
      'new-refresh',
    ]);
    expect([
      ...first.invalidateCredentials.mock.calls,
      ...second.invalidateCredentials.mock.calls,
    ]).toEqual([['tokens', { tokens: oldTokens }]]);
    expect(first.redirectToAuthorization).not.toHaveBeenCalled();
    expect(second.redirectToAuthorization).not.toHaveBeenCalled();
  });

  it('deletes a rejected generation that is still stored and starts authorization', async () => {
    const store = { tokens: { ...oldTokens } as OAuthTokens | undefined };
    const provider = createProvider(store);
    const handleToken = vi.fn(invalidGrant);

    await expect(
      auth(provider, { serverUrl, fetchFn: createFetch(handleToken) }),
    ).resolves.toBe('REDIRECT');

    expect(store.tokens).toBeUndefined();
    expect(handleToken).toHaveBeenCalledTimes(1);
    expect(provider.invalidateCredentials).toHaveBeenCalledExactlyOnceWith(
      'tokens',
      { tokens: oldTokens },
    );
    expect(provider.redirectToAuthorization).toHaveBeenCalledOnce();
  });

  it('snapshots the attempted tokens even when the provider mutates its token object', async () => {
    const tokens = { ...oldTokens };
    const store = { tokens: tokens as OAuthTokens | undefined };
    const provider = createProvider(store);
    let attempts = 0;
    const fetchFn = createFetch(() => {
      if (++attempts === 1) {
        Object.assign(tokens, newTokens);
        return invalidGrant();
      }
      return Response.json(newTokens);
    });

    await expect(auth(provider, { serverUrl, fetchFn })).resolves.toBe(
      'AUTHORIZED',
    );
    expect(provider.invalidateCredentials).toHaveBeenCalledExactlyOnceWith(
      'tokens',
      { tokens: oldTokens },
    );
    expect(store.tokens).toMatchObject(newTokens);
  });

  it('supports legacy providers that ignore the invalidation context', async () => {
    const store = { tokens: { ...oldTokens } as OAuthTokens | undefined };
    const provider = createProvider(store);
    provider.invalidateCredentials.mockImplementation(scope => {
      if (scope === 'tokens') store.tokens = undefined;
    });

    await expect(
      auth(provider, { serverUrl, fetchFn: createFetch(invalidGrant) }),
    ).resolves.toBe('REDIRECT');
    expect(store.tokens).toBeUndefined();
  });

  it('keeps authorization-code invalidation separate from refresh token context', async () => {
    const store = { tokens: { ...oldTokens } as OAuthTokens | undefined };
    const provider = createProvider(store);
    await expect(
      auth(provider, {
        serverUrl,
        authorizationCode: 'rejected-code',
        fetchFn: createFetch(invalidGrant),
      }),
    ).rejects.toThrow();
    expect(provider.invalidateCredentials).toHaveBeenCalledExactlyOnceWith(
      'tokens',
    );
  });

  it('includes the stored generation when invalidating tokens without an authorization server pin', async () => {
    const store = { tokens: { ...oldTokens } as OAuthTokens | undefined };
    const provider: OAuthClientProvider = {
      ...createProvider(store),
      authorizationServerInformation: undefined,
    };
    const handleToken = vi.fn(() => Response.json(newTokens));

    await expect(
      auth(provider, { serverUrl, fetchFn: createFetch(handleToken) }),
    ).resolves.toBe('REDIRECT');
    expect(provider.invalidateCredentials).toHaveBeenCalledExactlyOnceWith(
      'tokens',
      { tokens: oldTokens },
    );
    expect(handleToken).not.toHaveBeenCalled();
    expect(store.tokens).toBeUndefined();
  });
});
