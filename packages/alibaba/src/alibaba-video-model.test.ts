import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { AlibabaVideoModel } from './alibaba-video-model';

const prompt = 'A serene mountain lake at sunset with gentle ripples';

const TEST_BASE_URL = 'https://dashscope-intl.aliyuncs.com';
const CREATE_URL = `${TEST_BASE_URL}/api/v1/services/aigc/video-generation/video-synthesis`;
const TASK_URL = `${TEST_BASE_URL}/api/v1/tasks/task-abc-123`;

const createTaskResponse = {
  output: {
    task_status: 'PENDING',
    task_id: 'task-abc-123',
  },
  request_id: 'req-001',
};

const succeededTaskResponse = {
  output: {
    task_id: 'task-abc-123',
    task_status: 'SUCCEEDED',
    video_url: 'https://dashscope-result.oss.aliyuncs.com/output/video-001.mp4',
    submit_time: '2024-01-01 00:00:00.000',
    scheduled_time: '2024-01-01 00:00:01.000',
    end_time: '2024-01-01 00:01:00.000',
    orig_prompt: prompt,
    actual_prompt: 'An enhanced prompt with more cinematic details',
  },
  usage: {
    duration: 5.0,
    output_video_duration: 5,
    SR: 1080,
    size: '1920x1080',
  },
  request_id: 'req-002',
};

const defaultProviderOptions = {
  alibaba: {
    pollIntervalMs: 10, // Fast polling for tests
    pollTimeoutMs: 5000,
  },
};

const defaultOptions = {
  prompt,
  n: 1,
  image: undefined,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  providerOptions: defaultProviderOptions,
} as const;

function createModel({
  modelId = 'wan2.6-t2v',
  headers,
  currentDate,
}: {
  modelId?: string;
  headers?: Record<string, string | undefined>;
  currentDate?: () => Date;
} = {}) {
  return new AlibabaVideoModel(modelId, {
    provider: 'alibaba.video',
    baseURL: TEST_BASE_URL,
    headers: headers ?? { Authorization: 'Bearer test-api-key' },
    _internal: { currentDate },
  });
}

describe('AlibabaVideoModel', () => {
  const server = createTestServer({
    [CREATE_URL]: {
      response: { type: 'json-value', body: createTaskResponse },
    },
    [TASK_URL]: {
      response: { type: 'json-value', body: succeededTaskResponse },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('alibaba.video');
      expect(model.modelId).toBe('wan2.6-t2v');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should accept custom model IDs', () => {
      const model = createModel({ modelId: 'wan2.6-i2v-flash' });
      expect(model.modelId).toBe('wan2.6-i2v-flash');
    });
  });

  describe('doGenerate - text-to-video', () => {
    it('should send correct request body for T2V', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'wan2.6-t2v',
        input: { prompt },
        parameters: {},
      });
    });

    it('should send size parameter for T2V resolution (x converted to *)', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { size: '1920*1080' },
      });
    });

    it('should send duration parameter', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        duration: 10,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { duration: 10 },
      });
    });

    it('should send seed parameter', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        seed: 42,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { seed: 42 },
      });
    });

    it('should send provider options (negativePrompt, promptExtend, shotType, watermark)', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          alibaba: {
            negativePrompt: 'blurry, low quality',
            promptExtend: true,
            shotType: 'multi',
            watermark: false,
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        input: {
          prompt,
          negative_prompt: 'blurry, low quality',
        },
        parameters: {
          prompt_extend: true,
          shot_type: 'multi',
          watermark: false,
        },
      });
    });

    it('should send audioUrl in input', async () => {
      const model = createModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          alibaba: {
            audioUrl: 'https://example.com/audio.mp3',
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        input: { prompt, audio_url: 'https://example.com/audio.mp3' },
      });
    });
  });

  describe('doGenerate - image-to-video', () => {
    it('should send img_url from URL-based image for I2V model', async () => {
      const model = createModel({ modelId: 'wan2.6-i2v' });

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/image.jpg',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        model: 'wan2.6-i2v',
        input: {
          prompt,
          img_url: 'https://example.com/image.jpg',
        },
      });
    });

    it('should send img_url as base64 from file data', async () => {
      const model = createModel({ modelId: 'wan2.6-i2v-flash' });
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'file',
          data: imageData,
          mediaType: 'image/png',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        model: 'wan2.6-i2v-flash',
        input: {
          img_url: 'iVBORw==', // base64 of the bytes
        },
      });
    });

    it('should map resolution to I2V format (WxH → "720P"/"1080P")', async () => {
      const model = createModel({ modelId: 'wan2.6-i2v' });

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { resolution: '1080P' },
      });
    });

    it('should map 720p resolution for I2V', async () => {
      const model = createModel({ modelId: 'wan2.6-i2v' });

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { resolution: '720P' },
      });
    });

    it('should not send img_url for T2V model even if image provided', async () => {
      const model = createModel({ modelId: 'wan2.6-t2v' });

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/image.jpg',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.input).not.toHaveProperty('img_url');
    });

    it('should send audio provider option for I2V', async () => {
      const model = createModel({ modelId: 'wan2.6-i2v-flash' });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          alibaba: {
            audio: false,
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { audio: false },
      });
    });
  });

  describe('doGenerate - reference-to-video', () => {
    it('should send reference_urls for R2V model', async () => {
      const model = createModel({ modelId: 'wan2.6-r2v-flash' });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          alibaba: {
            referenceUrls: [
              'https://example.com/ref-image.jpg',
              'https://example.com/ref-video.mp4',
            ],
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        model: 'wan2.6-r2v-flash',
        input: {
          prompt,
          reference_urls: [
            'https://example.com/ref-image.jpg',
            'https://example.com/ref-video.mp4',
          ],
        },
      });
    });

    it('should send size parameter for R2V resolution (x converted to *)', async () => {
      const model = createModel({ modelId: 'wan2.6-r2v' });

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1280x720',
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        parameters: { size: '1280*720' },
      });
    });

    it('should not send reference_urls for non-R2V model', async () => {
      const model = createModel({ modelId: 'wan2.6-t2v' });

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          alibaba: {
            referenceUrls: ['https://example.com/ref.jpg'],
            pollIntervalMs: 10,
            pollTimeoutMs: 5000,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.input).not.toHaveProperty('reference_urls');
    });
  });

  describe('headers', () => {
    it('should send X-DashScope-Async header on task creation', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'x-dashscope-async': 'enable',
      });
    });

    it('should send Authorization header', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-api-key',
      });
    });

    it('should pass custom headers', async () => {
      const model = createModel({
        headers: {
          Authorization: 'Bearer custom-key',
          'X-Custom': 'value',
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        headers: { 'X-Request-Header': 'request-value' },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer custom-key',
        'x-custom': 'value',
        'x-request-header': 'request-value',
      });
    });

    it('should not send X-DashScope-Async header on polling requests', async () => {
      const model = createModel();

      await model.doGenerate({ ...defaultOptions });

      // calls[0] = task creation, calls[1] = polling
      expect(server.calls[1].requestHeaders).not.toHaveProperty(
        'x-dashscope-async',
      );
    });
  });

  describe('warnings', () => {
    it('should warn about unsupported aspectRatio', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'aspectRatio',
        }),
      );
    });

    it('should warn about unsupported fps', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        fps: 30,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'fps',
        }),
      );
    });

    it('should warn when n > 1', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 3,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'n',
        }),
      );
    });

    it('should not warn when n is 1', async () => {
      const model = createModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 1,
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({ feature: 'n' }),
      );
    });

    it('should return empty warnings for supported features', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('response', () => {
    it('should return video with correct URL and media type', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://dashscope-result.oss.aliyuncs.com/output/video-001.mp4',
        mediaType: 'video/mp4',
      });
    });

    it('should include timestamp, modelId, and headers in response', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createModel({ currentDate: () => testDate });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'wan2.6-t2v',
        headers: expect.any(Object),
      });
    });
  });

  describe('providerMetadata', () => {
    it('should include taskId, videoUrl, actualPrompt, and usage', async () => {
      const model = createModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        alibaba: {
          taskId: 'task-abc-123',
          videoUrl:
            'https://dashscope-result.oss.aliyuncs.com/output/video-001.mp4',
          actualPrompt: 'An enhanced prompt with more cinematic details',
          usage: {
            duration: 5.0,
            outputVideoDuration: 5,
            resolution: 1080,
            size: '1920x1080',
          },
        },
      });
    });
  });

  describe('error handling', () => {
    it('should throw when no task_id is returned', async () => {
      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: { output: null, request_id: 'req-003' },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No task_id',
      );

      // Reset
      server.urls[CREATE_URL].response = {
        type: 'json-value',
        body: createTaskResponse,
      };
    });

    it('should throw when task status is FAILED', async () => {
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: {
          output: {
            task_id: 'task-abc-123',
            task_status: 'FAILED',
            message: 'Content policy violation',
          },
          request_id: 'req-004',
        },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        /failed/i,
      );

      // Reset
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: succeededTaskResponse,
      };
    });

    it('should throw when task status is CANCELED', async () => {
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: {
          output: {
            task_id: 'task-abc-123',
            task_status: 'CANCELED',
          },
          request_id: 'req-005',
        },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        /canceled/i,
      );

      // Reset
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: succeededTaskResponse,
      };
    });

    it('should throw when no video URL in succeeded response', async () => {
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: {
          output: {
            task_id: 'task-abc-123',
            task_status: 'SUCCEEDED',
            video_url: null,
          },
          request_id: 'req-006',
        },
      };

      const model = createModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No video URL',
      );

      // Reset
      server.urls[TASK_URL].response = {
        type: 'json-value',
        body: succeededTaskResponse,
      };
    });
  });

  describe('polling', () => {
    it('should poll until SUCCEEDED status', async () => {
      const originalResponse = server.urls[TASK_URL].response;

      server.urls[TASK_URL].response = ({ callNumber }) => {
        if (callNumber < 3) {
          return {
            type: 'json-value' as const,
            body: {
              output: {
                task_id: 'task-abc-123',
                task_status: callNumber === 1 ? 'PENDING' : 'RUNNING',
              },
              request_id: `req-poll-${callNumber}`,
            },
          };
        }
        return {
          type: 'json-value' as const,
          body: succeededTaskResponse,
        };
      };

      const model = createModel();
      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);

      // Reset
      server.urls[TASK_URL].response = originalResponse;
    });
  });
});
