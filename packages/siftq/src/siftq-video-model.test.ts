import type { Experimental_VideoModelV4CallOptions } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { SiftQVideoModel } from './siftq-video-model';

const BASE_URL = 'https://siftq.test/api/minimax';
const CREATE_URL = `${BASE_URL}/v2/video_generation`;
const STATUS_URL = `${BASE_URL}/v2/query/video_generation/task-123`;
const CDN_URL = 'https://cdn.siftq.test/video.mp4';
const MP4_BYTES = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00,
  0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
]);

const defaultOptions = {
  prompt: 'A paper boat crossing a moonlit ocean',
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
} satisfies Experimental_VideoModelV4CallOptions;

function createModel({
  fetch,
  currentDate,
  maxRequestBytes,
}: {
  fetch?: FetchFunction;
  currentDate?: () => Date;
  maxRequestBytes?: number;
} = {}) {
  return new SiftQVideoModel({
    provider: 'siftq.video',
    baseURL: BASE_URL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
    ...(currentDate != null || maxRequestBytes != null
      ? { _internal: { currentDate, maxRequestBytes } }
      : {}),
  });
}

const server = createTestServer({
  [CREATE_URL]: {
    response: { type: 'json-value', body: { task_id: 'task-123' } },
  },
  [STATUS_URL]: {
    response: {
      type: 'json-value',
      body: {
        task: {
          id: 'task-123',
          model: 'MiniMax-H3',
          status: 'succeeded',
          content: { url: CDN_URL },
          resolution: '2K',
          duration: 5,
          ratio: '16:9',
          task_type: 'generation',
          modality: 'video',
          usage: { total_seconds: 5, output_seconds: 5 },
        },
      },
    },
  },
  [CDN_URL]: {
    response: {
      type: 'binary',
      body: MP4_BYTES,
      headers: { 'Content-Type': 'video/mp4' },
    },
  },
});

describe('SiftQVideoModel', () => {
  it('exposes the fixed model and supports workflow serialization', () => {
    const model = createModel({ fetch: async () => new Response() });

    expect(model.provider).toBe('siftq.video');
    expect(model.modelId).toBe('MiniMax-H3');
    expect(model.specificationVersion).toBe('v4');
    expect(model.maxVideosPerCall).toBe(1);

    const serialized = SiftQVideoModel[WORKFLOW_SERIALIZE](model);
    expect(serialized).toEqual({
      modelId: 'MiniMax-H3',
      config: {
        provider: 'siftq.video',
        baseURL: BASE_URL,
        headers: { Authorization: 'Bearer test-key' },
      },
    });

    const restored = SiftQVideoModel[WORKFLOW_DESERIALIZE]({
      modelId: 'MiniMax-H3',
      config: serialized.config as {
        provider: string;
        baseURL: string;
        headers: Record<string, string>;
      },
    });
    expect(restored.modelId).toBe('MiniMax-H3');
  });

  describe('request mapping', () => {
    it('uses the exact H3 V2 route and default text-to-video body', async () => {
      const result = await createModel().doStart(defaultOptions);

      expect(server.calls[0].requestUrl).toBe(CREATE_URL);
      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: defaultOptions.prompt }],
        resolution: '2K',
        duration: 5,
        ratio: '16:9',
      });
      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      });
      expect(result.operation).toStrictEqual({ taskId: 'task-123' });
    });

    it('maps provider resolution, ratio, duration, and callback URL', async () => {
      await createModel().doStart({
        ...defaultOptions,
        duration: 15,
        webhookUrl: 'https://app.test/siftq-callback',
        providerOptions: {
          siftq: { resolution: '768P', ratio: '9:16' },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [{ type: 'text', text: defaultOptions.prompt }],
        resolution: '768P',
        duration: 15,
        ratio: '9:16',
        callback_url: 'https://app.test/siftq-callback',
      });
    });

    it('maps first and last frames and forces adaptive ratio', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        aspectRatio: '16:9',
        frameImages: [
          {
            frameType: 'first_frame',
            image: {
              type: 'file',
              data: new Uint8Array([137, 80, 78, 71]),
              mediaType: 'image/png',
            },
          },
          {
            frameType: 'last_frame',
            image: {
              type: 'url',
              url: 'https://files.test/last.webp',
              mediaType: 'image/webp',
            },
          },
        ],
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: defaultOptions.prompt },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: { url: 'https://files.test/last.webp' },
            role: 'last_frame',
          },
        ],
        resolution: '2K',
        duration: 5,
        ratio: 'adaptive',
      });
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ feature: 'aspectRatio' }),
      );
    });

    it('maps image, video, and audio references with matching roles', async () => {
      await createModel().doStart({
        ...defaultOptions,
        inputReferences: [
          {
            type: 'url',
            url: 'https://files.test/character.jpg',
            mediaType: 'image/jpeg',
          },
          {
            type: 'url',
            url: 'https://files.test/motion.mov',
            mediaType: 'video/quicktime',
          },
          {
            type: 'url',
            url: 'https://files.test/voice.wav',
            mediaType: 'audio/wav',
          },
        ],
        providerOptions: {
          siftq: { referenceAudioUrls: ['mm_file://audio-file-id'] },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'MiniMax-H3',
        content: [
          { type: 'text', text: defaultOptions.prompt },
          {
            type: 'image_url',
            image_url: { url: 'https://files.test/character.jpg' },
            role: 'reference_image',
          },
          {
            type: 'video_url',
            video_url: { url: 'https://files.test/motion.mov' },
            role: 'reference_video',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'https://files.test/voice.wav' },
            role: 'reference_audio',
          },
          {
            type: 'audio_url',
            audio_url: { url: 'mm_file://audio-file-id' },
            role: 'reference_audio',
          },
        ],
        resolution: '2K',
        duration: 5,
        ratio: 'adaptive',
      });
    });

    it('returns explicit warnings for unsupported generic options', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        n: 2,
        fps: 30,
        seed: 42,
        resolution: '1920x1080',
        generateAudio: false,
      });

      expect(
        result.warnings.map(warning =>
          warning.type === 'unsupported' ? warning.feature : warning.type,
        ),
      ).toEqual(['n', 'fps', 'seed', 'generateAudio', 'resolution']);
    });

    it('maps canonical 2K pixel dimensions to the provider 2K tier', async () => {
      const result = await createModel().doStart({
        ...defaultOptions,
        resolution: '2560x1440',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        resolution: '2K',
      });
      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({ feature: 'resolution' }),
      );
    });

    it.each([4, 15])('accepts duration boundary %s', async duration => {
      await createModel().doStart({ ...defaultOptions, duration });
      expect(await server.calls[0].requestBodyJson).toMatchObject({ duration });
    });

    it.each([3, 4.5, 16])('rejects invalid duration %s', async duration => {
      await expect(
        createModel().doStart({ ...defaultOptions, duration }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_DURATION' });
    });

    it('rejects missing and oversized prompts', async () => {
      await expect(
        createModel().doStart({ ...defaultOptions, prompt: '   ' }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_PROMPT' });
      await expect(
        createModel().doStart({ ...defaultOptions, prompt: 'x'.repeat(7001) }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_PROMPT' });
    });

    it('rejects adaptive text ratio and unknown concrete ratios', async () => {
      await expect(
        createModel().doStart({ ...defaultOptions, aspectRatio: 'adaptive' }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_RATIO' });
      await expect(
        createModel().doStart({ ...defaultOptions, aspectRatio: '2:1' }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_RATIO' });
    });

    it('rejects last-frame-only and mixed frame/reference modes', async () => {
      const lastFrame = {
        type: 'url' as const,
        url: 'https://files.test/last.png',
        mediaType: 'image/png',
      };
      await expect(
        createModel().doStart({
          ...defaultOptions,
          frameImages: [{ frameType: 'last_frame', image: lastFrame }],
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_MISSING_FIRST_FRAME' });

      await expect(
        createModel().doStart({
          ...defaultOptions,
          image: lastFrame,
          inputReferences: [lastFrame],
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INCOMPATIBLE_VIDEO_INPUTS' });
    });

    it('rejects unsupported media formats and reference count overflow', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: [
            {
              type: 'url',
              url: 'https://files.test/input.gif',
              mediaType: 'image/gif',
            },
          ],
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_UNSUPPORTED_MEDIA_FORMAT' });

      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: Array.from({ length: 10 }, (_, index) => ({
            type: 'url' as const,
            url: `https://files.test/reference-${index}.png`,
            mediaType: 'image/png',
          })),
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_TOO_MANY_REFERENCE_IMAGES' });
    });

    it('rejects unsupported media locations and callback URLs', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          inputReferences: [
            {
              type: 'url',
              url: 'file:///private/reference.png',
              mediaType: 'image/png',
            },
          ],
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_MEDIA_LOCATION' });

      await expect(
        createModel().doStart({
          ...defaultOptions,
          webhookUrl: 'file:///private/callback',
        }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_CALLBACK_URL' });

      await expect(
        createModel().doStart({
          ...defaultOptions,
          providerOptions: {
            siftq: { referenceAudioUrls: ['not-a-media-location'] },
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects null provider options instead of treating them as omission', async () => {
      await expect(
        createModel().doStart({
          ...defaultOptions,
          providerOptions: {
            siftq: { resolution: null },
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects request bodies over the 64 MB transport limit', async () => {
      await expect(
        createModel({ maxRequestBytes: 1 }).doStart(defaultOptions),
      ).rejects.toMatchObject({ name: 'SIFTQ_REQUEST_TOO_LARGE' });
    });

    it('passes through the SDK webhook factory', async () => {
      const received = Promise.resolve({ headers: {}, body: {} });
      await expect(
        createModel().handleWebhookOption({
          webhook: async () => ({
            url: 'https://app.test/webhook',
            received,
          }),
        }),
      ).resolves.toStrictEqual({
        webhookUrl: 'https://app.test/webhook',
        received,
      });
    });
  });

  describe('response handling', () => {
    it('rejects a missing task id and legacy V1 create envelopes', async () => {
      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: { task_id: '' },
      };
      await expect(createModel().doStart(defaultOptions)).rejects.toMatchObject(
        {
          name: 'SIFTQ_VIDEO_GENERATION_ERROR',
        },
      );

      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: { base_resp: { status_code: 0 } },
      };
      await expect(createModel().doStart(defaultOptions)).rejects.toThrow();
    });

    it('maps the OpenAI-style error envelope and HTTP status', async () => {
      server.urls[CREATE_URL].response = {
        type: 'error',
        status: 401,
        body: JSON.stringify({
          type: 'error',
          error: {
            type: 'authorized_error',
            message: 'invalid SiftQ key',
            http_code: '401',
          },
          request_id: 'request-123',
        }),
      };

      await expect(createModel().doStart(defaultOptions)).rejects.toMatchObject(
        {
          name: 'AI_APICallError',
          message: 'invalid SiftQ key',
          statusCode: 401,
        },
      );
    });

    it('forwards an abort signal to task creation', async () => {
      const controller = new AbortController();
      const signals: Array<AbortSignal | null | undefined> = [];
      const fetch: FetchFunction = async (_url, init) => {
        signals.push(init?.signal);
        return new Response(JSON.stringify({ task_id: 'task-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await createModel({ fetch }).doStart({
        ...defaultOptions,
        abortSignal: controller.signal,
      });
      expect(signals).toStrictEqual([controller.signal]);
    });

    it.each(['queued', 'running'] as const)(
      'maps lowercase %s state to pending',
      async status => {
        server.urls[STATUS_URL].response = {
          type: 'json-value',
          body: {
            task: {
              id: 'task-123',
              model: 'MiniMax-H3',
              status,
              task_type: 'generation',
              modality: 'video',
            },
          },
        };

        await expect(
          createModel().doStatus({ operation: { taskId: 'task-123' } }),
        ).resolves.toMatchObject({
          status: 'pending',
          providerMetadata: { siftq: { taskId: 'task-123', status } },
        });
      },
    );

    it.each(['failed', 'cancelled'] as const)(
      'maps lowercase %s state to an error',
      async status => {
        server.urls[STATUS_URL].response = {
          type: 'json-value',
          body: {
            task: {
              id: 'task-123',
              status,
              error: { code: '2013', message: 'task stopped' },
            },
          },
        };

        await expect(
          createModel().doStatus({ operation: { taskId: 'task-123' } }),
        ).resolves.toMatchObject({
          status: 'error',
          error: expect.stringContaining('task stopped'),
        });
      },
    );

    it('downloads task.content.url and returns task metadata', async () => {
      const date = new Date('2026-08-11T00:00:00Z');
      const result = await createModel({ currentDate: () => date }).doStatus({
        operation: { taskId: 'task-123' },
        headers: { 'x-request': 'request-value' },
      });

      expect(server.calls[0].requestUrl).toBe(STATUS_URL);
      expect(result).toMatchObject({
        status: 'completed',
        videos: [
          {
            type: 'binary',
            data: new Uint8Array(MP4_BYTES),
            mediaType: 'video/mp4',
          },
        ],
        providerMetadata: {
          siftq: {
            taskId: 'task-123',
            status: 'succeeded',
            taskType: 'generation',
            modality: 'video',
            resolution: '2K',
            duration: 5,
            ratio: '16:9',
            usage: { total_seconds: 5, output_seconds: 5 },
            downloadUrl: CDN_URL,
          },
        },
        response: { timestamp: date, modelId: 'MiniMax-H3' },
      });
      expect(server.calls[1].requestHeaders).not.toHaveProperty(
        'authorization',
      );
      expect(server.calls[1].requestHeaders).not.toHaveProperty('x-request');
    });

    it('rejects succeeded tasks without task.content.url', async () => {
      server.urls[STATUS_URL].response = {
        type: 'json-value',
        body: { task: { id: 'task-123', status: 'succeeded' } },
      };

      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toMatchObject({ name: 'SIFTQ_VIDEO_GENERATION_ERROR' });
    });

    it('rejects legacy or malformed status envelopes', async () => {
      server.urls[STATUS_URL].response = {
        type: 'json-value',
        body: { status: 'Success', file_id: 'file-123' },
      };
      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toThrow();

      await expect(
        createModel().doStatus({ operation: { taskId: '' } }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_OPERATION' });
    });

    it('rejects empty and non-video downloads', async () => {
      server.urls[CDN_URL].response = {
        type: 'binary',
        body: Buffer.alloc(0),
        headers: { 'Content-Type': 'video/mp4' },
      };
      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toMatchObject({ name: 'SIFTQ_EMPTY_VIDEO_RESULT' });

      server.urls[CDN_URL].response = {
        type: 'binary',
        body: Buffer.from('{"not":"video"}'),
        headers: { 'Content-Type': 'application/json' },
      };
      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toMatchObject({ name: 'SIFTQ_INVALID_VIDEO_RESULT' });
    });

    it('maps status and download failures', async () => {
      server.urls[STATUS_URL].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          type: 'error',
          error: { type: 'server_error', message: 'status unavailable' },
        }),
      };
      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'status unavailable',
      });

      server.urls[STATUS_URL].response = {
        type: 'json-value',
        body: {
          task: { status: 'succeeded', content: { url: CDN_URL } },
        },
      };
      server.urls[CDN_URL].response = {
        type: 'error',
        status: 502,
        body: JSON.stringify({
          type: 'error',
          error: { type: 'server_error', message: 'download unavailable' },
        }),
      };
      await expect(
        createModel().doStatus({ operation: { taskId: 'task-123' } }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'download unavailable',
      });
    });
  });
});
