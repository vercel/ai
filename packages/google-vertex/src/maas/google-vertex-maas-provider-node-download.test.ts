import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../google-vertex-auth-google-auth-library', () => ({
  createAuthTokenGenerator: () => async () => 'test-token',
}));

vi.mock('../edge/google-vertex-auth-edge', () => ({
  generateAuthToken: async () => 'test-token',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe.each(['node', 'edge'])('MaaS %s browser redirects', entryPoint => {
  it('preserves the native follow retry after an opaque redirect', async () => {
    vi.stubGlobal('window', {});
    const customFetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === 'https://api.example/v1/images/generations') {
        return Response.json({
          data: [{ url: 'https://images.example/image.png' }],
        });
      }
      if (init?.redirect === 'manual') {
        return { type: 'opaqueredirect' } as Response;
      }
      if (init?.redirect === 'follow') {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      throw new Error('Unexpected redirect mode');
    });
    const { createGoogleVertexMaas } =
      entryPoint === 'node'
        ? await import('./google-vertex-maas-provider-node')
        : await import('./edge/google-vertex-maas-provider-edge');
    const provider = createGoogleVertexMaas({
      baseURL: 'https://api.example/v1',
      fetch: customFetch,
    });

    const result = await provider.imageModel('test-model').doGenerate({
      prompt: 'A small blue square',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      files: undefined,
      mask: undefined,
    });

    expect(result.images).toEqual([new Uint8Array([1, 2, 3])]);
    expect(customFetch).toHaveBeenCalledTimes(3);
    expect(customFetch).toHaveBeenNthCalledWith(
      2,
      'https://images.example/image.png',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(customFetch).toHaveBeenNthCalledWith(
      3,
      'https://images.example/image.png',
      expect.objectContaining({ redirect: 'follow' }),
    );
  });
});

describe.each(['node', 'edge'])(
  'MaaS %s image download transport',
  entryPoint => {
    it.each(['default', 'forwarded global', 'custom'] as const)(
      'downloads images and redirect hops through the %s fetch without credentials',
      async transport => {
        vi.resetModules();
        const createFetch = () =>
          vi.fn<typeof globalThis.fetch>(async url => {
            switch (url) {
              case 'https://api.example/v1/images/generations':
                return Response.json({
                  data: [{ url: 'https://images.example/image.png' }],
                });
              case 'https://images.example/image.png':
                return new Response(null, {
                  status: 302,
                  headers: { location: 'https://cdn.example/image.png' },
                });
              case 'https://cdn.example/image.png':
                return new Response(new Uint8Array([1, 2, 3]));
              default:
                throw new Error(`Unexpected URL: ${String(url)}`);
            }
          });
        const runtimeFetch = createFetch();
        const customFetch = createFetch();
        vi.stubGlobal('fetch', runtimeFetch);
        const selectedFetch =
          transport === 'custom' ? customFetch : runtimeFetch;

        const { createGoogleVertexMaas } =
          entryPoint === 'node'
            ? await import('./google-vertex-maas-provider-node')
            : await import('./edge/google-vertex-maas-provider-edge');
        const provider = createGoogleVertexMaas({
          baseURL: 'https://api.example/v1',
          headers: { 'x-provider-key': 'test-key' },
          ...(transport === 'default'
            ? {}
            : {
                fetch: transport === 'custom' ? customFetch : globalThis.fetch,
              }),
        });
        const abortSignal = new AbortController().signal;

        const result = await provider.imageModel('test-model').doGenerate({
          prompt: 'A small blue square',
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
          abortSignal,
          files: undefined,
          mask: undefined,
        });

        expect(result.images).toEqual([new Uint8Array([1, 2, 3])]);
        expect(
          transport === 'custom' ? runtimeFetch : customFetch,
        ).not.toHaveBeenCalled();
        expect(selectedFetch).toHaveBeenCalledTimes(3);
        expect(selectedFetch).toHaveBeenNthCalledWith(
          1,
          'https://api.example/v1/images/generations',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'x-provider-key': 'test-key',
            }),
          }),
        );
        for (const [index, url] of [
          'https://images.example/image.png',
          'https://cdn.example/image.png',
        ].entries()) {
          expect(selectedFetch).toHaveBeenNthCalledWith(
            index + 2,
            url,
            expect.objectContaining({
              redirect: 'manual',
              signal: abortSignal,
            }),
          );
          const headers = new Headers(
            selectedFetch.mock.calls[index + 1][1]?.headers,
          );
          expect(headers.has('authorization')).toBe(false);
          expect(headers.has('x-provider-key')).toBe(false);
        }
      },
    );
  },
);
