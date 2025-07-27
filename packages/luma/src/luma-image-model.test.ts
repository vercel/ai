import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { LumaImageModel } from './luma-image-model';
import { InvalidResponseDataError } from '@ai-sdk/provider';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
} = {}) {
  return new LumaImageModel('test-model', {
    provider: 'luma',
    baseURL: 'https://api.example.com',
    headers: headers ?? (() => ({ 'api-key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('LumaImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/dream-machine/v1/generations/image': {
      response: {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'queued',
          created_at: '2024-01-01T00:00:00Z',
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
          },
        },
      },
    },
    'https://api.example.com/dream-machine/v1/generations/test-generation-id': {
      response: {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
          },
        },
      },
    },
    'https://api.example.com/image.png': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters including aspect ratio', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: { luma: { additional_param: 'value' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        model: 'test-model',
        additional_param: 'value',
      });
    });

    it('should call the correct urls in sequence', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        aspectRatio: '16:9',
        providerOptions: {},
        size: undefined,
        seed: undefined,
      });

      expect(server.calls[0].requestMethod).toBe('POST');
      expect(server.calls[0].requestUrl).toBe(
        'https://api.example.com/dream-machine/v1/generations/image',
      );
      expect(server.calls[1].requestMethod).toBe('GET');
      expect(server.calls[1].requestUrl).toBe(
        'https://api.example.com/dream-machine/v1/generations/test-generation-id',
      );
      expect(server.calls[2].requestMethod).toBe('GET');
      expect(server.calls[2].requestUrl).toBe(
        'https://api.example.com/image.png',
      );
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should not pass providerOptions.{pollIntervalMillis,maxPollAttempts}', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {
          luma: {
            pollIntervalMillis: 1000,
            maxPollAttempts: 5,
            additional_param: 'value',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        model: 'test-model',
        additional_param: 'value',
      });
    });

    it('should handle API errors', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/image'
      ].response = {
        type: 'error',
        status: 400,
        body: 'Bad Request',
      };

      const model = createBasicModel();
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          providerOptions: {},
          size: undefined,
          seed: undefined,
          aspectRatio: undefined,
        }),
      ).rejects.toMatchObject({
        message: 'Bad Request',
        statusCode: 400,
        url: 'https://api.example.com/dream-machine/v1/generations/image',
        requestBodyValues: {
          prompt: 'A cute baby sea otter',
        },
        responseBody: 'Bad Request',
      });
    });

    it('should handle failed generation state', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'failed',
          failure_reason: 'Generation failed',
          created_at: '2024-01-01T00:00:00Z',
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
          },
        },
      };

      const model = createBasicModel();
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          providerOptions: {},
          size: undefined,
          seed: undefined,
          aspectRatio: undefined,
        }),
      ).rejects.toThrow(InvalidResponseDataError);
    });

    describe('warnings', () => {
      it('should return warnings for unsupported parameters', async () => {
        const model = createBasicModel();

        const result = await model.doGenerate({
          prompt,
          n: 1,
          size: '1024x1024',
          seed: 123,
          providerOptions: {},
          aspectRatio: undefined,
        });

        expect(result.warnings).toContainEqual({
          type: 'unsupported-setting',
          setting: 'seed',
          details: 'This model does not support the `seed` option.',
        });

        expect(result.warnings).toContainEqual({
          type: 'unsupported-setting',
          setting: 'size',
          details:
            'This model does not support the `size` option. Use `aspectRatio` instead.',
        });
      });
    });

    describe('response metadata', () => {
      it('should include timestamp, headers and modelId in response', async () => {
        const testDate = new Date('2024-01-01T00:00:00Z');
        const model = createBasicModel({
          currentDate: () => testDate,
        });

        const result = await model.doGenerate({
          prompt,
          n: 1,
          providerOptions: {},
          size: undefined,
          seed: undefined,
          aspectRatio: undefined,
        });

        expect(result.response).toStrictEqual({
          timestamp: testDate,
          modelId: 'test-model',
          headers: expect.any(Object),
        });
      });
    });
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('luma');
      expect(model.modelId).toBe('test-model');
      expect(model.specificationVersion).toBe('v2');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });

  describe('response schema validation', () => {
    it('should parse response with image references', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
            image_ref: [
              {
                url: 'https://example.com/ref1.jpg',
                weight: 0.85,
              },
            ],
          },
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      // If schema validation fails, this won't get reached
      expect(result.images).toBeDefined();
    });

    it('should parse response with style references', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
            style_ref: [
              {
                url: 'https://example.com/style1.jpg',
                weight: 0.8,
              },
            ],
          },
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.images).toBeDefined();
    });

    it('should parse response with character references', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
            character_ref: {
              identity0: {
                images: ['https://example.com/character1.jpg'],
              },
            },
          },
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.images).toBeDefined();
    });

    it('should parse response with modify image reference', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
            modify_image_ref: {
              url: 'https://example.com/modify.jpg',
              weight: 1.0,
            },
          },
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.images).toBeDefined();
    });

    it('should parse response with multiple reference types', async () => {
      server.urls[
        'https://api.example.com/dream-machine/v1/generations/test-generation-id'
      ].response = {
        type: 'json-value',
        body: {
          id: 'test-generation-id',
          generation_type: 'image',
          state: 'completed',
          created_at: '2024-01-01T00:00:00Z',
          assets: {
            image: 'https://api.example.com/image.png',
          },
          model: 'test-model',
          request: {
            generation_type: 'image',
            model: 'test-model',
            prompt: 'A cute baby sea otter',
            image_ref: [
              {
                url: 'https://example.com/ref1.jpg',
                weight: 0.85,
              },
            ],
            style_ref: [
              {
                url: 'https://example.com/style1.jpg',
                weight: 0.8,
              },
            ],
            character_ref: {
              identity0: {
                images: ['https://example.com/character1.jpg'],
              },
            },
            modify_image_ref: {
              url: 'https://example.com/modify.jpg',
              weight: 1.0,
            },
          },
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.images).toBeDefined();
    });
  });
});
