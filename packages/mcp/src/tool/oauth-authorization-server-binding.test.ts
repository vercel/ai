import { describe, expect, it, vi } from 'vitest';
import { type FetchFunction } from '@ai-sdk/provider-utils';
import {
  auth,
  buildDiscoveryUrls,
  discoverAuthorizationServerMetadata,
  type OAuthClientProvider,
  type OAuthAuthorizationServerInformation,
} from './oauth';
import {
  OAuthClientInformationSchema,
  OAuthTokensSchema,
  type OAuthClientInformation,
  type OAuthTokens,
} from './oauth-types';

const serverUrl = 'https://mcp.example.com/mcp';
const issuer = 'https://login.example.com';
const binding = {
  issuer,
  authorization_server: `${issuer}/`,
  token_endpoint: `${issuer}/token`,
};

class MemoryProvider implements OAuthClientProvider {
  redirectUrl = 'http://localhost:3000/callback';
  clientMetadata = { redirect_uris: [this.redirectUrl] };
  client: OAuthClientInformation | undefined;
  storedTokens: OAuthTokens | undefined;
  verifier: string | undefined;
  savedState: string | undefined;
  authorizationUrl: URL | undefined;
  invalidations: string[] = [];

  clientInformation = () => this.client;
  tokens = () => this.storedTokens;
  saveClientInformation = (client: OAuthClientInformation) => {
    this.client = OAuthClientInformationSchema.parse(client);
  };
  saveTokens = (tokens: OAuthTokens) => {
    this.storedTokens = OAuthTokensSchema.parse(tokens);
  };
  state = () => 'request-state';
  saveState = (state: string) => {
    this.savedState = state;
  };
  storedState = () => this.savedState;
  saveCodeVerifier = (verifier: string) => {
    this.verifier = verifier;
  };
  codeVerifier = () => this.verifier ?? 'test-verifier';
  redirectToAuthorization = (url: URL) => {
    this.authorizationUrl = url;
  };
  invalidateCredentials = (scope: 'all' | 'client' | 'tokens' | 'verifier') => {
    this.invalidations.push(scope);
    if (scope === 'all' || scope === 'tokens') this.storedTokens = undefined;
    if (scope === 'all' || scope === 'client') this.client = undefined;
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined;
  };
}

function transport(
  options: {
    authorizationServer?: string;
    metadataIssuer?: string;
    tokenEndpoint?: string;
    noResourceMetadata?: boolean;
    tokenError?: string;
  } = {},
) {
  const selectedIssuer = options.authorizationServer ?? issuer;
  return vi.fn<FetchFunction>(async (url, init) => {
    const href = String(url);
    if (href.includes('/.well-known/oauth-protected-resource')) {
      return options.noResourceMetadata
        ? new Response(null, { status: 404 })
        : Response.json({
            resource: serverUrl,
            authorization_servers: [selectedIssuer],
          });
    }
    if (href.includes('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: options.metadataIssuer ?? selectedIssuer,
        authorization_endpoint: `${selectedIssuer}/authorize`,
        token_endpoint: options.tokenEndpoint ?? `${selectedIssuer}/token`,
        registration_endpoint: `${selectedIssuer}/register`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (href === `${selectedIssuer}/register`) {
      return Response.json({
        client_id: 'registered-client',
        client_secret: 'test-secret',
        redirect_uris: ['http://localhost:3000/callback'],
      });
    }
    if (href === `${selectedIssuer}/token` && init?.method === 'POST') {
      return options.tokenError
        ? Response.json({ error: options.tokenError }, { status: 400 })
        : Response.json({
            access_token: 'test-access',
            token_type: 'Bearer',
            refresh_token: 'test-refresh',
          });
    }
    throw new Error(`Unexpected test request: ${href}`);
  });
}

const tokenCalls = (fetchFn: ReturnType<typeof transport>) =>
  fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/token'));

describe('OAuth authorization server binding', () => {
  it('persists registration, callback, and refresh bindings through validated credential stores', async () => {
    const provider = new MemoryProvider();
    const fetchFn = transport();
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('REDIRECT');
    expect(provider.client).toMatchObject(binding);
    expect(provider.authorizationUrl?.searchParams.get('state')).toBe(
      'request-state',
    );
    expect(provider.verifier).toBeTruthy();
    expect(
      await auth(provider, {
        serverUrl,
        fetchFn,
        authorizationCode: 'test-code',
        callbackState: 'request-state',
        callbackIssuer: issuer,
      }),
    ).toBe('AUTHORIZED');
    expect(provider.storedTokens).toMatchObject(binding);
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('AUTHORIZED');
    expect(provider.storedTokens).toMatchObject(binding);
    expect(tokenCalls(fetchFn)).toHaveLength(2);
  });

  it('rejects an unbound confidential client before sending credentials', async () => {
    const provider = new MemoryProvider();
    provider.client = {
      client_id: 'configured-client',
      client_secret: 'test-secret',
    };
    const fetchFn = transport();
    await expect(auth(provider, { serverUrl, fetchFn })).rejects.toThrow(
      'must be bound to an authorization server',
    );
    expect(tokenCalls(fetchFn)).toHaveLength(0);
    expect(provider.authorizationUrl).toBeUndefined();
  });

  it('allows an explicitly configured client issuer and persists the full pin', async () => {
    const provider = new MemoryProvider();
    provider.client = {
      client_id: 'configured-client',
      client_secret: 'test-secret',
      issuer,
    };
    expect(await auth(provider, { serverUrl, fetchFn: transport() })).toBe(
      'REDIRECT',
    );
    expect(provider.client).toMatchObject(binding);
  });

  it('completes a fixed client configuration using separate session binding storage', async () => {
    const memory = new MemoryProvider();
    const fixedClient = {
      client_id: 'configured-client',
      client_secret: 'test-secret',
      issuer,
    };
    let storedBinding: OAuthAuthorizationServerInformation | undefined;
    const provider = {
      ...memory,
      clientInformation: () => fixedClient,
      saveClientInformation: undefined,
      authorizationServerInformation: () => storedBinding,
      saveAuthorizationServerInformation: (
        value: OAuthAuthorizationServerInformation,
      ) => {
        storedBinding = value;
      },
    };
    const fetchFn = transport();
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('REDIRECT');
    expect(provider.clientInformation()).toBe(fixedClient);
    expect(storedBinding?.tokenEndpoint).toBe(`${issuer}/token`);
    expect(
      await auth(provider, {
        serverUrl,
        fetchFn,
        authorizationCode: 'test-code',
        callbackState: 'request-state',
      }),
    ).toBe('AUTHORIZED');
    expect(memory.storedTokens).toMatchObject(binding);
  });

  it('supports fully pinned read-only public client configuration without a save method', async () => {
    const memory = new MemoryProvider();
    const provider = {
      ...memory,
      clientInformation: () => ({ client_id: 'public-client', ...binding }),
      saveClientInformation: undefined,
    };
    const fetchFn = transport();
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('REDIRECT');
    expect(
      await auth(provider, {
        serverUrl,
        fetchFn,
        authorizationCode: 'test-code',
        callbackState: 'request-state',
      }),
    ).toBe('AUTHORIZED');
    expect(memory.storedTokens).toMatchObject(binding);
  });

  it('requires complete binding storage for an issuer-only read-only client', async () => {
    const memory = new MemoryProvider();
    await expect(
      auth(
        {
          ...memory,
          clientInformation: () => ({ client_id: 'public-client', issuer }),
          saveClientInformation: undefined,
        },
        { serverUrl, fetchFn: transport() },
      ),
    ).rejects.toThrow('metadata must be saveable');
    expect(memory.authorizationUrl).toBeUndefined();
  });

  it('re-registers explicitly identified unbound legacy dynamic clients', async () => {
    const memory = new MemoryProvider();
    memory.client = {
      client_id: 'legacy-client',
      client_secret: 'legacy-secret',
    };
    memory.storedTokens = {
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      token_type: 'Bearer',
    };
    const fetchFn = transport();
    expect(
      await auth(
        { ...memory, isClientInformationDynamicallyRegistered: () => true },
        { serverUrl, fetchFn },
      ),
    ).toBe('REDIRECT');
    expect(memory.invalidations).toEqual(['all']);
    expect(memory.client).toMatchObject({
      client_id: 'registered-client',
      ...binding,
    });
    expect(memory.storedTokens).toBeUndefined();
    expect(tokenCalls(fetchFn)).toHaveLength(0);
  });

  it.each(['invalid_client', 'unauthorized_client'])(
    'recovers from %s only for explicitly dynamic clients',
    async tokenError => {
      for (const dynamic of [true, false, undefined]) {
        const memory = new MemoryProvider();
        memory.client = { client_id: 'existing-client', ...binding };
        memory.storedTokens = {
          access_token: 'old-access',
          token_type: 'Bearer',
          refresh_token: 'test-refresh',
          ...binding,
        };
        const provider = {
          ...memory,
          isClientInformationDynamicallyRegistered:
            dynamic === undefined ? undefined : () => dynamic,
        };
        const promise = auth(provider, {
          serverUrl,
          fetchFn: transport({ tokenError }),
        });
        if (dynamic) {
          expect(await promise).toBe('REDIRECT');
          expect(memory.invalidations).toEqual(['all']);
          expect(memory.client?.client_id).toBe('registered-client');
        } else {
          await expect(promise).rejects.toThrow();
          expect(memory.invalidations).toEqual([]);
          expect(memory.client?.client_id).toBe('existing-client');
        }
      }
    },
  );

  it('does not let a flow pin override the issuer on client credentials', async () => {
    const provider = new MemoryProvider();
    provider.client = {
      client_id: 'configured-client',
      client_secret: 'test-secret',
      issuer: 'https://other.example.com',
    };
    const fetchFn = transport();
    await expect(
      auth(
        {
          ...provider,
          authorizationServerInformation: () => ({
            issuer,
            authorizationServerUrl: issuer,
            tokenEndpoint: `${issuer}/token`,
          }),
        },
        { serverUrl, fetchFn },
      ),
    ).rejects.toThrow('does not match the issuer');
    expect(tokenCalls(fetchFn)).toHaveLength(0);
  });

  it('rejects a changed endpoint instead of refreshing bound tokens', async () => {
    const provider = new MemoryProvider();
    provider.client = { client_id: 'configured-client', ...binding };
    provider.storedTokens = {
      access_token: 'old-access',
      token_type: 'Bearer',
      refresh_token: 'test-refresh',
      ...binding,
    };
    const fetchFn = transport({ tokenEndpoint: `${issuer}/new-token` });
    await expect(auth(provider, { serverUrl, fetchFn })).rejects.toThrow(
      'does not match the metadata that issued',
    );
    expect(tokenCalls(fetchFn)).toHaveLength(0);
  });

  it.each(['callback', 'refresh'] as const)(
    'rejects a changed authorization server before %s credentials are sent',
    async flow => {
      const provider = new MemoryProvider();
      const fetchFn = transport();
      await auth(provider, { serverUrl, fetchFn });
      if (flow === 'refresh') {
        await auth(provider, {
          serverUrl,
          fetchFn,
          authorizationCode: 'test-code',
          callbackState: 'request-state',
        });
      }
      const changedServer = transport({
        authorizationServer: 'https://other-login.example.com',
      });
      await expect(
        auth(provider, {
          serverUrl,
          fetchFn: changedServer,
          ...(flow === 'callback'
            ? {
                authorizationCode: 'test-code',
                callbackState: 'request-state',
              }
            : {}),
        }),
      ).rejects.toThrow('does not match the issuer');
      expect(tokenCalls(changedServer)).toHaveLength(0);
      expect(
        changedServer.mock.calls.every(([, init]) => init?.method !== 'POST'),
      ).toBe(true);
      expect(provider.invalidations).toEqual([]);
    },
  );

  it('starts fresh authorization instead of refreshing unbound legacy tokens', async () => {
    const provider = new MemoryProvider();
    provider.client = { client_id: 'public-client' };
    provider.storedTokens = {
      access_token: 'old-access',
      token_type: 'Bearer',
      refresh_token: 'test-refresh',
    };
    const fetchFn = transport();
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('REDIRECT');
    expect(provider.invalidations).toEqual(['tokens']);
    expect(provider.client).toMatchObject(binding);
    expect(tokenCalls(fetchFn)).toHaveLength(0);
  });

  it.each(['other-state', undefined])(
    'rejects a callback with state %s before code exchange',
    async callbackState => {
      const provider = new MemoryProvider();
      const fetchFn = transport();
      await auth(provider, { serverUrl, fetchFn });
      await expect(
        auth(provider, {
          serverUrl,
          fetchFn,
          authorizationCode: 'test-code',
          callbackState,
        }),
      ).rejects.toThrow('state parameter mismatch');
      expect(tokenCalls(fetchFn)).toHaveLength(0);
    },
  );

  it('uses the saved callback issuer when resource metadata is unavailable', async () => {
    const provider = new MemoryProvider();
    await auth(provider, { serverUrl, fetchFn: transport() });
    const fetchFn = transport({ noResourceMetadata: true });
    expect(
      await auth(provider, {
        serverUrl,
        fetchFn,
        authorizationCode: 'test-code',
        callbackState: 'request-state',
      }),
    ).toBe('AUTHORIZED');
    expect(provider.storedTokens).toMatchObject(binding);
  });

  it('rejects a callback issuer mismatch before code exchange', async () => {
    const provider = new MemoryProvider();
    const fetchFn = transport();
    await auth(provider, { serverUrl, fetchFn });
    await expect(
      auth(provider, {
        serverUrl,
        fetchFn,
        authorizationCode: 'test-code',
        callbackState: 'request-state',
        callbackIssuer: 'https://other.example.com',
      }),
    ).rejects.toThrow('authorization response issuer');
    expect(tokenCalls(fetchFn)).toHaveLength(0);
  });

  it('preserves credentials when a callback code is rejected', async () => {
    const provider = new MemoryProvider();
    await auth(provider, { serverUrl, fetchFn: transport() });
    await expect(
      auth(provider, {
        serverUrl,
        fetchFn: transport({ tokenError: 'invalid_grant' }),
        authorizationCode: 'test-code',
        callbackState: 'request-state',
      }),
    ).rejects.toThrow();
    expect(provider.invalidations).toEqual([]);
    expect(provider.client).toMatchObject(binding);
  });

  it('preserves the token-only pin when an invalid refresh starts authorization again', async () => {
    const provider = new MemoryProvider();
    provider.client = { client_id: 'public-client' };
    provider.storedTokens = {
      access_token: 'old-access',
      token_type: 'Bearer',
      refresh_token: 'test-refresh',
      ...binding,
    };
    const fetchFn = transport({ tokenError: 'invalid_grant' });
    expect(await auth(provider, { serverUrl, fetchFn })).toBe('REDIRECT');
    expect(provider.invalidations).toEqual(['tokens']);
    expect(provider.client).toMatchObject(binding);
    expect(tokenCalls(fetchFn)).toHaveLength(1);
  });
});

describe('OAuth discovery issuer validation', () => {
  it('rejects metadata with an unexpected issuer', async () => {
    await expect(
      discoverAuthorizationServerMetadata(issuer, {
        fetchFn: transport({ metadataIssuer: 'https://other.example.com' }),
      }),
    ).rejects.toThrow('does not match expected issuer');
  });

  it('accepts a trailing slash for an origin-only issuer', async () => {
    expect(
      await discoverAuthorizationServerMetadata(issuer, {
        fetchFn: transport({ metadataIssuer: `${issuer}/` }),
      }),
    ).toMatchObject({ issuer: `${issuer}/` });
  });

  it('keeps every discovery candidate on the configured origin', () => {
    const urls = buildDiscoveryUrls(`${issuer}//tenant`);
    expect(urls.map(candidate => candidate.url.origin)).toEqual(
      urls.map(() => issuer),
    );
  });
});
