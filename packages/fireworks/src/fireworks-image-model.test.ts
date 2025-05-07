import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { FireworksImageModel } from './fireworks-image-model';

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
  return new FireworksImageModel('accounts/fireworks/models/flux-1-dev-fp8', {
    provider: 'fireworks',
    baseURL: 'https://api.example.com',
    headers: headers ?? (() => ({ 'api-key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

function createSizeModel() {
  return new FireworksImageModel(
    'accounts/fireworks/models/playground-v2-5-1024px-aesthetic',
    {
      provider: 'fireworks',
      baseURL: 'https://api.size-example.com',
      headers: () => ({ 'api-key': 'test-key' }),
    },
  );
}

describe('FireworksImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/*': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
    'https://api.size-example.com/*': {
      response: {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
      },
    },
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters including aspect ratio and seed', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: 42,
        providerOptions: { fireworks: { additional_param: 'value' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        seed: 42,
        samples: 1,
        additional_param: 'value',
      });
    });

    it('should call the correct url', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: 42,
        providerOptions: { fireworks: { additional_param: 'value' } },
      });

      expect(server.calls[0].requestMethod).toStrictEqual('POST');
      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://api.example.com/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image',
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
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
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

    it('should handle empty response body', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'empty',
      };

      const model = createBasicModel();
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toMatchObject({
        message: 'Response body is empty',
        statusCode: 200,
        url: 'https://api.example.com/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image',
        requestBodyValues: {
          prompt: 'A cute baby sea otter',
        },
      });
    });

    it('should handle API errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 400,
        body: 'Bad Request',
      };

      const model = createBasicModel();
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toMatchObject({
        message: 'Bad Request',
        statusCode: 400,
        url: 'https://api.example.com/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image',
        requestBodyValues: {
          prompt: 'A cute baby sea otter',
        },
        responseBody: 'Bad Request',
      });
    });

    it('should handle size parameter for supported models', async () => {
      const sizeModel = createSizeModel();

      await sizeModel.doGenerate({
        prompt,
        n: 1,
        size: '1024x768',
        aspectRatio: undefined,
        seed: 42,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        width: '1024',
        height: '768',
        seed: 42,
        samples: 1,
      });
    });

    describe('warnings', () => {
      it('should return size warning on workflow model', async () => {
        const model = createBasicModel();

        const result1 = await model.doGenerate({
          prompt,
          n: 1,
          size: '1024x1024',
          aspectRatio: '1:1',
          seed: 123,
          providerOptions: {},
        });

        expect(result1.warnings).toContainEqual({
          type: 'unsupported-setting',
          setting: 'size',
          details:
            'This model does not support the `size` option. Use `aspectRatio` instead.',
        });
      });

      it('should return aspectRatio warning on size-supporting model', async () => {
        const sizeModel = createSizeModel();

        const result2 = await sizeModel.doGenerate({
          prompt,
          n: 1,
          size: '1024x1024',
          aspectRatio: '1:1',
          seed: 123,
          providerOptions: {},
        });

        expect(result2.warnings).toContainEqual({
          type: 'unsupported-setting',
          setting: 'aspectRatio',
          details: 'This model does not support the `aspectRatio` option.',
        });
      });
    });

    it('should respect the abort signal', async () => {
      const model = createBasicModel();
      const controller = new AbortController();

      const generatePromise = model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        abortSignal: controller.signal,
      });

      controller.abort();

      await expect(generatePromise).rejects.toThrow(
        'This operation was aborted',
      );
    });

    it('should use custom fetch function when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(Buffer.from('mock-image-data'), {
          status: 200,
        }),
      );

      const model = createBasicModel({
        fetch: mockFetch,
      });

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should pass samples parameter to API', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 42,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toHaveProperty(
        'samples',
        42,
      );
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
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        });

        expect(result.response).toStrictEqual({
          timestamp: testDate,
          modelId: 'accounts/fireworks/models/flux-1-dev-fp8',
          headers: expect.any(Object),
        });
      });

      it('should include response headers from API call', async () => {
        server.urls['https://api.example.com/*'].response = {
          type: 'binary',
          body: Buffer.from('test-binary-content'),
          headers: {
            'x-request-id': 'test-request-id',
            'content-type': 'image/png',
          },
        };

        const model = createBasicModel();
        const result = await model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        });

        expect(result.response.headers).toStrictEqual({
          'content-length': '19',
          'x-request-id': 'test-request-id',
          'content-type': 'image/png',
        });
      });
    });
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('fireworks');
      expect(model.modelId).toBe('accounts/fireworks/models/flux-1-dev-fp8');
      expect(model.specificationVersion).toBe('v2');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });
});
