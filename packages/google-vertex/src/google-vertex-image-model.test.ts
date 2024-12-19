import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexImageModel } from './google-vertex-image-model';
import { describe, it, expect, vi } from 'vitest';

const prompt = 'A cute baby sea otter';

const model = new GoogleVertexImageModel('imagen-3.0-generate-001', {
  provider: 'google-vertex',
  baseURL: 'https://api.example.com',
  headers: { 'api-key': 'test-key' },
});

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

    it('should extract the generated images', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
    });

    it('throws when size is specified', async () => {
      const model = new GoogleVertexImageModel('imagen-3.0-generate-001', {
        provider: 'vertex',
        baseURL: 'https://example.com',
      });

      await expect(
        model.doGenerate({
          prompt: 'test prompt',
          n: 1,
          size: '1024x1024',
          providerOptions: {},
        }),
      ).rejects.toThrow(/Google Vertex does not support the `size` option./);
    });

    it('sends aspect ratio in the request', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
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
  });
});
