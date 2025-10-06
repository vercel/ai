import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractResourceMetadataUrl,
  type OAuthClientProvider,
  type AuthResult,
  discoverOAuthProtectedResourceMetadata,
  buildDiscoveryUrls,
  discoverAuthorizationServerMetadata,
  startAuthorization,
} from './oauth';
import { LATEST_PROTOCOL_VERSION } from './types';

// Mock the pkce-challenge module
vi.mock('pkce-challenge', () => ({
  default: vi.fn(() => ({
    code_verifier: 'test_verifier',
    code_challenge: 'test_challenge',
  })),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('extractResourceMetadataUrl', () => {
  it('returns resource metadata url when present', async () => {
    const resourceUrl =
      'https://resource.example.com/.well-known/oauth-protected-resource';
    const mockResponse = {
      headers: {
        get: vi.fn(name =>
          name === 'WWW-Authenticate'
            ? `Bearer realm="mcp", resource_metadata="${resourceUrl}"`
            : null,
        ),
      },
    } as unknown as Response;

    expect(extractResourceMetadataUrl(mockResponse)).toEqual(
      new URL(resourceUrl),
    );
  });

  it('returns undefined if not bearer', async () => {
    const resourceUrl =
      'https://resource.example.com/.well-known/oauth-protected-resource';
    const mockResponse = {
      headers: {
        get: vi.fn(name =>
          name === 'WWW-Authenticate'
            ? `Basic realm="mcp", resource_metadata="${resourceUrl}"`
            : null,
        ),
      },
    } as unknown as Response;

    expect(extractResourceMetadataUrl(mockResponse)).toBeUndefined();
  });

  it('returns undefined if resource_metadata not present', async () => {
    const mockResponse = {
      headers: {
        get: vi.fn(name =>
          name === 'WWW-Authenticate' ? `Basic realm="mcp"` : null,
        ),
      },
    } as unknown as Response;

    expect(extractResourceMetadataUrl(mockResponse)).toBeUndefined();
  });

  it('returns undefined on invalid url', async () => {
    const resourceUrl = 'invalid-url';
    const mockResponse = {
      headers: {
        get: vi.fn(name =>
          name === 'WWW-Authenticate'
            ? `Basic realm="mcp", resource_metadata="${resourceUrl}"`
            : null,
        ),
      },
    } as unknown as Response;

    expect(extractResourceMetadataUrl(mockResponse)).toBeUndefined();
  });
});

describe('discoverOAuthProtectedResourceMetadata', () => {
  const validMetadata = {
    resource: 'https://resource.example.com',
    authorization_servers: ['https://auth.example.com'],
  };

  it('returns metadata when discovery succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validMetadata,
    });

    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com',
    );
    expect(metadata).toEqual(validMetadata);
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1);
    const [url] = calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource',
    );
  });

  it('returns metadata when first fetch fails but second without MCP header succeeds', async () => {
    // Set up a counter to control behavior
    let callCount = 0;

    // Mock implementation that changes behavior based on call count
    mockFetch.mockImplementation((_url, _options) => {
      callCount++;

      if (callCount === 1) {
        // First call with MCP header - fail with TypeError (simulating CORS error)
        // We need to use TypeError specifically because that's what the implementation checks for
        return Promise.reject(new TypeError('Network error'));
      } else {
        // Second call without header - succeed
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => validMetadata,
        });
      }
    });

    // Should succeed with the second call
    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com',
    );
    expect(metadata).toEqual(validMetadata);

    // Verify both calls were made
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify first call had MCP header
    expect(mockFetch.mock.calls[0][1]?.headers).toHaveProperty(
      'MCP-Protocol-Version',
    );
  });

  it('throws an error when all fetch attempts fail', async () => {
    // Set up a counter to control behavior
    let callCount = 0;

    // Mock implementation that changes behavior based on call count
    mockFetch.mockImplementation((_url, _options) => {
      callCount++;

      if (callCount === 1) {
        // First call - fail with TypeError
        return Promise.reject(new TypeError('First failure'));
      } else {
        // Second call - fail with different error
        return Promise.reject(new Error('Second failure'));
      }
    });

    // Should fail with the second error
    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com'),
    ).rejects.toThrow('Second failure');

    // Verify both calls were made
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on 404 errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com'),
    ).rejects.toThrow(
      'Resource server does not implement OAuth 2.0 Protected Resource Metadata.',
    );
  });

  it('throws on non-404 errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com'),
    ).rejects.toThrow('HTTP 500');
  });

  it('validates metadata schema', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        // Missing required fields
        scopes_supported: ['email', 'mcp'],
      }),
    });

    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com'),
    ).rejects.toThrow();
  });

  it('returns metadata when discovery succeeds with path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validMetadata,
    });

    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com/path/name',
    );
    expect(metadata).toEqual(validMetadata);
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1);
    const [url] = calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource/path/name',
    );
  });

  it('preserves query parameters in path-aware discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validMetadata,
    });

    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com/path?param=value',
    );
    expect(metadata).toEqual(validMetadata);
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1);
    const [url] = calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource/path?param=value',
    );
  });

  it.each([400, 401, 403, 404, 410, 422, 429])(
    'falls back to root discovery when path-aware discovery returns %d',
    async statusCode => {
      // First call (path-aware) returns 4xx
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: statusCode,
      });

      // Second call (root fallback) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validMetadata,
      });

      const metadata = await discoverOAuthProtectedResourceMetadata(
        'https://resource.example.com/path/name',
      );
      expect(metadata).toEqual(validMetadata);

      const calls = mockFetch.mock.calls;
      expect(calls.length).toBe(2);

      // First call should be path-aware
      const [firstUrl, firstOptions] = calls[0];
      expect(firstUrl.toString()).toBe(
        'https://resource.example.com/.well-known/oauth-protected-resource/path/name',
      );
      expect(firstOptions.headers).toEqual({
        'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
      });

      // Second call should be root fallback
      const [secondUrl, secondOptions] = calls[1];
      expect(secondUrl.toString()).toBe(
        'https://resource.example.com/.well-known/oauth-protected-resource',
      );
      expect(secondOptions.headers).toEqual({
        'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
      });
    },
  );

  it('throws error when both path-aware and root discovery return 404', async () => {
    // First call (path-aware) returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second call (root fallback) also returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata(
        'https://resource.example.com/path/name',
      ),
    ).rejects.toThrow(
      'Resource server does not implement OAuth 2.0 Protected Resource Metadata.',
    );

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(2);
  });

  it('throws error on 500 status and does not fallback', async () => {
    // First call (path-aware) returns 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata(
        'https://resource.example.com/path/name',
      ),
    ).rejects.toThrow();

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1); // Should not attempt fallback
  });

  it('does not fallback when the original URL is already at root path', async () => {
    // First call (path-aware for root) returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com/'),
    ).rejects.toThrow(
      'Resource server does not implement OAuth 2.0 Protected Resource Metadata.',
    );

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1); // Should not attempt fallback

    const [url] = calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource',
    );
  });

  it('does not fallback when the original URL has no path', async () => {
    // First call (path-aware for no path) returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata('https://resource.example.com'),
    ).rejects.toThrow(
      'Resource server does not implement OAuth 2.0 Protected Resource Metadata.',
    );

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1); // Should not attempt fallback

    const [url] = calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource',
    );
  });

  it('falls back when path-aware discovery encounters CORS error', async () => {
    // First call (path-aware) fails with TypeError (CORS)
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new TypeError('CORS error')),
    );

    // Retry path-aware without headers (simulating CORS retry)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second call (root fallback) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validMetadata,
    });

    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com/deep/path',
    );
    expect(metadata).toEqual(validMetadata);

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(3);

    // Final call should be root fallback
    const [lastUrl, lastOptions] = calls[2];
    expect(lastUrl.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource',
    );
    expect(lastOptions.headers).toEqual({
      'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
    });
  });

  it('does not fallback when resourceMetadataUrl is provided', async () => {
    // Call with explicit URL returns 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      discoverOAuthProtectedResourceMetadata(
        'https://resource.example.com/path',
        {
          resourceMetadataUrl: 'https://custom.example.com/metadata',
        },
      ),
    ).rejects.toThrow(
      'Resource server does not implement OAuth 2.0 Protected Resource Metadata.',
    );

    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1); // Should not attempt fallback when explicit URL is provided

    const [url] = calls[0];
    expect(url.toString()).toBe('https://custom.example.com/metadata');
  });

  it('supports overriding the fetch function used for requests', async () => {
    const validMetadata = {
      resource: 'https://resource.example.com',
      authorization_servers: ['https://auth.example.com'],
    };

    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validMetadata,
    });

    const metadata = await discoverOAuthProtectedResourceMetadata(
      'https://resource.example.com',
      undefined,
      customFetch,
    );

    expect(metadata).toEqual(validMetadata);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();

    const [url, options] = customFetch.mock.calls[0];
    expect(url.toString()).toBe(
      'https://resource.example.com/.well-known/oauth-protected-resource',
    );
    expect(options.headers).toEqual({
      'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
    });
  });
});

describe('buildDiscoveryUrls', () => {
  it('generates correct URLs for server without path', () => {
    const urls = buildDiscoveryUrls('https://auth.example.com');

    expect(urls).toHaveLength(2);
    expect(urls.map(u => ({ url: u.url.toString(), type: u.type }))).toEqual([
      {
        url: 'https://auth.example.com/.well-known/oauth-authorization-server',
        type: 'oauth',
      },
      {
        url: 'https://auth.example.com/.well-known/openid-configuration',
        type: 'oidc',
      },
    ]);
  });

  it('generates correct URLs for server with path', () => {
    const urls = buildDiscoveryUrls('https://auth.example.com/tenant1');

    expect(urls).toHaveLength(4);
    expect(urls.map(u => ({ url: u.url.toString(), type: u.type }))).toEqual([
      {
        url: 'https://auth.example.com/.well-known/oauth-authorization-server/tenant1',
        type: 'oauth',
      },
      {
        url: 'https://auth.example.com/.well-known/oauth-authorization-server',
        type: 'oauth',
      },
      {
        url: 'https://auth.example.com/.well-known/openid-configuration/tenant1',
        type: 'oidc',
      },
      {
        url: 'https://auth.example.com/tenant1/.well-known/openid-configuration',
        type: 'oidc',
      },
    ]);
  });

  it('handles URL object input', () => {
    const urls = buildDiscoveryUrls(
      new URL('https://auth.example.com/tenant1'),
    );

    expect(urls).toHaveLength(4);
    expect(urls[0].url.toString()).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant1',
    );
  });
});

describe('discoverAuthorizationServerMetadata', () => {
  const validOAuthMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    registration_endpoint: 'https://auth.example.com/register',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  };

  const validOpenIdMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/authorize',
    token_endpoint: 'https://auth.example.com/token',
    jwks_uri: 'https://auth.example.com/jwks',
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  };

  it('tries URLs in order and returns first successful metadata', async () => {
    // First OAuth URL fails with 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second OAuth URL (root) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validOAuthMetadata,
    });

    const metadata = await discoverAuthorizationServerMetadata(
      'https://auth.example.com/tenant1',
    );

    expect(metadata).toEqual(validOAuthMetadata);

    // Verify it tried the URLs in the correct order
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0].toString()).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server/tenant1',
    );
    expect(calls[1][0].toString()).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server',
    );
  });

  it('throws error when OIDC provider does not support S256 PKCE', async () => {
    // OAuth discovery fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // OpenID Connect discovery succeeds but without S256 support
    const invalidOpenIdMetadata = {
      ...validOpenIdMetadata,
      code_challenge_methods_supported: ['plain'], // Missing S256
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => invalidOpenIdMetadata,
    });

    await expect(
      discoverAuthorizationServerMetadata('https://auth.example.com'),
    ).rejects.toThrow(
      'does not support S256 code challenge method required by MCP specification',
    );
  });

  it('continues on 4xx errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validOpenIdMetadata,
    });

    const metadata = await discoverAuthorizationServerMetadata(
      'https://mcp.example.com',
    );

    expect(metadata).toEqual(validOpenIdMetadata);
  });

  it('throws on non-4xx errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      discoverAuthorizationServerMetadata('https://mcp.example.com'),
    ).rejects.toThrow('HTTP 500');
  });

  it('handles CORS errors with retry', async () => {
    // First call fails with CORS
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new TypeError('CORS error')),
    );

    // Retry without headers succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validOAuthMetadata,
    });

    const metadata = await discoverAuthorizationServerMetadata(
      'https://auth.example.com',
    );

    expect(metadata).toEqual(validOAuthMetadata);
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(2);

    // First call should have headers
    expect(calls[0][1]?.headers).toHaveProperty('MCP-Protocol-Version');

    // Second call should not have headers (CORS retry)
    expect(calls[1][1]?.headers).toBeUndefined();
  });

  it('supports custom fetch function', async () => {
    const customFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validOAuthMetadata,
    });

    const metadata = await discoverAuthorizationServerMetadata(
      'https://auth.example.com',
      { fetchFn: customFetch },
    );

    expect(metadata).toEqual(validOAuthMetadata);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('supports custom protocol version', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validOAuthMetadata,
    });

    const metadata = await discoverAuthorizationServerMetadata(
      'https://auth.example.com',
      { protocolVersion: '2025-01-01' },
    );

    expect(metadata).toEqual(validOAuthMetadata);
    const calls = mockFetch.mock.calls;
    const [, options] = calls[0];
    expect(options.headers).toEqual({
      'MCP-Protocol-Version': '2025-01-01',
    });
  });

  it('returns undefined when all URLs fail with CORS errors', async () => {
    // All fetch attempts fail with CORS errors (TypeError)
    mockFetch.mockImplementation(() =>
      Promise.reject(new TypeError('CORS error')),
    );

    const metadata = await discoverAuthorizationServerMetadata(
      'https://auth.example.com/tenant1',
    );

    expect(metadata).toBeUndefined();

    // Verify that all discovery URLs were attempted
    expect(mockFetch).toHaveBeenCalledTimes(8); // 4 URLs × 2 attempts each (with and without headers)
  });
});

describe('startAuthorization', () => {
  const validMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/auth',
    token_endpoint: 'https://auth.example.com/tkn',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  };

  const validClientInfo = {
    client_id: 'client123',
    client_secret: 'secret123',
    redirect_uris: ['http://localhost:3000/callback'],
    client_name: 'Test Client',
  };

  it('generates authorization URL with PKCE challenge', async () => {
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      'https://auth.example.com',
      {
        metadata: undefined,
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
        resource: new URL('https://api.example.com/mcp-server'),
      },
    );

    expect(authorizationUrl.toString()).toMatch(
      /^https:\/\/auth\.example\.com\/authorize\?/,
    );
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
      'test_challenge',
    );
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
      'S256',
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/callback',
    );
    expect(authorizationUrl.searchParams.get('resource')).toBe(
      'https://api.example.com/mcp-server',
    );
    expect(codeVerifier).toBe('test_verifier');
  });

  it('includes scope parameter when provided', async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
        scope: 'read write profile',
      },
    );

    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'read write profile',
    );
  });

  it('excludes scope parameter when not provided', async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
      },
    );

    expect(authorizationUrl.searchParams.has('scope')).toBe(false);
  });

  it('includes state parameter when provided', async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
        state: 'foobar',
      },
    );

    expect(authorizationUrl.searchParams.get('state')).toBe('foobar');
  });

  it('excludes state parameter when not provided', async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
      },
    );

    expect(authorizationUrl.searchParams.has('state')).toBe(false);
  });

  // OpenID Connect requires that the user is prompted for consent if the scope includes 'offline_access'
  it("includes consent prompt parameter if scope includes 'offline_access'", async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
        scope: 'read write profile offline_access',
      },
    );

    expect(authorizationUrl.searchParams.get('prompt')).toBe('consent');
  });

  it('uses metadata authorization_endpoint when provided', async () => {
    const { authorizationUrl } = await startAuthorization(
      'https://auth.example.com',
      {
        metadata: validMetadata,
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
      },
    );

    expect(authorizationUrl.toString()).toMatch(
      /^https:\/\/auth\.example\.com\/auth\?/,
    );
  });

  it('validates response type support', async () => {
    const metadata = {
      ...validMetadata,
      response_types_supported: ['token'], // Does not support 'code'
    };

    await expect(
      startAuthorization('https://auth.example.com', {
        metadata,
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
      }),
    ).rejects.toThrow(/does not support response type/);
  });

  it('validates PKCE support', async () => {
    const metadata = {
      ...validMetadata,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['plain'], // Does not support 'S256'
    };

    await expect(
      startAuthorization('https://auth.example.com', {
        metadata,
        clientInformation: validClientInfo,
        redirectUrl: 'http://localhost:3000/callback',
      }),
    ).rejects.toThrow(/does not support code challenge method/);
  });
});
