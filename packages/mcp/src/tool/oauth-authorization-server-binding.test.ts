import { describe, expect, it, vi } from 'vitest';
import { type FetchFunction } from '@ai-sdk/provider-utils';
import {
  auth,
  buildDiscoveryUrls,
  discoverAuthorizationServerMetadata,
  type OAuthClientProvider,
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
    metadataIssuer?: string;
    tokenEndpoint?: string;
    noResourceMetadata?: boolean;
    tokenError?: string;
  } = {},
) {
  return vi.fn<FetchFunction>(async (url, init) => {
    const href = String(url);
    if (href.includes('/.well-known/oauth-protected-resource')) {
      return options.noResourceMetadata
        ? new Response(null, { status: 404 })
        : Response.json({
            resource: serverUrl,
            authorization_servers: [issuer],
          });
    }
    if (href.includes('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: options.metadataIssuer ?? issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: options.tokenEndpoint ?? `${issuer}/token`,
        registration_endpoint: `${issuer}/register`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (href === `${issuer}/register`) {
      return Response.json({
        client_id: 'registered-client',
        client_secret: 'test-secret',
        redirect_uris: ['http://localhost:3000/callback'],
      });
    }
    if (href === `${issuer}/token` && init?.method === 'POST') {
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
