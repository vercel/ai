import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractResourceMetadataUrl,
  type OAuthClientProvider,
  type AuthResult,
  discoverOAuthProtectedResourceMetadata,
} from './oauth';
import { LATEST_PROTOCOL_VERSION } from './types';

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
