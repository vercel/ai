import type { FetchFunction } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAzure } from './azure-openai-provider';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['custom', 'global'] as const)('%s fetch', transport => {
  describe.each(['token', 'api-key'] as const)('%s authentication', auth => {
    it.each(['MAI-Image-2.6', 'gpt-image-1'])(
      'keeps credentials off %s image downloads and redirects',
      async modelId => {
        const fetch = vi.fn<FetchFunction>(async input => {
          const url = String(input);
          if (url === 'https://files.example.com/image.png') {
            return new Response(null, {
              status: 302,
              headers: { location: 'https://cdn.example.com/image.png' },
            });
          }
          if (
            url === 'https://cdn.example.com/image.png' ||
            url === 'https://files.example.com/mask.png'
          ) {
            return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
              headers: { 'content-type': 'image/png' },
            });
          }
          return new Response(
            JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }),
            { headers: { 'content-type': 'application/json' } },
          );
        });
        const tokenProvider = vi.fn().mockResolvedValue('entra-token');
        vi.stubGlobal(
          'fetch',
          transport === 'global'
            ? fetch
            : vi.fn(() => {
                throw new Error('Expected the custom fetch transport');
              }),
        );
        const provider = createAzure({
          resourceName: 'test-resource',
          ...(auth === 'token'
            ? { tokenProvider }
            : { apiKey: 'azure-api-key' }),
          headers: { 'x-provider-secret': 'provider-secret' },
          fetch: transport === 'custom' ? fetch : undefined,
        });

        await provider.image(modelId).doGenerate({
          prompt: 'Edit this image',
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          files: [{ type: 'url', url: 'https://files.example.com/image.png' }],
          mask:
            modelId === 'gpt-image-1'
              ? { type: 'url', url: 'https://files.example.com/mask.png' }
              : undefined,
          providerOptions: {},
        });

        const downloads = fetch.mock.calls.slice(0, -1);
        expect(downloads.map(([url]) => String(url))).toEqual([
          'https://files.example.com/image.png',
          'https://cdn.example.com/image.png',
          ...(modelId === 'gpt-image-1'
            ? ['https://files.example.com/mask.png']
            : []),
        ]);
        for (const [, init] of downloads) {
          const headers = new Headers(init?.headers);
          expect(headers.has('authorization')).toBe(false);
          expect(headers.has('api-key')).toBe(false);
          expect(headers.has('x-provider-secret')).toBe(false);
          expect(init?.redirect).toBe('manual');
        }

        const [apiUrl, apiInit] = fetch.mock.calls.at(-1)!;
        expect(String(apiUrl)).toBe(
          modelId === 'MAI-Image-2.6'
            ? 'https://test-resource.services.ai.azure.com/mai/v1/images/edits'
            : 'https://test-resource.openai.azure.com/openai/v1/images/edits?api-version=v1',
        );
        const apiHeaders = new Headers(apiInit?.headers);
        expect(apiHeaders.get('x-provider-secret')).toBe('provider-secret');
        expect(
          apiHeaders.get(auth === 'token' ? 'authorization' : 'api-key'),
        ).toBe(auth === 'token' ? 'Bearer entra-token' : 'azure-api-key');
        expect(tokenProvider).toHaveBeenCalledTimes(auth === 'token' ? 1 : 0);
      },
    );
  });
});
