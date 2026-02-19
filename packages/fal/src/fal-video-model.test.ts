import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { FalVideoModel } from './fal-video-model';

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
  modelId = 'luma-dream-machine',
}: {
  headers?: Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  modelId?: string;
} = {}) {
  return new FalVideoModel(modelId, {
    provider: 'fal.video',
    url: ({ path }) => path,
    headers: () => headers ?? { 'api-key': 'test-key' },
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('FalVideoModel', () => {
  const server = createTestServer({
    'https://queue.fal.run/fal-ai/luma-dream-machine': {
      response: {
        type: 'json-value',
        body: {
          request_id: 'test-request-id-123',
          response_url:
            'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123',
        },
      },
    },
    'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123':
      {
        response: {
          type: 'json-value',
          body: {
            video: {
              url: 'https://fal.media/files/video-output.mp4',
              width: 1920,
              height: 1080,
              duration: 5.0,
              fps: 24,
              content_type: 'video/mp4',
            },
            seed: 12345,
            timings: {
              inference: 45.5,
            },
          },
        },
      },
    'https://queue.fal.run/fal-ai/luma-ray-2': {
      response: {
        type: 'json-value',
        body: {
          request_id: 'ray2-request-id',
          response_url:
            'https://queue.fal.run/fal-ai/luma-ray-2/requests/ray2-request-id',
        },
      },
    },
    'https://queue.fal.run/fal-ai/luma-ray-2/requests/ray2-request-id': {
      response: {
        type: 'json-value',
        body: {
          video: {
            url: 'https://fal.media/files/ray2-video.mp4',
            width: 1280,
            height: 720,
            duration: 3.0,
            fps: 30,
            content_type: 'video/mp4',
          },
          seed: 67890,
        },
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('fal.video');
      expect(model.modelId).toBe('luma-dream-machine');
      expect(model.specificationVersion).toBe('v3');
      expect(model.maxVideosPerCall).toBe(1);
    });

    it('should support different model IDs', () => {
      const model = createBasicModel({ modelId: 'luma-ray-2' });

      expect(model.modelId).toBe('luma-ray-2');
    });
  });

  describe('doStart', () => {
    it('should submit to queue and return operation with responseUrl', async () => {
      const model = createBasicModel();

      const result = await model.doStart({ ...defaultOptions });

      expect(result.operation).toStrictEqual({
        responseUrl:
          'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123',
      });
      expect(result.warnings).toStrictEqual([]);
      expect(result.response.modelId).toBe('luma-dream-machine');
    });

    it('should pass the correct request body', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        seed: 42,
        aspectRatio: '16:9',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        seed: 42,
        aspect_ratio: '16:9',
      });
    });

    it('should pass the correct parameters including prompt', async () => {
      const model = createBasicModel();

      await model.doStart({ ...defaultOptions });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
      });
    });

    it('should pass seed when provided', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        seed: 42,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        seed: 42,
      });
    });

    it('should pass aspect ratio when provided', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        aspectRatio: '16:9',
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
      });
    });

    it('should convert duration to string format', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        duration: 5,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        duration: '5s',
      });
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await modelWithHeaders.doStart({
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

    it('should return warnings array', async () => {
      const model = createBasicModel();

      const result = await model.doStart({ ...defaultOptions });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should throw error when no response URL returned', async () => {
      server.urls['https://queue.fal.run/fal-ai/luma-dream-machine'].response =
        {
          type: 'json-value',
          body: {},
        };

      const model = createBasicModel();

      await expect(model.doStart({ ...defaultOptions })).rejects.toMatchObject({
        message: 'No response URL returned from queue endpoint',
      });
    });

    it('should handle API errors from queue endpoint', async () => {
      server.urls['https://queue.fal.run/fal-ai/luma-dream-machine'].response =
        {
          type: 'error',
          status: 400,
          body: JSON.stringify({
            error: {
              message: 'Invalid prompt',
            },
          }),
        };

      const model = createBasicModel();

      await expect(model.doStart({ ...defaultOptions })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('should append webhookUrl as fal_webhook query parameter', async () => {
      let capturedUrl = '';

      const model = new FalVideoModel('luma-dream-machine', {
        provider: 'fal.video',
        url: ({ path }) => path,
        headers: () => ({ 'api-key': 'test-key' }),
        fetch: async (url, init) => {
          capturedUrl = url.toString();
          return new Response(
            JSON.stringify({
              request_id: 'webhook-test-id',
              response_url:
                'https://queue.fal.run/fal-ai/luma-dream-machine/requests/webhook-test-id',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      });

      await model.doStart({
        ...defaultOptions,
        webhookUrl: 'https://smee.io/abc123',
      });

      expect(capturedUrl).toBe(
        'https://queue.fal.run/fal-ai/luma-dream-machine?fal_webhook=https%3A%2F%2Fsmee.io%2Fabc123',
      );
    });

    it('should send image_url with file data', async () => {
      const model = createBasicModel();
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

      await model.doStart({
        ...defaultOptions,
        image: {
          type: 'file',
          data: imageData,
          mediaType: 'image/png',
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        prompt,
        image_url: 'data:image/png;base64,iVBORw==',
      });
    });

    it('should send image_url with URL-based image', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        image: {
          type: 'url',
          url: 'https://example.com/input-image.png',
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toMatchObject({
        prompt,
        image_url: 'https://example.com/input-image.png',
      });
    });

    it('should pass loop option', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            loop: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        loop: true,
      });
    });

    it('should pass motionStrength as motion_strength', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            motionStrength: 0.8,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        motion_strength: 0.8,
      });
    });

    it('should pass resolution option', async () => {
      const model = createBasicModel({ modelId: 'luma-ray-2' });

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            resolution: '1080p',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        resolution: '1080p',
      });
    });

    it('should pass negativePrompt as negative_prompt', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            negativePrompt: 'blurry, low quality',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        negative_prompt: 'blurry, low quality',
      });
    });

    it('should pass promptOptimizer as prompt_optimizer', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            promptOptimizer: true,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        prompt_optimizer: true,
      });
    });

    it('should pass through additional options', async () => {
      const model = createBasicModel();

      await model.doStart({
        ...defaultOptions,
        providerOptions: {
          fal: {
            custom_param: 'custom_value',
            another_param: 123,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        custom_param: 'custom_value',
        another_param: 123,
      });
    });
  });

  describe('doStatus', () => {
    it('should return completed status with video data', async () => {
      const model = createBasicModel();

      const result = await model.doStatus({
        operation: {
          responseUrl:
            'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123',
        },
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.videos).toHaveLength(1);
        expect(result.videos[0]).toStrictEqual({
          type: 'url',
          url: 'https://fal.media/files/video-output.mp4',
          mediaType: 'video/mp4',
        });
        expect(result.providerMetadata?.fal).toBeDefined();
      }
    });

    it('should return pending status when request is still in progress', async () => {
      let callCount = 0;

      const model = new FalVideoModel('luma-dream-machine', {
        provider: 'fal.video',
        url: ({ path }) => path,
        headers: () => ({ 'api-key': 'test-key' }),
        fetch: async () => {
          callCount++;
          return new Response(
            JSON.stringify({ detail: 'Request is still in progress' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      });

      const result = await model.doStatus({
        operation: {
          responseUrl:
            'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-id',
        },
      });

      expect(callCount).toBe(1);
      expect(result.status).toBe('pending');
    });

    it('should include provider metadata in completed status', async () => {
      const model = createBasicModel();

      const result = await model.doStatus({
        operation: {
          responseUrl:
            'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123',
        },
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.providerMetadata).toStrictEqual({
          fal: {
            videos: [
              {
                url: 'https://fal.media/files/video-output.mp4',
                width: 1920,
                height: 1080,
                duration: 5.0,
                fps: 24,
                contentType: 'video/mp4',
              },
            ],
            seed: 12345,
            timings: { inference: 45.5 },
          },
        });
      }
    });

    it('should throw error when video URL is missing in completed response', async () => {
      server.urls[
        'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123'
      ].response = {
        type: 'json-value',
        body: {},
      };

      const model = createBasicModel();

      await expect(
        model.doStatus({
          operation: {
            responseUrl:
              'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-request-id-123',
          },
        }),
      ).rejects.toMatchObject({
        message: 'No video URL in response',
      });
    });

    it('should return error status for non-polling API errors', async () => {
      const model = new FalVideoModel('luma-dream-machine', {
        provider: 'fal.video',
        url: ({ path }) => path,
        headers: () => ({ 'api-key': 'test-key' }),
        fetch: async () => {
          return new Response(
            JSON.stringify({
              error: { message: 'Internal server error', code: 500 },
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
        _internal: {
          currentDate: () => new Date('2026-02-16T00:00:00Z'),
        },
      });

      const result = await model.doStatus({
        operation: {
          responseUrl:
            'https://queue.fal.run/fal-ai/luma-dream-machine/requests/test-id',
        },
      });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBe('Internal server error');
        expect(result.response.modelId).toBe('luma-dream-machine');
        expect(result.response.timestamp).toStrictEqual(
          new Date('2026-02-16T00:00:00Z'),
        );
      }
    });
  });
});
