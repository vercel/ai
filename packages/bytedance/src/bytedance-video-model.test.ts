import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { ByteDanceVideoModel } from './bytedance-video-model';

const prompt = 'A futuristic city with flying cars';

const defaultOptions = {
  prompt,
  n: 1,
  image: undefined,
  aspectRatio: undefined,
  resolution: undefined,
  duration: undefined,
  fps: undefined,
  seed: undefined,
  providerOptions: {},
} as const;

function createBasicModel({
  headers,
  fetch,
  currentDate,
  modelId = 'ep-test-model',
}: {
  headers?: Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  modelId?: string;
} = {}) {
  return new ByteDanceVideoModel(modelId, {
    provider: 'bytedance.video',
    baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    headers: () => headers ?? { Authorization: 'Bearer test-key' },
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('ByteDanceVideoModel', () => {
  const server = createTestServer({
    'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks':
      {
        response: {
          type: 'json-value',
          body: {
            id: 'test-task-id-123',
          },
        },
      },
    'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/test-task-id-123':
      {
        response: {
          type: 'json-value',
          body: {
            id: 'test-task-id-123',
            model: 'ep-test-model',
            status: 'succeeded',
            content: {
              video_url: 'https://bytedance.cdn/files/video-output.mp4',
            },
            usage: {
              completion_tokens: 100,
            },
          },
        },
      },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('bytedance.video');
      expect(model.modelId).toBe('ep-test-model');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should support different model IDs', () => {
      const model = createBasicModel({
        modelId: 'ep-seedance-1.5-pro',
      });

      expect(model.modelId).toBe('ep-seedance-1.5-pro');
    });
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters including prompt', async () => {
      const model = createBasicModel();

      await model.doGenerate({ ...defaultOptions });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      });
    });

    it('should pass seed when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        seed: 42,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        seed: 42,
      });
    });

    it('should pass aspect ratio when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        ratio: '16:9',
      });
    });

    it('should pass duration when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        duration: 5,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        duration: 5,
      });
    });

    it('should pass resolution when provided', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        resolution: '1920x1080',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        resolution: '1920x1080',
      });
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await modelWithHeaders.doGenerate({
        ...defaultOptions,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should return video with correct data', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0]).toStrictEqual({
        type: 'url',
        url: 'https://bytedance.cdn/files/video-output.mp4',
        mediaType: 'video/mp4',
      });
    });

    it('should return warnings array', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('response metadata', () => {
    it('should include timestamp, headers and modelId in response', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createBasicModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'ep-test-model',
        headers: expect.any(Object),
      });
    });
  });

  describe('providerMetadata', () => {
    it('should include task ID and usage', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({ ...defaultOptions });

      expect(result.providerMetadata).toStrictEqual({
        bytedance: {
          taskId: 'test-task-id-123',
          usage: {
            completion_tokens: 100,
          },
        },
      });
    });
  });

  describe('Image-to-Video', () => {
    it('should send image_url with file data', async () => {
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

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,iVBORw==',
            },
          },
        ],
      });
    });

    it('should send image_url with URL-based image', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/input-image.png',
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://example.com/input-image.png',
            },
          },
        ],
      });
    });
  });

  describe('Provider Options', () => {
    it('should pass watermark option', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          bytedance: {
            watermark: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        watermark: true,
      });
    });

    it('should pass generateAudio as generate_audio', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          bytedance: {
            generateAudio: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        generate_audio: true,
      });
    });

    it('should pass through additional options', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          bytedance: {
            custom_param: 'custom_value',
            another_param: 123,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'ep-test-model',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
        custom_param: 'custom_value',
        another_param: 123,
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when no task ID is returned', async () => {
      server.urls[
        'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks'
      ].response = {
        type: 'json-value',
        body: {},
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        message: 'No task ID returned from API',
      });
    });

    it('should throw error when task fails', async () => {
      const model = new ByteDanceVideoModel('ep-test-model', {
        provider: 'bytedance.video',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          if (
            urlString.endsWith('/contents/generations/tasks') &&
            init?.method === 'POST'
          ) {
            return new Response(
              JSON.stringify({
                id: 'failed-task-id',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          if (urlString.includes('/tasks/failed-task-id')) {
            return new Response(
              JSON.stringify({
                id: 'failed-task-id',
                status: 'failed',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response('Not found', { status: 404 });
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            bytedance: {
              pollIntervalMs: 10,
            },
          },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Video generation failed'),
      });
    });

    it('should throw error when no video URL in response', async () => {
      const model = new ByteDanceVideoModel('ep-test-model', {
        provider: 'bytedance.video',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          if (
            urlString.endsWith('/contents/generations/tasks') &&
            init?.method === 'POST'
          ) {
            return new Response(
              JSON.stringify({
                id: 'no-video-task-id',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          if (urlString.includes('/tasks/no-video-task-id')) {
            return new Response(
              JSON.stringify({
                id: 'no-video-task-id',
                status: 'succeeded',
                content: {},
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response('Not found', { status: 404 });
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            bytedance: {
              pollIntervalMs: 10,
            },
          },
        }),
      ).rejects.toMatchObject({
        message: 'No video URL in response',
      });
    });

    it('should handle API errors from task creation', async () => {
      server.urls[
        'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid prompt',
          },
        }),
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate({ ...defaultOptions }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('Polling Behavior', () => {
    it('should poll until video is ready', async () => {
      let pollCount = 0;

      const model = new ByteDanceVideoModel('ep-test-model', {
        provider: 'bytedance.video',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          // Task creation endpoint
          if (
            urlString.endsWith('/contents/generations/tasks') &&
            init?.method === 'POST'
          ) {
            return new Response(
              JSON.stringify({
                id: 'poll-test-id',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          // Status endpoint
          if (urlString.includes('/tasks/poll-test-id')) {
            pollCount++;

            if (pollCount < 3) {
              return new Response(
                JSON.stringify({
                  id: 'poll-test-id',
                  status: 'processing',
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            // Final successful response
            return new Response(
              JSON.stringify({
                id: 'poll-test-id',
                status: 'succeeded',
                content: {
                  video_url: 'https://bytedance.cdn/files/final-video.mp4',
                },
                usage: {
                  completion_tokens: 100,
                },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response('Not found', { status: 404 });
        },
      });

      const result = await model.doGenerate({
        ...defaultOptions,
        providerOptions: {
          bytedance: {
            pollIntervalMs: 10, // Fast polling for test
          },
        },
      });

      expect(pollCount).toBe(3);
      expect(result.videos[0]).toMatchObject({
        type: 'url',
        url: 'https://bytedance.cdn/files/final-video.mp4',
      });
    });

    it('should timeout after pollTimeoutMs', async () => {
      const model = new ByteDanceVideoModel('ep-test-model', {
        provider: 'bytedance.video',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          if (
            urlString.endsWith('/contents/generations/tasks') &&
            init?.method === 'POST'
          ) {
            return new Response(
              JSON.stringify({
                id: 'timeout-test-id',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          if (urlString.includes('/tasks/timeout-test-id')) {
            return new Response(
              JSON.stringify({
                id: 'timeout-test-id',
                status: 'processing',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response('Not found', { status: 404 });
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            bytedance: {
              pollIntervalMs: 10,
              pollTimeoutMs: 50,
            },
          },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('timed out'),
      });
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();

      const model = new ByteDanceVideoModel('ep-test-model', {
        provider: 'bytedance.video',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch: async (url, init) => {
          const urlString = url.toString();

          if (
            urlString.endsWith('/contents/generations/tasks') &&
            init?.method === 'POST'
          ) {
            return new Response(
              JSON.stringify({
                id: 'abort-test-id',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          if (urlString.includes('/tasks/abort-test-id')) {
            // Abort after first poll
            abortController.abort();
            return new Response(
              JSON.stringify({
                id: 'abort-test-id',
                status: 'processing',
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          return new Response('Not found', { status: 404 });
        },
      });

      await expect(
        model.doGenerate({
          ...defaultOptions,
          providerOptions: {
            bytedance: {
              pollIntervalMs: 10,
            },
          },
          abortSignal: abortController.signal,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('aborted'),
      });
    });
  });
});
