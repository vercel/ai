import { NoSuchModelError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHeyGen } from './heygen-provider';
import { VERSION } from './version';

const defaultOptions = {
  prompt: 'A paper boat',
  n: 1,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  image: undefined,
  frameImages: undefined,
  inputReferences: undefined,
  generateAudio: undefined,
  providerOptions: {},
};

describe('createHeyGen', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('creates video models through both aliases', () => {
    const provider = createHeyGen();
    expect(provider.specificationVersion).toBe('v3');
    for (const model of [
      provider.video('heygen-video-1'),
      provider.videoModel('heygen-video-1'),
    ]) {
      expect(model).toMatchObject({
        specificationVersion: 'v3',
        provider: 'heygen.video',
        modelId: 'heygen-video-1',
        maxVideosPerCall: 1,
      });
    }
  });

  it('rejects unsupported model types', () => {
    const provider = createHeyGen();
    expect(() => provider.languageModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.embeddingModel('other')).toThrow(NoSuchModelError);
    expect(() => provider.imageModel('other')).toThrow(NoSuchModelError);
  });

  it.each([true, false])(
    'supports explicit/environment keys, custom endpoints, headers and fetch (explicit=%s)',
    async explicit => {
      vi.stubEnv('HEYGEN_API_KEY', 'env-key');
      const requests: Array<{ url: string; headers: Headers }> = [];
      const fetch: FetchFunction = async (input, init) => {
        requests.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        return new Response(
          JSON.stringify({
            data:
              init?.method === 'POST'
                ? { video_id: 'video-1' }
                : {
                    status: 'completed',
                    video_url: 'https://example.com/output.mp4',
                  },
          }),
          {
            headers: { 'content-type': 'application/json' },
          },
        );
      };
      const provider = createHeyGen({
        apiKey: explicit ? 'explicit-key' : undefined,
        baseURL: 'https://proxy.example.com/heygen/',
        headers: { 'X-Custom': 'custom' },
        fetch,
      });
      await provider
        .video('heygen-video-1')
        .doGenerate({ ...defaultOptions, headers: { 'X-Request': 'request' } });
      expect(requests).toHaveLength(2);
      expect(requests[1].url).toBe(
        'https://proxy.example.com/heygen/v3/models/videos/video-1',
      );
      expect(requests[0].headers.get('x-api-key')).toBe(
        explicit ? 'explicit-key' : 'env-key',
      );
      expect(requests[0].headers.get('x-custom')).toBe('custom');
      expect(requests[0].headers.get('x-request')).toBe('request');
      expect(requests[0].headers.get('user-agent')).toContain(
        `ai-sdk-heygen/${VERSION}`,
      );
    },
  );

  it('loads the API key lazily and reports a missing key', async () => {
    vi.stubEnv('HEYGEN_API_KEY', undefined);
    const provider = createHeyGen();
    await expect(
      provider.video('heygen-video-1').doGenerate(defaultOptions),
    ).rejects.toThrow('HEYGEN_API_KEY');
  });
});
