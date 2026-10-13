import { NoSuchModelError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopaz } from './topaz-provider';
import { VERSION } from './version';

describe('createTopaz', () => {
  beforeEach(() => {
    vi.stubEnv('TOPAZ_API_KEY', 'env-key');
  });

  it('creates image models', () => {
    const provider = createTopaz({ apiKey: 'test-key' });
    const model = provider.imageModel('wonder-3.5');

    expect(model.provider).toBe('topaz.image');
    expect(model.modelId).toBe('wonder-3.5');
    expect(model.specificationVersion).toBe('v3');
  });

  it('creates video models', () => {
    const provider = createTopaz({ apiKey: 'test-key' });
    const model = provider.videoModel('starlight-precise-2.6');

    expect(model.provider).toBe('topaz.video');
    expect(model.modelId).toBe('starlight-precise-2.6');
    expect(model.specificationVersion).toBe('v3');
  });

  it('exposes short aliases for both model types', () => {
    const provider = createTopaz({ apiKey: 'test-key' });

    expect(provider.image('wonder-3.5').modelId).toBe('wonder-3.5');
    expect(provider.video('proteus').modelId).toBe('proteus');
  });

  it('reports specification version v3', () => {
    expect(createTopaz({ apiKey: 'test-key' }).specificationVersion).toBe('v3');
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createTopaz({ apiKey: 'test-key' });

    expect(() => provider.languageModel('anything')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('anything')).toThrow(NoSuchModelError);
  });

  it('sends the API key, custom headers and user agent to a custom base URL', async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetch: FetchFunction = async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });
      return new Response(
        JSON.stringify(
          String(input).endsWith('/express')
            ? { requestId: 'req-1' }
            : {
                status: 'complete',
                download: { url: 'https://cdn.example.com/output.mp4' },
              },
        ),
        {
          headers: { 'content-type': 'application/json' },
        },
      );
    };

    const provider = createTopaz({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example.com/topaz/',
      headers: { 'X-Custom': 'custom-value' },
      fetch,
    });

    await provider.videoModel('proteus').doGenerate({
      prompt: '',
      n: 1,
      aspectRatio: undefined,
      resolution: '1280x720',
      duration: undefined,
      fps: undefined,
      seed: undefined,
      image: undefined,
      frameImages: undefined,
      inputReferences: [{ type: 'url', url: 'https://example.com/input.mp4' }],
      generateAudio: undefined,
      providerOptions: {},
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe(
      'https://proxy.example.com/topaz/video/express',
    );
    expect(requests[0].headers.get('x-api-key')).toBe('test-key');
    expect(requests[0].headers.get('x-custom')).toBe('custom-value');
    expect(requests[0].headers.get('user-agent')).toContain(
      `ai-sdk-topaz/${VERSION}`,
    );
  });

  it('throws when no API key is configured', async () => {
    vi.stubEnv('TOPAZ_API_KEY', undefined);

    const provider = createTopaz();

    // The key is loaded lazily, when headers are first resolved.
    await expect(
      provider.imageModel('wonder-3.5').doGenerate({
        prompt: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: [{ type: 'url', url: 'https://example.com/input.png' }],
        mask: undefined,
        providerOptions: {},
      }),
    ).rejects.toThrow(/TOPAZ_API_KEY/);
  });
});
