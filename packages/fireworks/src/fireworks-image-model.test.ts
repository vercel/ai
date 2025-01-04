import { APICallError } from '@ai-sdk/provider';
import { BinaryTestServer } from '@ai-sdk/provider-utils/test';
import { FireworksImageModel } from './fireworks-image-model';
import { describe, it, expect } from 'vitest';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';

const prompt = 'A cute baby sea otter';

const model = new FireworksImageModel(
  'accounts/fireworks/models/flux-1-dev-fp8',
  {
    provider: 'fireworks',
    baseURL: 'https://api.example.com',
    headers: () => ({ 'api-key': 'test-key' }),
  },
);

describe('FireworksImageModel', () => {
  describe('doGenerate', () => {
    const server = new BinaryTestServer(
      'https://api.example.com/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image',
    );

    server.setupTestEnvironment();

    function prepareBinaryResponse() {
      const mockImageBuffer = Buffer.from('mock-image-data');
      server.responseBody = mockImageBuffer;
    }

    it('should pass the correct parameters', async () => {
      prepareBinaryResponse();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        providerOptions: { fireworks: { additional_param: 'value' } },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        prompt,
        additional_param: 'value',
      });
    });

    it('should pass headers', async () => {
      prepareBinaryResponse();

      const modelWithHeaders = new FireworksImageModel(
        'accounts/fireworks/models/flux-1-dev-fp8',
        {
          provider: 'fireworks',
          baseURL: 'https://api.example.com',
          headers: () => ({
            'Custom-Provider-Header': 'provider-header-value',
          }),
        },
      );

      await modelWithHeaders.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      const requestHeaders = await server.getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should return base64 encoded image', async () => {
      const mockImageBuffer = Buffer.from('mock-image-data');
      server.responseBody = mockImageBuffer;

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        providerOptions: {},
      });

      expect(result.images).toHaveLength(1);
      expect(result.images[0]).toBe(mockImageBuffer.toString('base64'));
    });

    it('should handle empty response body', async () => {
      server.responseBody = null;

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(APICallError);

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
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
      server.responseStatus = 400;
      server.responseBody = Buffer.from('Bad Request');

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(APICallError);

      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
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

    it('should throw error when requesting multiple images', async () => {
      await expect(
        model.doGenerate({
          prompt,
          n: 2,
          size: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrowError(
        new UnsupportedFunctionalityError({
          functionality: 'multiple images',
        }),
      );
    });

    it('should throw error when specifying image size', async () => {
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: '512x512',
          providerOptions: {},
        }),
      ).rejects.toThrowError(
        new UnsupportedFunctionalityError({
          functionality: 'image size',
        }),
      );
    });
  });
});
