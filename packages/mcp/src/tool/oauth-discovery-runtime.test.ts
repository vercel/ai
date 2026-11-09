import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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

  it('does not treat a window alias without a document as a browser', async () => {
    vi.stubGlobal('window', globalThis);

    await expect(discoverAuthorizationServerMetadata(issuer)).rejects.toThrow(
      /requires a custom fetch with connect-time DNS validation/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
