import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleGenerativeAIImageModel } from './google-generative-ai-image-model';

const prompt = 'A cute baby sea otter';

const model = new GoogleGenerativeAIImageModel(
  'imagen-3.0-generate-002',
  {},
  {
    provider: 'google.generative-ai',
    baseURL: 'https://api.example.com/v1beta',
    headers: () => ({ 'api-key': 'test-api-key' }),
  },
);

const server = createTestServer({
  'https://api.example.com/v1beta/models/imagen-3.0-generate-002:predict': {
    response: {
      type: 'json-value',
      body: {
        predictions: [
          { bytesBase64Encoded: 'base64-image-1' },
          { bytesBase64Encoded: 'base64-image-2' },
        ],
      },
    },
  },
});
describe('GoogleGenerativeAIImageModel', () => {
  describe('doGenerate', () => {
    function prepareJsonResponse({
      headers,
    }: {
      headers?: Record<string, string>;
    } = {}) {
      const url =
        'https://api.example.com/v1beta/models/imagen-3.0-generate-002:predict';
      server.urls[url].response = {
        type: 'json-value',
        headers,
        body: {
          predictions: [
            { bytesBase64Encoded: 'base64-image-1' },
            { bytesBase64Encoded: 'base64-image-2' },
          ],
        },
      };
    }

    it('should pass headers', async () => {
      prepareJsonResponse();

      const modelWithHeaders = new GoogleGenerativeAIImageModel(
        'imagen-3.0-generate-002',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://api.example.com/v1beta',
          headers: () => ({
            'Custom-Provider-Header': 'provider-header-value',
          }),
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

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should respect maxImagesPerCall setting', () => {
      const customModel = new GoogleGenerativeAIImageModel(
        'imagen-3.0-generate-002',
        { maxImagesPerCall: 2 },
        {
          provider: 'google.generative-ai',
          baseURL: 'https://api.example.com/v1beta',
          headers: () => ({ 'api-key': 'test-api-key' }),
        },
      );

      expect(customModel.maxImagesPerCall).toBe(2);
    });

    it('should use default maxImagesPerCall when not specified', () => {
      const defaultModel = new GoogleGenerativeAIImageModel(
        'imagen-3.0-generate-002',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://api.example.com/v1beta',
          headers: () => ({ 'api-key': 'test-api-key' }),
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
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
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

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
        },
      });
    });

    it('should combine aspectRatio and provider options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: undefined,
        providerOptions: {
          google: {
            personGeneration: 'dont_allow',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          personGeneration: 'dont_allow',
          aspectRatio: '1:1',
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
        {
          type: 'unsupported-setting',
          setting: 'seed',
          details:
            'This model does not support the `seed` option through this provider.',
        },
      ]);
    });

    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonResponse({
        headers: {
          'request-id': 'test-request-id',
          'x-goog-quota-remaining': '123',
        },
      });

      const testDate = new Date('2024-03-15T12:00:00Z');

      const customModel = new GoogleGenerativeAIImageModel(
        'imagen-3.0-generate-002',
        {},
        {
          provider: 'google.generative-ai',
          baseURL: 'https://api.example.com/v1beta',
          headers: () => ({ 'api-key': 'test-api-key' }),
          _internal: {
            currentDate: () => testDate,
          },
        },
      );

      const result = await customModel.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'imagen-3.0-generate-002',
        headers: {
          'content-length': '97',
          'content-type': 'application/json',
          'request-id': 'test-request-id',
          'x-goog-quota-remaining': '123',
        },
      });
    });

    it('should use real date when no custom date provider is specified', async () => {
      prepareJsonResponse();
      const beforeDate = new Date();

      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const afterDate = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeDate.getTime(),
      );
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
        afterDate.getTime(),
      );
      expect(result.response.modelId).toBe('imagen-3.0-generate-002');
    });

    it('should only pass valid provider options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {
          google: {
            addWatermark: false,
            personGeneration: 'allow_all',
            foo: 'bar', // Invalid option
            negativePrompt: 'negative prompt', // Invalid option
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 2,
          personGeneration: 'allow_all',
          aspectRatio: '16:9',
        },
      });
    });
  });
});
