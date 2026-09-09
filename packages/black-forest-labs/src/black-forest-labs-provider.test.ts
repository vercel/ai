import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createBlackForestLabs } from './black-forest-labs-provider';

const server = createTestServer({
  'https://api.example.com/v1/flux-pro-1.1': {
    response: {
      type: 'json-value',
      body: {
        id: 'req-123',
        polling_url: 'https://api.example.com/poll',
      },
    },
  },
  'https://api.example.com/poll': {
    response: {
      type: 'json-value',
      body: {
        status: 'Ready',
        result: {
          sample: 'https://api.example.com/image.png',
        },
      },
    },
  },
  'https://api.example.com/image.png': {
    response: {
      type: 'binary',
      body: Buffer.from([1, 2, 3]),
    },
  },
  'https://api.example.com/v1/flux-3-video': {
    response: {
      type: 'json-value',
      body: {
        id: 'req-123',
        polling_url: 'https://api.example.com/video-poll',
      },
    },
  },
  'https://api.example.com/video-poll': {
    response: {
      type: 'json-value',
      body: {
        status: 'Ready',
        result: {
          sample: 'https://api.example.com/video.mp4',
        },
      },
    },
  },
});

const videoCallOptions = {
  prompt: 'A white kitten chases a butterfly across a sunlit garden.',
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
} as const;

describe('BlackForestLabs provider', () => {
  it('creates image models via .image and .imageModel', () => {
    const provider = createBlackForestLabs();

    const imageModel = provider.image('flux-pro-1.1');
    const imageModel2 = provider.imageModel('flux-pro-1.1-ultra');

    expect(imageModel.provider).toBe('black-forest-labs.image');
    expect(imageModel.modelId).toBe('flux-pro-1.1');
    expect(imageModel2.modelId).toBe('flux-pro-1.1-ultra');
    expect(imageModel.specificationVersion).toBe('v4');
  });

  it('configures baseURL and headers correctly', async () => {
    const provider = createBlackForestLabs({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1',
      headers: {
        'x-extra-header': 'extra',
      },
    });

    const model = provider.image('flux-pro-1.1');

    await model.doGenerate({
      prompt: 'A serene mountain landscape at sunset',
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      seed: undefined,
      aspectRatio: '1:1',
      providerOptions: {},
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://api.example.com/v1/flux-pro-1.1',
    );
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestHeaders['x-key']).toBe('test-api-key');
    expect(server.calls[0].requestHeaders['x-extra-header']).toBe('extra');
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      prompt: 'A serene mountain landscape at sunset',
      aspect_ratio: '1:1',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/black-forest-labs/',
    );
    expect(server.calls[1].requestUserAgent).toContain(
      'ai-sdk/black-forest-labs/',
    );
    expect(server.calls[2].requestUserAgent).toContain(
      'ai-sdk/black-forest-labs/',
    );
  });

  it('uses provider polling options for timeout behavior', async () => {
    server.urls['https://api.example.com/poll'].response = ({
      callNumber,
    }) => ({
      type: 'json-value',
      body: { status: 'Pending', callNumber },
    });

    const provider = createBlackForestLabs({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1',
      pollIntervalMillis: 10,
      pollTimeoutMillis: 25,
    });

    const model = provider.image('flux-pro-1.1');

    await expect(
      model.doGenerate({
        prompt: 'Timeout test',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        seed: undefined,
        aspectRatio: '1:1',
        providerOptions: {},
      }),
    ).rejects.toThrow('Black Forest Labs generation timed out.');

    const pollCalls = server.calls.filter(
      c =>
        c.requestMethod === 'GET' &&
        c.requestUrl.startsWith('https://api.example.com/poll'),
    );
    expect(pollCalls.length).toBe(3);
  });

  it('creates video models via .video and .videoModel', () => {
    const provider = createBlackForestLabs();

    const videoModel = provider.video('flux-3-video');
    const videoModel2 = provider.videoModel('flux-3-video');

    expect(videoModel.provider).toBe('black-forest-labs.video');
    expect(videoModel.modelId).toBe('flux-3-video');
    expect(videoModel.specificationVersion).toBe('v4');
    expect(videoModel.maxVideosPerCall).toBe(1);
    expect(videoModel.doStart).toBeTypeOf('function');
    expect(videoModel.doStatus).toBeTypeOf('function');
    expect(videoModel2.provider).toBe('black-forest-labs.video');
  });

  it('configures baseURL and headers correctly for video models', async () => {
    const provider = createBlackForestLabs({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1',
      headers: {
        'x-extra-header': 'extra',
      },
      pollIntervalMillis: 1,
    });

    const model = provider.video('flux-3-video');

    const result = await model.doGenerate?.(videoCallOptions);

    expect(server.calls[0].requestUrl).toBe(
      'https://api.example.com/v1/flux-3-video',
    );
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestHeaders['x-key']).toBe('test-api-key');
    expect(server.calls[0].requestHeaders['x-extra-header']).toBe('extra');
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      mode: 't2v',
      prompt: videoCallOptions.prompt,
    });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/black-forest-labs/',
    );

    // The signed video URL is returned rather than downloaded, so submit and
    // poll are the only two calls.
    expect(server.calls).toHaveLength(2);
    expect(result?.videos).toStrictEqual([
      {
        type: 'url',
        url: 'https://api.example.com/video.mp4',
        mediaType: 'video/mp4',
      },
    ]);
  });

  it('uses provider polling options for video timeout behavior', async () => {
    server.urls['https://api.example.com/video-poll'].response = ({
      callNumber,
    }) => ({
      type: 'json-value',
      body: { status: 'Generating', callNumber },
    });

    const provider = createBlackForestLabs({
      apiKey: 'test-api-key',
      baseURL: 'https://api.example.com/v1',
      pollIntervalMillis: 10,
      pollTimeoutMillis: 25,
    });

    const model = provider.video('flux-3-video');

    // The reported timeout is what proves the provider-level setting reached
    // the model. The number of polls is deliberately not asserted: the video
    // model bounds polling by a wall-clock deadline rather than a fixed attempt
    // count, so how many requests fit inside 25ms depends on the machine.
    await expect(model.doGenerate?.(videoCallOptions)).rejects.toThrow(
      'Black Forest Labs video generation timed out after 25ms. Request id: req-123',
    );
  });

  it('throws NoSuchModelError for unsupported model types', () => {
    const provider = createBlackForestLabs();

    expect(() => provider.languageModel('some-id')).toThrowError(
      'No such languageModel',
    );
    expect(() => provider.embeddingModel('some-id')).toThrowError(
      'No such embeddingModel',
    );
  });
});
