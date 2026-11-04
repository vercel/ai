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
    expect(model.specificationVersion).toBe('v4');
  });

  it('creates video models', () => {
    const provider = createTopaz({ apiKey: 'test-key' });
    const model = provider.videoModel('starlight-precise-2.6');

    expect(model.provider).toBe('topaz.video');
    expect(model.modelId).toBe('starlight-precise-2.6');
    expect(model.specificationVersion).toBe('v4');
  });

  it('exposes short aliases for both model types', () => {
    const provider = createTopaz({ apiKey: 'test-key' });

    expect(provider.image('wonder-3.5').modelId).toBe('wonder-3.5');
    expect(provider.video('proteus').modelId).toBe('proteus');
  });

  it('reports specification version v4', () => {
    expect(createTopaz({ apiKey: 'test-key' }).specificationVersion).toBe('v4');
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
      return new Response(JSON.stringify({ status: 'processing' }), {
        headers: { 'content-type': 'application/json' },
      });
    };

    const provider = createTopaz({
      apiKey: 'test-key',
      baseURL: 'https://proxy.example.com/topaz/',
      headers: { 'X-Custom': 'custom-value' },
      fetch,
    });

    await provider
      .videoModel('proteus')
      .doStatus?.({ operation: { requestId: 'req-1' } });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://proxy.example.com/topaz/video/req-1/status',
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
