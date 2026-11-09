import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../google-vertex-auth-google-auth-library', () => ({
  createAuthTokenGenerator: () => async () => 'test-token',
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe.skipIf(
  typeof process.getBuiltinModule !== 'function' ||
    (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime != null,
)('MaaS Node image download transport', () => {
  it.each([false, true])(
    'uses the DNS-pinned transport for downloads and redirect hops (forward global fetch: %s)',
    async forwardGlobalFetch => {
      vi.resetModules();
      const apiFetch = vi.fn<typeof globalThis.fetch>(async url => {
        if (url !== 'https://api.example/v1/images/generations') {
          throw new Error('Image downloads must use the download transport');
        }
        return Response.json({
          data: [{ url: 'https://images.example/image.png' }],
        });
      });
      vi.stubGlobal('fetch', apiFetch);

      // Replace only the Node transport's dependency loader. No DNS lookup
      // or socket connection is made; the real download helper selects it.
      const agent = vi.fn();
      const downloadFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example/image.png' },
          }),
        )
        .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
      const getBuiltinModule = process.getBuiltinModule;
      vi.spyOn(process, 'getBuiltinModule').mockImplementation(((id: string) =>
        id === 'node:module'
          ? {
              createRequire: () => () => ({
                Agent: class {
                  constructor(options: unknown) {
                    agent(options);
                  }
                },
                fetch: downloadFetch,
              }),
            }
          : getBuiltinModule(id)) as typeof process.getBuiltinModule);

      const { createGoogleVertexMaas } =
        await import('./google-vertex-maas-provider-node');
      const provider = createGoogleVertexMaas({
        baseURL: 'https://api.example/v1',
        headers: { 'x-provider-key': 'test-key' },
        ...(forwardGlobalFetch ? { fetch: globalThis.fetch } : {}),
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
      });

      expect(result.images).toEqual([new Uint8Array([1, 2, 3])]);
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch).toHaveBeenCalledWith(
        'https://api.example/v1/images/generations',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'x-provider-key': 'test-key',
          }),
        }),
      );
      expect(agent).toHaveBeenCalledExactlyOnceWith({
        connect: { lookup: expect.any(Function) },
      });
      expect(downloadFetch).toHaveBeenCalledTimes(2);
      for (const [index, url] of [
        'https://images.example/image.png',
        'https://cdn.example/image.png',
      ].entries()) {
        expect(downloadFetch).toHaveBeenNthCalledWith(
          index + 1,
          url,
          expect.objectContaining({
            redirect: 'manual',
            signal: abortSignal,
            dispatcher: expect.any(Object),
          }),
        );
        const headers = new Headers(downloadFetch.mock.calls[index][1].headers);
        expect(headers.has('authorization')).toBe(false);
        expect(headers.has('x-provider-key')).toBe(false);
      }
    },
  );
});
