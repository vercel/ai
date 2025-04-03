import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { OpenAICompatibleImageModel } from './openai-compatible-image-model';
import { z } from 'zod';
import { ProviderErrorStructure } from './openai-compatible-error';
import { ImageModelV1CallOptions } from '@ai-sdk/provider';

const prompt = 'A photorealistic astronaut riding a horse';

function createBasicModel({
  headers,
  fetch,
  currentDate,
  settings,
  errorStructure,
}: {
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  settings?: any;
  errorStructure?: ProviderErrorStructure<any>;
} = {}) {
  return new OpenAICompatibleImageModel('dall-e-3', settings ?? {}, {
    provider: 'openai-compatible',
    headers: headers ?? (() => ({ Authorization: 'Bearer test-key' })),
    url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
    fetch,
    errorStructure,
    _internal: {
      currentDate,
    },
  });
}

function createDefaultGenerateParams(overrides = {}): ImageModelV1CallOptions {
  return {
    prompt: 'A photorealistic astronaut riding a horse',
    n: 1,
    size: '1024x1024',
    aspectRatio: undefined,
    seed: undefined,
    providerOptions: {},
    headers: {},
    abortSignal: undefined,
    ...overrides,
  };
}

describe('OpenAICompatibleImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/dall-e-3/images/generations': {
      response: {
        type: 'json-value',
        body: {
          data: [
            {
              b64_json: 'test1234',
            },
            {
              b64_json: 'test5678',
            },
          ],
        },
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('openai-compatible');
      expect(model.modelId).toBe('dall-e-3');
      expect(model.specificationVersion).toBe('v1');
      expect(model.maxImagesPerCall).toBe(10);
    });

    it('should use maxImagesPerCall from settings', () => {
      const model = createBasicModel({
        settings: {
          maxImagesPerCall: 5,
        },
      });

      expect(model.maxImagesPerCall).toBe(5);
    });

    it('should default maxImagesPerCall to 10 when not specified', () => {
      const model = createBasicModel();

      expect(model.maxImagesPerCall).toBe(10);
    });
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters', async () => {
      const model = createBasicModel();

      await model.doGenerate(
        createDefaultGenerateParams({
          n: 2,
          providerOptions: { openai: { quality: 'hd' } },
        }),
      );

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 2,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'b64_json',
      });
    });

    it('should add warnings for unsupported settings', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          aspectRatio: '16:9',
          seed: 123,
        }),
      );

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await modelWithHeaders.doGenerate(
        createDefaultGenerateParams({
          headers: {
            'Custom-Request-Header': 'request-header-value',
          },
        }),
      );

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should handle API errors with custom error structure', async () => {
      // Define a custom error schema different from OpenAI's format
      const customErrorSchema = z.object({
        status: z.string(),
        details: z.object({
          errorMessage: z.string(),
          errorCode: z.number(),
        }),
      });

      server.urls[
        'https://api.example.com/dall-e-3/images/generations'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          status: 'error',
          details: {
            errorMessage: 'Custom provider error format',
            errorCode: 1234,
          },
        }),
      };

      const model = createBasicModel({
        errorStructure: {
          errorSchema: customErrorSchema,
          errorToMessage: data =>
            `Error ${data.details.errorCode}: ${data.details.errorMessage}`,
        },
      });

      await expect(
        model.doGenerate(createDefaultGenerateParams()),
      ).rejects.toMatchObject({
        message: 'Error 1234: Custom provider error format',
        statusCode: 400,
        url: 'https://api.example.com/dall-e-3/images/generations',
      });
    });

    it('should handle API errors with default error structure', async () => {
      server.urls[
        'https://api.example.com/dall-e-3/images/generations'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid prompt content',
            type: 'invalid_request_error',
            param: null,
            code: null,
          },
        }),
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate(createDefaultGenerateParams()),
      ).rejects.toMatchObject({
        message: 'Invalid prompt content',
        statusCode: 400,
        url: 'https://api.example.com/dall-e-3/images/generations',
      });
    });

    it('should return the raw b64_json content', async () => {
      const model = createBasicModel();
      const result = await model.doGenerate(
        createDefaultGenerateParams({
          n: 2,
        }),
      );

      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('test1234');
      expect(result.images[1]).toBe('test5678');
    });

    describe('response metadata', () => {
      it('should include timestamp, headers and modelId in response', async () => {
        const testDate = new Date('2024-01-01T00:00:00Z');
        const model = createBasicModel({
          currentDate: () => testDate,
        });

        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.response).toStrictEqual({
          timestamp: testDate,
          modelId: 'dall-e-3',
          headers: expect.any(Object),
        });
      });
    });

    it('should use real date when no custom date provider is specified', async () => {
      const beforeDate = new Date();

      const model = new OpenAICompatibleImageModel(
        'dall-e-3',
        {},
        {
          provider: 'openai-compatible',
          headers: () => ({ Authorization: 'Bearer test-key' }),
          url: ({ modelId, path }) =>
            `https://api.example.com/${modelId}${path}`,
        },
      );

      const result = await model.doGenerate(createDefaultGenerateParams());

      const afterDate = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeDate.getTime(),
      );
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
        afterDate.getTime(),
      );
      expect(result.response.modelId).toBe('dall-e-3');
    });

    it('should pass the user setting in the request', async () => {
      const model = createBasicModel({
        settings: {
          user: 'test-user-id',
        },
      });

      await model.doGenerate(createDefaultGenerateParams());

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        user: 'test-user-id',
        response_format: 'b64_json',
      });
    });

    it('should not include user field in request when setting is not provided', async () => {
      const model = createBasicModel({
        settings: {}, // explicitly empty settings
      });

      await model.doGenerate(createDefaultGenerateParams());

      const requestBody = await server.calls[0].requestBody;
      expect(requestBody).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });
      expect(requestBody).not.toHaveProperty('user');
    });
  });
});
