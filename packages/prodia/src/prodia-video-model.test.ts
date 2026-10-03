import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { ProdiaVideoModel } from './prodia-video-model';

const prompt = 'A cat walking on a beach';

function createBasicModel({
  headers,
  fetch,
  currentDate,
  modelId = 'inference.wan2-2.lightning.txt2vid.v0',
}: {
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  modelId?: string;
} = {}) {
  return new ProdiaVideoModel(modelId, {
    provider: 'prodia.video',
    baseURL: 'https://api.example.com/v2',
    headers: headers ?? (() => ({ Authorization: 'Bearer test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

function createVideoMultipartResponse(
  jobResult: Record<string, unknown>,
  videoContent: string = 'test-video-content',
  videoContentType: string = 'video/mp4',
  videoFilename: string = 'output.mp4',
): { body: Buffer; contentType: string } {
  const boundary = 'test-boundary-12345';
  const jobJson = JSON.stringify(jobResult);
  const videoBuffer = Buffer.from(videoContent);

  const parts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="job"; filename="job.json"\r\n',
    'Content-Type: application/json\r\n',
    '\r\n',
    jobJson,
    '\r\n',
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="output"; filename="${videoFilename}"\r\n`,
    `Content-Type: ${videoContentType}\r\n`,
    '\r\n',
  ];

  const headerPart = Buffer.from(parts.join(''));
  const endPart = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat([headerPart, videoBuffer, endPart]);

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const defaultJobResult = {
  id: 'job-vid-123',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:10Z',
  state: { current: 'completed' },
  config: { prompt, seed: 99 },
  metrics: { elapsed: 5.0, ips: 3.2 },
  price: { product: 'wan2-2.lightning', dollars: 0.05 },
};

describe('ProdiaVideoModel', () => {
  const multipartResponse = createVideoMultipartResponse(defaultJobResult);

  const server = createTestServer({
    'https://api.example.com/v2/job?price=true': {
      response: {
        type: 'binary',
        body: multipartResponse.body,
        headers: {
          'content-type': multipartResponse.contentType,
        },
      },
    },
    'https://cdn.example.com/input.png': {
      response: {
        type: 'binary',
        body: Buffer.from('input-image-bytes'),
        headers: { 'content-type': 'image/png' },
      },
    },
  });

  describe('constructor', () => {
    it('exposes correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('prodia.video');
      expect(model.modelId).toBe('inference.wan2-2.lightning.txt2vid.v0');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxVideosPerCall).toBe(1);
    });
  });

  describe('doGenerate - txt2vid', () => {
    it('sends correct JSON request body with prompt', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        type: 'inference.wan2-2.lightning.txt2vid.v0',
        config: {
          prompt,
        },
      });
    });

    it('includes seed when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: 42,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        type: 'inference.wan2-2.lightning.txt2vid.v0',
        config: {
          prompt,
          seed: 42,
        },
      });
    });

    it('includes resolution from provider options', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {
          prodia: {
            resolution: '720p',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        type: 'inference.wan2-2.lightning.txt2vid.v0',
        config: {
          prompt,
          resolution: '720p',
        },
      });
    });

    it('calls the correct endpoint', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.example.com/v2/job?price=true',
      );
    });

    it('sends correct Accept header', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestHeaders.accept).toBe(
        'multipart/form-data; video/mp4',
      );
    });

    it('sends Content-Type: application/json for txt2vid', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestHeaders['content-type']).toBe(
        'application/json',
      );
    });

    it('merges provider and request headers', async () => {
      const model = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-value',
          Authorization: 'Bearer test-key',
        }),
      });

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'custom-provider-header': 'provider-value',
        'custom-request-header': 'request-value',
        authorization: 'Bearer test-key',
      });
    });

    it('returns video data from multipart response', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(result.videos).toHaveLength(1);
      const video = result.videos[0];
      expect(video.type).toBe('binary');
      expect(video.mediaType).toBe('video/mp4');
      expect(
        video.type === 'binary' && Buffer.from(video.data).toString(),
      ).toBe('test-video-content');
    });

    it('returns provider metadata', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(result.providerMetadata?.prodia).toStrictEqual({
        videos: [
          {
            jobId: 'job-vid-123',
            seed: 99,
            elapsed: 5.0,
            iterationsPerSecond: 3.2,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:10Z',
            dollars: 0.05,
          },
        ],
      });
    });

    it('includes timestamp and modelId in response', async () => {
      const testDate = new Date('2025-06-01T00:00:00Z');
      const model = createBasicModel({ currentDate: () => testDate });

      const result = await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'inference.wan2-2.lightning.txt2vid.v0',
        headers: expect.any(Object),
      });
    });

    it('handles API errors', async () => {
      server.urls['https://api.example.com/v2/job?price=true'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          message: 'Invalid prompt',
          detail: 'Prompt cannot be empty',
        }),
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          aspectRatio: undefined,
          resolution: undefined,
          duration: undefined,
          fps: undefined,
          seed: undefined,
          generateAudio: undefined,
          image: undefined,
          frameImages: undefined,
          inputReferences: undefined,
          providerOptions: {},
        }),
      ).rejects.toMatchObject({
        message: 'Prompt cannot be empty',
        statusCode: 400,
        url: 'https://api.example.com/v2/job?price=true',
      });
    });
  });

  describe('doGenerate - img2vid', () => {
    it('sends multipart form-data when image is provided', async () => {
      const model = createBasicModel({
        modelId: 'inference.wan2-2.lightning.img2vid.v0',
      });

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([1, 2, 3, 4]),
        },
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestHeaders['content-type']).toContain(
        'multipart/form-data',
      );
    });

    it('downloads a public image URL and sends it as multipart form-data', async () => {
      const model = createBasicModel({
        modelId: 'inference.wan2-2.lightning.img2vid.v0',
      });

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        generateAudio: undefined,
        image: {
          type: 'url',
          url: 'https://cdn.example.com/input.png',
        },
        frameImages: undefined,
        inputReferences: undefined,
        providerOptions: {},
      });

      // The image is downloaded, then the job is POSTed as multipart form-data.
      expect(
        server.calls.some(
          call => call.requestUrl === 'https://cdn.example.com/input.png',
        ),
      ).toBe(true);
      const jobCall = server.calls.find(
        call => call.requestUrl === 'https://api.example.com/v2/job?price=true',
      );
      expect(jobCall?.requestMethod).toBe('POST');
      expect(jobCall?.requestHeaders['content-type']).toContain(
        'multipart/form-data',
      );
    });

    it('blocks an image URL pointing at a private address (SSRF guard)', async () => {
      const model = createBasicModel({
        modelId: 'inference.wan2-2.lightning.img2vid.v0',
      });

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          aspectRatio: undefined,
          resolution: undefined,
          duration: undefined,
          fps: undefined,
          seed: undefined,
          generateAudio: undefined,
          image: {
            type: 'url',
            url: 'http://169.254.169.254/latest/meta-data/',
          },
          frameImages: undefined,
          inputReferences: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow();

      // The internal URL must never be requested, and no job is submitted.
      expect(
        server.calls.some(call => call.requestUrl.includes('169.254.169.254')),
      ).toBe(false);
      expect(
        server.calls.some(call => call.requestUrl.includes('/v2/job')),
      ).toBe(false);
    });
  });
});

describe('ProdiaVideoModel - H3 fast', () => {
  const downloadServer = createTestServer({
    'https://cdn.example.com/reference': {
      response: {
        type: 'binary',
        body: Buffer.from([7, 8, 9]),
        headers: { 'content-type': 'application/octet-stream' },
      },
    },
  });

  const image = {
    type: 'file' as const,
    mediaType: 'image/png',
    data: new Uint8Array([1, 2, 3]),
  };
  const defaults: Parameters<ProdiaVideoModel['doGenerate']>[0] = {
    prompt,
    n: 1,
    aspectRatio: undefined,
    resolution: undefined,
    duration: undefined,
    fps: undefined,
    seed: undefined,
    generateAudio: undefined,
    image: undefined,
    frameImages: undefined,
    inputReferences: undefined,
    providerOptions: {},
  };

  function setup(mode: 'txt2vid' | 'img2vid' | 'ref2vid') {
    let requestBody: BodyInit | undefined | null;
    const model = createBasicModel({
      modelId: `inference.minimax.h3.fast.${mode}.v1`,
      fetch: async (_url, init) => {
        requestBody = init?.body;
        const response = createVideoMultipartResponse(defaultJobResult);
        return new Response(response.body, {
          headers: { 'content-type': response.contentType },
        });
      },
    });
    return { model, body: () => requestBody };
  }

  it('sends text-to-video controls, including a zero seed, and returns the MP4', async () => {
    const { model, body } = setup('txt2vid');
    const result = await model.doGenerate({
      ...defaults,
      duration: 4,
      aspectRatio: '9:16',
      seed: 0,
      providerOptions: { prodia: { resolution: '768P' } },
    });
    expect(JSON.parse(body() as string)).toStrictEqual({
      type: 'inference.minimax.h3.fast.txt2vid.v1',
      config: {
        prompt,
        duration: 4,
        aspect_ratio: '9:16',
        seed: 0,
        resolution: '768P',
      },
    });
    expect(result.videos[0]).toMatchObject({
      type: 'binary',
      mediaType: 'video/mp4',
    });
    expect(result.warnings).toEqual([]);
  });

  it('uploads named first and last frames in role order', async () => {
    const { model, body } = setup('img2vid');
    await model.doGenerate({
      ...defaults,
      duration: 8,
      frameImages: [
        {
          frameType: 'last_frame',
          image: { ...image, mediaType: 'image/jpeg', data: 'BAUG' },
        },
        { frameType: 'first_frame', image },
      ],
    });
    const form = body() as FormData;
    expect(JSON.parse(await (form.get('job') as Blob).text())).toStrictEqual({
      type: 'inference.minimax.h3.fast.img2vid.v1',
      config: {
        prompt,
        duration: 8,
        first_frame: 'first_frame.png',
        last_frame: 'last_frame.jpg',
      },
    });
    const files = form.getAll('input') as File[];
    expect(files.map(file => [file.name, file.type])).toEqual([
      ['first_frame.png', 'image/png'],
      ['last_frame.jpg', 'image/jpeg'],
    ]);
    expect(new Uint8Array(await files[1].arrayBuffer())).toEqual(
      new Uint8Array([4, 5, 6]),
    );
  });

  it('uses the prompt image as the first frame', async () => {
    const { model, body } = setup('img2vid');
    await model.doGenerate({ ...defaults, image });
    expect(
      JSON.parse(await ((body() as FormData).get('job') as Blob).text()).config
        .first_frame,
    ).toBe('first_frame.png');
  });

  it('uploads image, video, and audio references in their original order', async () => {
    const { model, body } = setup('ref2vid');
    await model.doGenerate({
      ...defaults,
      aspectRatio: '4:3',
      inputReferences: [
        image,
        { ...image, mediaType: 'video/mp4' },
        { ...image, mediaType: 'audio/wav' },
      ],
    });
    const form = body() as FormData;
    expect(JSON.parse(await (form.get('job') as Blob).text())).toStrictEqual({
      type: 'inference.minimax.h3.fast.ref2vid.v1',
      config: {
        prompt,
        aspect_ratio: '4:3',
        references: ['reference_0.png', 'reference_1.mp4', 'reference_2.wav'],
      },
    });
    expect((form.getAll('input') as File[]).map(file => file.type)).toEqual([
      'image/png',
      'video/mp4',
      'audio/wav',
    ]);
  });

  it('downloads URL references and preserves an explicit media type', async () => {
    const { model, body } = setup('ref2vid');
    await model.doGenerate({
      ...defaults,
      inputReferences: [
        {
          type: 'url',
          url: 'https://cdn.example.com/reference',
          mediaType: 'video/mp4',
        },
      ],
    });
    const file = (body() as FormData).get('input') as File;
    expect(file.type).toBe('video/mp4');
    expect(file.name).toBe('reference_0.mp4');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([7, 8, 9]),
    );
    expect(downloadServer.calls).toHaveLength(1);
  });

  it('blocks private reference URLs before submitting a job', async () => {
    const { model, body } = setup('ref2vid');
    await expect(
      model.doGenerate({
        ...defaults,
        inputReferences: [
          {
            type: 'url',
            url: 'http://169.254.169.254/latest/meta-data/',
            mediaType: 'video/mp4',
          },
        ],
      }),
    ).rejects.toThrow();
    expect(body()).toBeUndefined();
    expect(downloadServer.calls).toHaveLength(0);
  });

  it('accepts the maximum mixed reference count', async () => {
    const { model, body } = setup('ref2vid');
    await model.doGenerate({
      ...defaults,
      inputReferences: [
        ...Array(9).fill(image),
        ...Array(3).fill({ ...image, mediaType: 'audio/wav' }),
      ],
    });
    expect((body() as FormData).getAll('input')).toHaveLength(12);
  });

  it.each([
    ['img2vid', {}],
    ['img2vid', { frameImages: [{ frameType: 'last_frame', image }] }],
    ['img2vid', { image, inputReferences: [image] }],
    ['img2vid', { image: { ...image, mediaType: 'video/mp4' } }],
    ['txt2vid', { image }],
    ['txt2vid', { inputReferences: [image] }],
    ['ref2vid', {}],
    ['ref2vid', { image, inputReferences: [image] }],
    ['ref2vid', { inputReferences: [{ ...image, mediaType: 'audio/wav' }] }],
    [
      'ref2vid',
      { inputReferences: [{ ...image, mediaType: 'application/pdf' }] },
    ],
    ['ref2vid', { inputReferences: Array(10).fill(image) }],
    [
      'ref2vid',
      { inputReferences: Array(4).fill({ ...image, mediaType: 'video/mp4' }) },
    ],
    [
      'ref2vid',
      {
        inputReferences: [
          image,
          ...Array(4).fill({ ...image, mediaType: 'audio/wav' }),
        ],
      },
    ],
    ['ref2vid', { inputReferences: Array(13).fill(image) }],
  ] as const)(
    'rejects invalid %s inputs before submitting a job: %j',
    async (mode, options) => {
      const { model, body } = setup(mode);
      await expect(
        model.doGenerate({ ...defaults, ...options } as Parameters<
          ProdiaVideoModel['doGenerate']
        >[0]),
      ).rejects.toMatchObject({ name: 'AI_InvalidArgumentError' });
      expect(body()).toBeUndefined();
    },
  );

  it('warns about unsupported controls without sending them to Prodia', async () => {
    const { model, body } = setup('img2vid');
    const result = await model.doGenerate({
      ...defaults,
      image,
      aspectRatio: '16:9',
      resolution: '1920x1080',
      fps: 30,
      generateAudio: false,
    });
    expect(
      result.warnings.map(warning => 'feature' in warning && warning.feature),
    ).toEqual(['aspectRatio', 'resolution', 'fps', 'generateAudio']);
    expect(
      JSON.parse(await ((body() as FormData).get('job') as Blob).text()).config,
    ).toEqual({ prompt, first_frame: 'first_frame.png' });
  });

  it('does not warn for the fixed frame rate and audio setting', async () => {
    const { model } = setup('txt2vid');
    expect(
      (await model.doGenerate({ ...defaults, fps: 24, generateAudio: true }))
        .warnings,
    ).toEqual([]);
  });
});
