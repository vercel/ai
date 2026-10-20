import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
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
const defaultOptions: Parameters<HeyGenVideoModel['doStart']>[0] = {
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

  it('submits text-to-video with explicit defaults and returns an operation', async () => {
    const result = await createModel().doStart(defaultOptions);
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
      operation,
      warnings: [],
      providerMetadata: { heygen: operation },
      response: {
        modelId: 'heygen-video-1',
        timestamp: new Date('2026-10-01T00:00:00Z'),
      },
    });
  });

  it('forwards supported generation options and idempotency headers', async () => {
    await createModel().doStart({
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
    const result = await createModel().doStart({
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

  it('accepts a first-frame image at a high resolution without an explicit aspect ratio', async () => {
    await createModel().doStart({
      ...defaultOptions,
      frameImages: [{ frameType: 'first_frame', image }],
      providerOptions: { heygen: { resolution: '1080p' } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      mode: 'image_to_video',
      resolution: '1080p',
    });
  });

  it('encodes file bytes and preserves existing base64', async () => {
    await createModel().doStart({
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
    await createModel().doStart({
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
    await createModel().doStart({
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
      await createModel().doStart({ ...defaultOptions, resolution });
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        resolution: tier,
        aspect_ratio: ratio,
      });
    },
  );

  it('gives the provider resolution precedence over the standard resolution', async () => {
    await createModel().doStart({
      ...defaultOptions,
      resolution: '1920x1080',
      providerOptions: { heygen: { resolution: '480p' } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      resolution: '480p',
    });
  });

  it('warns for unsupported sample count, fps, and disabling audio', async () => {
    const result = await createModel().doStart({
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
    [
      'two first-frame sources',
      { image, frameImages: [{ frameType: 'first_frame', image }] },
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
      createModel().doStart({ ...defaultOptions, ...overrides } as Parameters<
        HeyGenVideoModel['doStart']
      >[0]),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it('validates provider options', async () => {
    await expect(
      createModel().doStart({
        ...defaultOptions,
        providerOptions: { heygen: { promptEnhancement: 'unknown' } },
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it.each(['pending', 'processing'])('maps %s to pending', async status => {
    server.urls[statusURL].response = {
      type: 'json-value',
      body: { data: { status } },
    };
    expect(await createModel().doStatus({ operation })).toMatchObject({
      status: 'pending',
    });
  });

  it('returns the signed video URL and reported metadata without downloading', async () => {
    const result = await createModel().doStatus({ operation });
    expect(result).toMatchObject({
      status: 'completed',
      videos: [
        { type: 'url', url: completed.video_url, mediaType: 'video/mp4' },
      ],
      providerMetadata: {
        heygen: {
          videos: [
            {
              ...operation,
              duration: 5,
              width: 1344,
              height: 768,
              aspectRatio: '16:9',
              seed: 0,
            },
          ],
        },
      },
    });
    expect(server.calls).toHaveLength(1);
  });

  it('returns reported output duration and timing without substituting request settings', async () => {
    const started = await createModel().doStart({
      ...defaultOptions,
      duration: 5,
    });
    server.urls[statusURL].response = {
      type: 'json-value',
      body: {
        data: { ...completed, duration: 5.042, timings: { inference: 3.7 } },
      },
    };
    const result = await createModel().doStatus({
      operation: started.operation,
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
          timings: { inference: 3.7 },
        },
      ],
    });
    expect(result.providerMetadata?.heygen).not.toHaveProperty('credits');
    expect(result.providerMetadata?.heygen).not.toHaveProperty('tokens');
  });

  it('preserves reported zero timing values and failure metadata', async () => {
    server.urls[statusURL].response = {
      type: 'json-value',
      body: {
        data: {
          status: 'failed',
          failure_code: 'generation_failed',
          timings: { inference: 0 },
        },
      },
    };
    expect(await createModel().doStatus({ operation })).toMatchObject({
      status: 'error',
      providerMetadata: {
        heygen: { timings: { inference: 0 }, failureCode: 'generation_failed' },
      },
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
    expect(await createModel().doStatus({ operation })).toMatchObject({
      status: 'completed',
      providerMetadata: { heygen: { videos: [operation] } },
    });
  });

  it.each(['failed', 'cancelled'])(
    'maps %s to an error with provider details',
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
      expect(await createModel().doStatus({ operation })).toMatchObject({
        status: 'error',
        error: 'Generation did not finish. (generation_failed)',
        providerMetadata: { heygen: { failureCode: 'generation_failed' } },
      });
    },
  );

  it.each([
    { status: 'completed' },
    { status: 'completed', video_url: '' },
    { status: 'unexpected' },
  ])('rejects an unusable status response: %j', async data => {
    server.urls[statusURL].response = { type: 'json-value', body: { data } };
    await expect(createModel().doStatus({ operation })).rejects.toBeInstanceOf(
      InvalidResponseDataError,
    );
  });

  it.each([null, {}, { ...operation, videoId: '' }])(
    'validates operation references: %j',
    async invalidOperation => {
      await expect(
        createModel().doStatus({ operation: invalidOperation }),
      ).rejects.toThrow();
      expect(server.calls).toHaveLength(0);
    },
  );

  it('preserves the operation across workflow serialization', async () => {
    const model = createModel();
    const started = await model.doStart({
      ...defaultOptions,
      providerOptions: { heygen: { resolution: '2k' } },
    });
    const serialized = HeyGenVideoModel[WORKFLOW_SERIALIZE](model);
    expect(serialized.config).not.toHaveProperty('_internal');
    const restored = HeyGenVideoModel[WORKFLOW_DESERIALIZE]({
      modelId: serialized.modelId,
      config: {
        baseURL,
        provider: 'heygen.video',
        headers: { 'x-api-key': 'test-key' },
      },
    });
    const result = await restored.doStatus({
      operation: JSON.parse(JSON.stringify(started.operation)),
    });
    expect(result).toMatchObject({
      status: 'completed',
      providerMetadata: { heygen: { videos: [{ resolution: '2k' }] } },
    });
  });

  it('refreshes the result URL on repeated status calls', async () => {
    await createModel().doStatus({ operation });
    const refreshed = 'https://resource2.heygen.ai/video.mp4?signature=new';
    server.urls[statusURL].response = {
      type: 'json-value',
      body: { data: { ...completed, video_url: refreshed } },
    };
    expect(await createModel().doStatus({ operation })).toMatchObject({
      videos: [{ url: refreshed }],
    });
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
    const result =
      method === 'start'
        ? createModel().doStart(defaultOptions)
        : createModel().doStatus({ operation });
    await expect(result).rejects.toMatchObject({
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
    await expect(createModel().doStart(defaultOptions)).rejects.toBeInstanceOf(
      APICallError,
    );
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
      model.doStart({ ...defaultOptions, abortSignal: controller.signal }),
    ).rejects.toThrow('Aborted');
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
