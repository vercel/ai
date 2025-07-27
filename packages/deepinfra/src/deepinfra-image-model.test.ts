import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { DeepInfraImageModel } from './deepinfra-image-model';
import { FetchFunction } from '@ai-sdk/provider-utils';

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
  return new DeepInfraImageModel('stability-ai/sdxl', {
    provider: 'deepinfra',
    baseURL: 'https://api.example.com',
    headers: headers ?? (() => ({ 'api-key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('DeepInfraImageModel', () => {
  const testDate = new Date('2024-01-01T00:00:00Z');
  const server = createTestServer({
    'https://api.example.com/*': {
      response: {
        type: 'json-value',
        body: {
          images: ['data:image/png;base64,test-image-data'],
        },
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
        providerOptions: { deepinfra: { additional_param: 'value' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        aspect_ratio: '16:9',
        seed: 42,
        num_images: 1,
        additional_param: 'value',
      });
    });

    it('should call the correct url', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestMethod).toStrictEqual('POST');
      expect(server.calls[0].requestUrl).toStrictEqual(
        'https://api.example.com/stability-ai/sdxl',
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

    it('should handle API errors', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Bad Request',
          },
        }),
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
      ).rejects.toThrow('Bad Request');
    });

    it('should handle size parameter', async () => {
      const model = createBasicModel();

      await model.doGenerate({
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
        num_images: 1,
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

    describe('response metadata', () => {
      it('should include timestamp, headers and modelId in response', async () => {
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
          modelId: 'stability-ai/sdxl',
          headers: expect.any(Object),
        });
      });

      it('should include response headers from API call', async () => {
        server.urls['https://api.example.com/*'].response = {
          type: 'json-value',
          headers: {
            'x-request-id': 'test-request-id',
          },
          body: {
            images: ['data:image/png;base64,test-image-data'],
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
          'content-length': '52',
          'x-request-id': 'test-request-id',
          'content-type': 'application/json',
        });
      });
    });
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('deepinfra');
      expect(model.modelId).toBe('stability-ai/sdxl');
      expect(model.specificationVersion).toBe('v2');
      expect(model.maxImagesPerCall).toBe(1);
    });
  });
});
