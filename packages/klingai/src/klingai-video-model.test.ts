import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { KlingAIVideoModel } from './klingai-video-model';

const prompt = 'A character performs a graceful dance';

const createTaskResponse = {
  code: 0,
  message: 'success',
  request_id: 'req-001',
  data: {
    task_id: 'task-abc-123',
    task_status: 'submitted',
    task_info: { external_task_id: null },
    created_at: 1722769557708,
    updated_at: 1722769557708,
  },
};

const successfulTaskResponse = {
  code: 0,
  message: 'success',
  request_id: 'req-002',
  data: {
    task_id: 'task-abc-123',
    task_status: 'succeed',
    task_status_msg: '',
    task_info: { external_task_id: null },
    watermark_info: { enabled: false },
    final_unit_deduction: '1',
    created_at: 1722769557708,
    updated_at: 1722769560000,
    task_result: {
      videos: [
        {
          id: 'video-001',
          url: 'https://p1.a.kwimgs.com/output/video-001.mp4',
          watermark_url:
            'https://p1.a.kwimgs.com/output/video-001-watermark.mp4',
          duration: '5.0',
        },
      ],
    },
  },
};

const klingaiProviderOptions = {
  klingai: {
    videoUrl: 'https://example.com/reference-motion.mp4',
    characterOrientation: 'image' as const,
    mode: 'std' as const,
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
  providerOptions: klingaiProviderOptions,
} as const;

const TEST_BASE_URL = 'https://api-singapore.klingai.com';

function createBasicModel({
  headers,
  currentDate,
  modelId = 'kling-v2.6-motion-control',
}: {
  headers?: Record<string, string | undefined>;
  currentDate?: () => Date;
  modelId?: string;
} = {}) {
  return new KlingAIVideoModel(modelId, {
    provider: 'klingai.video',
    baseURL: TEST_BASE_URL,
    headers: headers ?? { Authorization: 'Bearer test-jwt-token' },
    _internal: {
      currentDate,
    },
  });
}

describe('KlingAIVideoModel', () => {
  const server = createTestServer({
    [`${TEST_BASE_URL}/v1/videos/motion-control`]: {
      response: {
        type: 'json-value',
        body: createTaskResponse,
      },
    },
    [`${TEST_BASE_URL}/v1/videos/motion-control/task-abc-123`]: {
      response: {
        type: 'json-value',
        body: successfulTaskResponse,
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('klingai.video');
      expect(model.modelId).toBe('kling-v2.6-motion-control');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should accept custom model IDs in constructor', () => {
      const model = createBasicModel({ modelId: 'kling-v2.6-text2video' });

      expect(model.modelId).toBe('kling-v2.6-text2video');
    });

    it('should throw NoSuchModelError for unknown model IDs on generate', async () => {
      const model = createBasicModel({ modelId: 'unknown-model' });

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No such videoModel: unknown-model',
      );
    });
  });

  describe('doGenerate', () => {
    it('should send correct request body with required fields', async () => {
      const model = createBasicModel();

      await model.doGenerate({ ...defaultOptions });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        video_url: 'https://example.com/reference-motion.mp4',
        character_orientation: 'image',
        mode: 'std',
      });
    });

    it('should send prompt when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({ ...defaultOptions, prompt: 'Dance gracefully' });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({ prompt: 'Dance gracefully' });
    });

    it('should send image_url from URL-based image', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/reference-image.png',
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        image_url: 'https://example.com/reference-image.png',
      });
    });

    it('should send image_url as base64 from file data', async () => {
      const model = createBasicModel();
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
      // KlingAI expects raw base64, no data: prefix
      expect(body).toMatchObject({
        image_url: 'iVBORw==',
      });
    });

    it('should send keep_original_sound when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          klingai: {
            ...klingaiProviderOptions.klingai,
            keepOriginalSound: 'no',
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        keep_original_sound: 'no',
      });
    });

    it('should send watermark_info when watermarkEnabled is set', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          klingai: {
            ...klingaiProviderOptions.klingai,
            watermarkEnabled: true,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        watermark_info: { enabled: true },
      });
    });

    it('should pass headers to requests', async () => {
      const model = createBasicModel({
        headers: {
          Authorization: 'Bearer custom-token',
          'X-Custom': 'value',
        },
      });

      await model.doGenerate({
        ...defaultOptions,
        headers: {
          'X-Request-Header': 'request-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer custom-token',
        'x-custom': 'value',
        'x-request-header': 'request-value',
      });
    });

    it('should return video with correct URL and media type', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://p1.a.kwimgs.com/output/video-001.mp4',
        mediaType: 'video/mp4',
      });
    });

    it('should return empty warnings for supported features', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should warn about unsupported aspectRatio', async () => {
      const model = createBasicModel();

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

    it('should warn about unsupported resolution', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'resolution',
        }),
      );
    });

    it('should warn about unsupported seed', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        seed: 42,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'seed',
        }),
      );
    });

    it('should warn about unsupported fps', async () => {
      const model = createBasicModel();

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

    it('should warn about unsupported duration', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        duration: 10,
      });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'duration',
        }),
      );
    });

    it('should warn when n > 1', async () => {
      const model = createBasicModel();

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
      const model = createBasicModel();

      const result = await model.doGenerate({
        ...defaultOptions,
        n: 1,
      });

      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          feature: 'n',
        }),
      );
    });
  });

  describe('response metadata', () => {
    it('should include timestamp, headers, and modelId in response', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createBasicModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'kling-v2.6-motion-control',
        headers: expect.any(Object),
      });
    });
  });

  describe('providerMetadata', () => {
    it('should include taskId and video metadata', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        klingai: {
          taskId: 'task-abc-123',
          videos: [
            {
              id: 'video-001',
              url: 'https://p1.a.kwimgs.com/output/video-001.mp4',
              watermarkUrl:
                'https://p1.a.kwimgs.com/output/video-001-watermark.mp4',
              duration: '5.0',
            },
          ],
        },
      });
    });
  });

  describe('error handling', () => {
    it('should throw when provider options fail validation (missing required fields)', async () => {
      const model = createBasicModel();

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            klingai: {
              // Missing videoUrl, characterOrientation, mode
              pollIntervalMs: 10,
            },
          },
        }),
      ).rejects.toThrow();
    });

    it('should throw when klingai provider options are missing entirely', async () => {
      const model = createBasicModel();

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {},
        }),
      ).rejects.toThrow('providerOptions.klingai');
    });

    it('should throw when task status is failed', async () => {
      server.urls[
        `${TEST_BASE_URL}/v1/videos/motion-control/task-abc-123`
      ].response = {
        type: 'json-value',
        body: {
          code: 0,
          message: 'success',
          request_id: 'req-003',
          data: {
            task_id: 'task-abc-123',
            task_status: 'failed',
            task_status_msg: 'Content policy violation',
            task_info: {},
            created_at: 1722769557708,
            updated_at: 1722769560000,
          },
        },
      };

      const model = createBasicModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'Content policy violation',
      );

      // Reset
      server.urls[
        `${TEST_BASE_URL}/v1/videos/motion-control/task-abc-123`
      ].response = {
        type: 'json-value',
        body: successfulTaskResponse,
      };
    });

    it('should throw when no task_id is returned', async () => {
      server.urls[`${TEST_BASE_URL}/v1/videos/motion-control`].response = {
        type: 'json-value',
        body: {
          code: 0,
          message: 'success',
          request_id: 'req-004',
          data: null,
        },
      };

      const model = createBasicModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No task_id',
      );

      // Reset
      server.urls[`${TEST_BASE_URL}/v1/videos/motion-control`].response = {
        type: 'json-value',
        body: createTaskResponse,
      };
    });

    it('should throw when no videos in response', async () => {
      server.urls[
        `${TEST_BASE_URL}/v1/videos/motion-control/task-abc-123`
      ].response = {
        type: 'json-value',
        body: {
          code: 0,
          message: 'success',
          request_id: 'req-005',
          data: {
            task_id: 'task-abc-123',
            task_status: 'succeed',
            task_status_msg: '',
            task_info: {},
            created_at: 1722769557708,
            updated_at: 1722769560000,
            task_result: {
              videos: [],
            },
          },
        },
      };

      const model = createBasicModel();

      await expect(model.doGenerate({ ...defaultOptions })).rejects.toThrow(
        'No videos in response',
      );

      // Reset
      server.urls[
        `${TEST_BASE_URL}/v1/videos/motion-control/task-abc-123`
      ].response = {
        type: 'json-value',
        body: successfulTaskResponse,
      };
    });
  });

  describe('pro mode', () => {
    it('should send mode=pro when specified', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          klingai: {
            videoUrl: 'https://example.com/motion.mp4',
            characterOrientation: 'video',
            mode: 'pro',
            pollIntervalMs: 10,
          },
        },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        character_orientation: 'video',
        mode: 'pro',
      });
    });
  });
});
