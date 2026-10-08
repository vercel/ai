import { NoSuchModelError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHeyGen } from './heygen-provider';
import { VERSION } from './version';

const operation = {
  videoId: 'video-1',
  mode: 'text_to_video',
  resolution: '768p',
};

describe('createHeyGen', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('creates video models through both aliases', () => {
    const provider = createHeyGen();
    expect(provider.specificationVersion).toBe('v4');
    for (const model of [
      provider.video('heygen-video-1'),
      provider.videoModel('heygen-video-1'),
    ]) {
      expect(model).toMatchObject({
        specificationVersion: 'v4',
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
        return new Response(JSON.stringify({ data: { status: 'pending' } }), {
          headers: { 'content-type': 'application/json' },
        });
      };
      const provider = createHeyGen({
        apiKey: explicit ? 'explicit-key' : undefined,
        baseURL: 'https://proxy.example.com/heygen/',
        headers: { 'X-Custom': 'custom' },
        fetch,
      });
      await provider
        .video('heygen-video-1')
        .doStatus?.({ operation, headers: { 'X-Request': 'request' } });
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(
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

  it('loads credentials lazily and reports a missing key', async () => {
    vi.stubEnv('HEYGEN_API_KEY', undefined);
    const provider = createHeyGen();
    await expect(
      provider.video('heygen-video-1').doStatus?.({ operation }),
    ).rejects.toThrow('HEYGEN_API_KEY');
  });
});
