import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { GoogleVertexImageModel } from './google-vertex-image-model';

const prompt = 'A cute baby sea otter';

const model = new GoogleVertexImageModel(
  'imagen-3.0-generate-001',
  {},
  {
    provider: 'google-vertex',
    baseURL: 'https://api.example.com',
    headers: { 'api-key': 'test-key' },
  },
);

describe('GoogleVertexImageModel', () => {
  describe('doGenerate', () => {
    const server = new JsonTestServer(
      'https://api.example.com/models/imagen-3.0-generate-001:predict',
    );

    server.setupTestEnvironment();

    function prepareJsonResponse() {
      server.responseBodyJson = {
        predictions: [
          { bytesBase64Encoded: 'base64-image-1' },
          { bytesBase64Encoded: 'base64-image-2' },
        ],
      };
    }

    it('should pass the correct parameters', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: { vertex: { aspectRatio: '1:1' } },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 2,
          aspectRatio: '1:1',
        },
      });
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const modelWithHeaders = new GoogleVertexImageModel(
        'imagen-3.0-generate-001',
        {},
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: {
            'Custom-Provider-Header': 'provider-header-value',
          },
        },
      );

      await modelWithHeaders.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
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

    it('should respect maxImagesPerCall setting', () => {
      const customModel = new GoogleVertexImageModel(
        'imagen-3.0-generate-001',
        { maxImagesPerCall: 2 },
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
        },
      );

      expect(customModel.maxImagesPerCall).toBe(2);
    });

    it('should use default maxImagesPerCall when not specified', () => {
      const defaultModel = new GoogleVertexImageModel(
        'imagen-3.0-generate-001',
        {},
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
        },
      );

      expect(defaultModel.maxImagesPerCall).toBe(4);
    });

    it('should extract the generated images', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
    });

    it('sends aspect ratio in the request', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          vertex: {
            aspectRatio: '16:9',
          },
        },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
        },
      });
    });

    it('should pass aspect ratio directly when specified', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
        },
      });
    });

    it('should pass seed directly when specified', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: 42,
        providerOptions: {},
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          seed: 42,
        },
      });
    });

    it('should combine aspectRatio, seed and provider options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: 42,
        providerOptions: {
          vertex: {
            temperature: 0.8,
          },
        },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          seed: 42,
          temperature: 0.8,
        },
      });
    });

    it('should return warnings for unsupported settings', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 123,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'size',
          details:
            'This model does not support the `size` option. Use `aspectRatio` instead.',
        },
      ]);
    });

    it('should handle empty response object', async () => {
      server.responseBodyJson = {};
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow('No predictions returned from API');
    });
  });
});
