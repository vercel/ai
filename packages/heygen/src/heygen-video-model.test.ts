import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { HeyGenVideoModel } from './heygen-video-model';

const baseURL = 'https://api.heygen.com';
const createURL = `${baseURL}/v3/models/videos`;
const statusURL = `${createURL}/video-1`;
const operation = {
  videoId: 'video-1',
  mode: 'text_to_video',
  resolution: '768p',
};
const defaultOptions: Parameters<HeyGenVideoModel['doGenerate']>[0] = {
  prompt: 'A paper boat floats down a quiet stream.',
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
const image = {
  type: 'url' as const,
  url: 'https://example.com/image.jpg',
  mediaType: 'image/jpeg',
};
const video = {
  type: 'url' as const,
  url: 'https://example.com/video.mp4',
  mediaType: 'video/mp4',
};
const audio = {
  type: 'url' as const,
  url: 'https://example.com/audio.mp3',
  mediaType: 'audio/mpeg',
};
const completed = {
  status: 'completed',
  video_url: 'https://resource2.heygen.ai/video.mp4',
  duration: 5,
  width: 1344,
  height: 768,
  aspect_ratio: '16:9',
  seed: 0,
};

function createModel() {
  return new HeyGenVideoModel('heygen-video-1', {
    baseURL,
    provider: 'heygen.video',
    headers: () => ({ 'x-api-key': 'test-key' }),
    _internal: { currentDate: () => new Date('2026-10-01T00:00:00Z') },
  });
}

describe('HeyGenVideoModel', () => {
  const server = createTestServer({
    [createURL]: {
      response: {
        type: 'json-value',
        body: { data: { status: 'pending', video_id: 'video-1' } },
      },
    },
    [statusURL]: {
      response: { type: 'json-value', body: { data: completed } },
    },
  });

  it('generates text-to-video with explicit defaults and returns completed metadata', async () => {
    const result = await createModel().doGenerate(defaultOptions);
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'heygen-video-1',
      mode: 'text_to_video',
      prompt: defaultOptions.prompt,
      duration: 5,
      resolution: '768p',
      aspect_ratio: '16:9',
    });
    expect(server.calls[0].requestHeaders['x-api-key']).toBe('test-key');
    expect(result).toMatchObject({
      videos: [
        { type: 'url', url: completed.video_url, mediaType: 'video/mp4' },
      ],
      warnings: [],
      providerMetadata: { heygen: { videos: [operation] } },
      response: {
        modelId: 'heygen-video-1',
        timestamp: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });

  it('forwards supported generation options and idempotency headers', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      duration: 15,
      seed: 0,
      aspectRatio: '9:16',
      headers: { 'Idempotency-Key': 'generation-1' },
      providerOptions: {
        heygen: { resolution: '2k', promptEnhancement: 'disabled' },
      },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      duration: 15,
      seed: 0,
      aspect_ratio: '9:16',
      resolution: '2k',
      prompt_enhancement: 'disabled',
    });
    expect(server.calls[0].requestHeaders['idempotency-key']).toBe(
      'generation-1',
    );
  });

  it('uses an input image as the first frame and omits aspect_ratio', async () => {
    const result = await createModel().doGenerate({
      ...defaultOptions,
      image,
      aspectRatio: '1:1',
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body).toMatchObject({
      mode: 'image_to_video',
      image: { type: 'url', url: image.url },
    });
    expect(body).not.toHaveProperty('aspect_ratio');
    expect(result.warnings).toEqual([
      expect.objectContaining({ feature: 'aspectRatio' }),
    ]);
  });

  it('accepts the first frame also passed as image by AI SDK 6', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      image,
      frameImages: [{ frameType: 'first_frame', image }],
      providerOptions: { heygen: { resolution: '1080p' } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      mode: 'image_to_video',
      resolution: '1080p',
    });
  });

  it('encodes file bytes and preserves existing base64', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      inputReferences: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([1, 2, 3]),
        },
        { type: 'file', mediaType: 'image/jpeg', data: 'BAUG' },
      ],
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      mode: 'reference_to_video',
      aspect_ratio: 'adaptive',
      reference_images: [
        { type: 'base64', media_type: 'image/png', data: 'AQID' },
        { type: 'base64', media_type: 'image/jpeg', data: 'BAUG' },
      ],
    });
  });

  it('groups mixed references by media type and appends provider references in order', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      inputReferences: [video, image, audio],
      providerOptions: {
        heygen: {
          referenceImages: [{ type: 'asset_id', assetId: 'image-2' }],
          referenceVideos: [{ type: 'asset_id', assetId: 'video-2' }],
          referenceAudio: [
            { type: 'base64', mediaType: 'audio/mpeg', data: 'AQID' },
          ],
        },
      },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      reference_images: [
        { type: 'url', url: image.url },
        { type: 'asset_id', asset_id: 'image-2' },
      ],
      reference_videos: [
        { type: 'url', url: video.url },
        { type: 'asset_id', asset_id: 'video-2' },
      ],
      reference_audio: [
        { type: 'url', url: audio.url },
        { type: 'base64', media_type: 'audio/mpeg', data: 'AQID' },
      ],
    });
  });

  it('accepts an existing asset as the first frame', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      providerOptions: {
        heygen: { image: { type: 'asset_id', assetId: 'first-frame' } },
      },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      mode: 'image_to_video',
      image: { type: 'asset_id', asset_id: 'first-frame' },
    });
  });

  it.each([
    ['960x416', '480p', '21:9'],
    ['1344x768', '768p', '16:9'],
    ['768x1344', '768p', '9:16'],
    ['1080x1890', '1080p', '9:16'],
    ['2688x1536', '2k', '16:9'],
  ] as const)(
    'maps the documented frame size %s',
    async (resolution, tier, ratio) => {
      await createModel().doGenerate({ ...defaultOptions, resolution });
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        resolution: tier,
        aspect_ratio: ratio,
      });
    },
  );

  it('gives the provider resolution precedence over the standard resolution', async () => {
    await createModel().doGenerate({
      ...defaultOptions,
      resolution: '1920x1080',
      providerOptions: { heygen: { resolution: '480p' } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      resolution: '480p',
    });
  });

  it('warns for unsupported sample count, fps, and disabling audio', async () => {
    const result = await createModel().doGenerate({
      ...defaultOptions,
      n: 2,
      fps: 30,
      generateAudio: false,
    });
    expect(
      result.warnings.map(warning =>
        warning.type === 'unsupported' ? warning.feature : undefined,
      ),
    ).toEqual(['n', 'fps', 'generateAudio']);
    const body = await server.calls[0].requestBodyJson;
    expect(body).not.toHaveProperty('fps');
    expect(body).not.toHaveProperty('generate_audio');
    expect(body).not.toHaveProperty('n');
  });

  it.each([
    ['missing prompt', { prompt: undefined }],
    ['empty prompt', { prompt: '' }],
    ['long prompt', { prompt: 'x'.repeat(32001) }],
    ['short duration', { duration: 4 }],
    ['long duration', { duration: 16 }],
    ['fractional duration', { duration: 5.5 }],
    ['negative seed', { seed: -1 }],
    ['large seed', { seed: 4294967296 }],
    ['fractional seed', { seed: 0.5 }],
    ['unknown resolution', { resolution: '1920x1080' }],
    ['text adaptive ratio', { aspectRatio: 'adaptive' }],
    ['unsupported ratio', { aspectRatio: '2:1' }],
    [
      'high resolution square',
      { aspectRatio: '1:1', providerOptions: { heygen: { resolution: '2k' } } },
    ],
    [
      'high resolution adaptive references',
      {
        inputReferences: [image],
        providerOptions: { heygen: { resolution: '1080p' } },
      },
    ],
    ['audio-only references', { inputReferences: [audio] }],
    [
      'untyped reference',
      { inputReferences: [{ type: 'url', url: image.url }] },
    ],
    [
      'insecure URL',
      { image: { type: 'url', url: 'http://example.com/image.png' } },
    ],
    ['video as image', { image: video }],
    ['last frame', { frameImages: [{ frameType: 'last_frame', image }] }],
    [
      'multiple first frames',
      {
        frameImages: [
          { frameType: 'first_frame', image },
          { frameType: 'first_frame', image },
        ],
      },
    ],
    ['image and references', { image, inputReferences: [video] }],
    [
      'two image sources',
      {
        image,
        providerOptions: {
          heygen: { image: { type: 'asset_id', assetId: 'another' } },
        },
      },
    ],
    [
      'image mode without image',
      { providerOptions: { heygen: { mode: 'image_to_video' } } },
    ],
    [
      'reference mode without references',
      { providerOptions: { heygen: { mode: 'reference_to_video' } } },
    ],
    [
      'text mode with image',
      { image, providerOptions: { heygen: { mode: 'text_to_video' } } },
    ],
    [
      'text mode with references',
      {
        inputReferences: [image],
        providerOptions: { heygen: { mode: 'text_to_video' } },
      },
    ],
    [
      'too many images',
      { inputReferences: Array.from({ length: 10 }, () => image) },
    ],
    [
      'too many videos',
      { inputReferences: Array.from({ length: 4 }, () => video) },
    ],
    [
      'too many audio references',
      { inputReferences: [image, ...Array.from({ length: 4 }, () => audio)] },
    ],
    [
      'too many combined references',
      {
        inputReferences: [
          ...Array.from({ length: 9 }, () => image),
          ...Array.from({ length: 3 }, () => video),
          audio,
        ],
      },
    ],
    [
      'combined image limit',
      {
        inputReferences: Array.from({ length: 9 }, () => image),
        providerOptions: {
          heygen: { referenceImages: [{ type: 'asset_id', assetId: 'extra' }] },
        },
      },
    ],
    [
      'wrong reference media type',
      {
        providerOptions: {
          heygen: {
            referenceImages: [
              { type: 'base64', mediaType: 'audio/mpeg', data: 'AQID' },
            ],
          },
        },
      },
    ],
  ])('rejects %s before submitting', async (_name, overrides) => {
    await expect(
      createModel().doGenerate({
        ...defaultOptions,
        ...overrides,
      } as Parameters<HeyGenVideoModel['doGenerate']>[0]),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it('validates provider options', async () => {
    await expect(
      createModel().doGenerate({
        ...defaultOptions,
        providerOptions: { heygen: { promptEnhancement: 'unknown' } },
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it.each(['pending', 'processing'])(
    'polls through %s until completion',
    async status => {
      let polls = 0;
      const model = new HeyGenVideoModel('heygen-video-1', {
        baseURL,
        provider: 'heygen.video',
        fetch: async (input, init) => {
          if (String(input) === statusURL) {
            server.urls[statusURL].response = {
              type: 'json-value',
              body: { data: ++polls === 1 ? { status } : completed },
            };
          }
          return globalThis.fetch(input, init);
        },
      });
      const result = await model.doGenerate({
        ...defaultOptions,
        fps: 30,
        providerOptions: { heygen: { pollIntervalMillis: 1 } },
      });
      expect(polls).toBe(2);
      expect(server.calls).toHaveLength(3);
      expect(result.videos).toEqual([
        { type: 'url', url: completed.video_url, mediaType: 'video/mp4' },
      ]);
      expect(result.warnings).toEqual([
        expect.objectContaining({ feature: 'fps' }),
      ]);
      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'pollIntervalMillis',
      );
    },
  );

  it('preserves provider-reported duration, dimensions, zero values, and inference timing', async () => {
    server.urls[statusURL].response = {
      type: 'json-value',
      body: {
        data: { ...completed, duration: 5.042, timings: { inference: 0 } },
      },
    };
    const result = await createModel().doGenerate({
      ...defaultOptions,
      duration: 10,
    });
    expect(result.providerMetadata?.heygen).toEqual({
      videos: [
        {
          ...operation,
          duration: 5.042,
          width: 1344,
          height: 768,
          aspectRatio: '16:9',
          seed: 0,
          timings: { inference: 0 },
        },
      ],
    });
    expect(server.calls).toHaveLength(2);
    expect(result.response.timestamp).toEqual(new Date('2026-10-01T00:00:00Z'));
  });

  it('preserves the submitted reference mode and named resolution tier', async () => {
    const result = await createModel().doGenerate({
      ...defaultOptions,
      inputReferences: [video],
      aspectRatio: '16:9',
      providerOptions: { heygen: { resolution: '2k' } },
    });
    expect(result.providerMetadata?.heygen).toMatchObject({
      videos: [
        {
          mode: 'reference_to_video',
          resolution: '2k',
          width: 1344,
          height: 768,
        },
      ],
    });
  });

  it('accepts absent or null optional result metadata', async () => {
    server.urls[statusURL].response = {
      type: 'json-value',
      body: {
        data: {
          status: 'completed',
          video_url: completed.video_url,
          duration: null,
          width: null,
        },
      },
    };
    expect(await createModel().doGenerate(defaultOptions)).toMatchObject({
      providerMetadata: { heygen: { videos: [operation] } },
    });
  });

  it.each(['failed', 'cancelled'])(
    'throws for %s with provider details',
    async status => {
      server.urls[statusURL].response = {
        type: 'json-value',
        body: {
          data: {
            status,
            failure_code: 'generation_failed',
            failure_message: 'Generation did not finish.',
          },
        },
      };
      await expect(
        createModel().doGenerate(defaultOptions),
      ).rejects.toMatchObject({
        name: 'HEYGEN_VIDEO_GENERATION_FAILED',
        message: 'Generation did not finish. (generation_failed)',
      });
    },
  );

  it.each([
    { status: 'completed' },
    { status: 'completed', video_url: '' },
    { status: 'unexpected' },
  ])('rejects an unusable status response: %j', async data => {
    server.urls[statusURL].response = { type: 'json-value', body: { data } };
    await expect(
      createModel().doGenerate(defaultOptions),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  });

  it('stops polling at the configured timeout without resubmitting', async () => {
    server.urls[statusURL].response = {
      type: 'json-value',
      body: { data: { status: 'processing' } },
    };
    await expect(
      createModel().doGenerate({
        ...defaultOptions,
        providerOptions: {
          heygen: { pollIntervalMillis: 10, pollTimeoutMillis: 1 },
        },
      }),
    ).rejects.toMatchObject({ name: 'HEYGEN_VIDEO_GENERATION_TIMEOUT' });
    expect(server.calls).toHaveLength(2);
    expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
      'pollTimeoutMillis',
    );
  });

  it('aborts during polling without starting another generation', async () => {
    const controller = new AbortController();
    const model = new HeyGenVideoModel('heygen-video-1', {
      baseURL,
      provider: 'heygen.video',
      fetch: async (input, init) => {
        if (String(input) === statusURL) {
          controller.abort();
        }
        return globalThis.fetch(input, init);
      },
    });
    await expect(
      model.doGenerate({ ...defaultOptions, abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(
      server.calls.filter(call => call.requestMethod === 'POST'),
    ).toHaveLength(1);
  });

  it.each(['start', 'status'])('preserves API errors on %s', async method => {
    server.urls[method === 'start' ? createURL : statusURL].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          code: 'invalid_parameter',
          message: 'Invalid duration',
          param: 'duration',
        },
      }),
    };
    await expect(
      createModel().doGenerate(defaultOptions),
    ).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 400,
      message: 'Invalid duration (invalid_parameter) [duration]',
    });
  });

  it('rejects malformed create responses', async () => {
    server.urls[createURL].response = {
      type: 'json-value',
      body: { data: { status: 'pending' } },
    };
    await expect(
      createModel().doGenerate(defaultOptions),
    ).rejects.toBeInstanceOf(APICallError);
  });

  it('passes abort signals through the configured fetch', async () => {
    const controller = new AbortController();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const model = new HeyGenVideoModel('heygen-video-1', {
      baseURL,
      provider: 'heygen.video',
      fetch,
    });
    await expect(
      model.doGenerate({ ...defaultOptions, abortSignal: controller.signal }),
    ).rejects.toThrow('Aborted');
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
