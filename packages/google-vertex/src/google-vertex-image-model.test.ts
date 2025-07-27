import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexImageModel } from './google-vertex-image-model';

const prompt = 'A cute baby sea otter';

const model = new GoogleVertexImageModel('imagen-3.0-generate-002', {
  provider: 'google-vertex',
  baseURL: 'https://api.example.com',
  headers: { 'api-key': 'test-key' },
});

const server = createTestServer({
  'https://api.example.com/models/imagen-3.0-generate-002:predict': {},
  'https://api.example.com/models/imagen-4.0-generate-preview-06-06:predict':
    {},
  'https://api.example.com/models/imagen-4.0-fast-generate-preview-06-06:predict':
    {},
  'https://api.example.com/models/imagen-4.0-ultra-generate-preview-06-06:predict':
    {},
});

describe('GoogleVertexImageModel', () => {
  describe('doGenerate', () => {
    function prepareJsonResponse({
      headers,
    }: {
      headers?: Record<string, string>;
    } = {}) {
      server.urls[
        'https://api.example.com/models/imagen-3.0-generate-002:predict'
      ].response = {
        type: 'json-value',
        headers,
        body: {
          predictions: [
            {
              mimeType: 'image/png',
              prompt: 'revised prompt 1',
              bytesBase64Encoded: 'base64-image-1',
            },
            {
              mimeType: 'image/png',
              prompt: 'revised prompt 2',
              bytesBase64Encoded: 'base64-image-2',
              someFutureField: 'some future value',
            },
          ],
        },
      };
    }

    it('should pass headers', async () => {
      prepareJsonResponse();

      const modelWithHeaders = new GoogleVertexImageModel(
        'imagen-3.0-generate-002',
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

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should use default maxImagesPerCall when not specified', () => {
      const defaultModel = new GoogleVertexImageModel(
        'imagen-3.0-generate-002',
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

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
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
            addWatermark: false,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        instances: [{ prompt: 'test prompt' }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          seed: 42,
          addWatermark: false,
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

    it('should include response data with timestamp, modelId and headers', async () => {
      prepareJsonResponse({
        headers: {
          'request-id': 'test-request-id',
          'x-goog-quota-remaining': '123',
        },
      });

      const testDate = new Date('2024-03-15T12:00:00Z');

      const customModel = new GoogleVertexImageModel(
        'imagen-3.0-generate-002',
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
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
          'content-length': '237',
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
          vertex: {
            addWatermark: false,
            negativePrompt: 'negative prompt',
            personGeneration: 'allow_all',
            foo: 'bar',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 2,
          addWatermark: false,
          negativePrompt: 'negative prompt',
          personGeneration: 'allow_all',
          aspectRatio: '16:9',
        },
      });
    });

    it('should return image meta data', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.providerMetadata?.vertex).toStrictEqual({
        images: [
          {
            revisedPrompt: 'revised prompt 1',
          },
          {
            revisedPrompt: 'revised prompt 2',
          },
        ],
      });
    });
  });

  describe('Imagen 4 Models', () => {
    describe('imagen-4.0-generate-preview-06-06', () => {
      const imagen4Model = new GoogleVertexImageModel(
        'imagen-4.0-generate-preview-06-06',
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
        },
      );

      function prepareImagen4Response() {
        server.urls[
          'https://api.example.com/models/imagen-4.0-generate-preview-06-06:predict'
        ].response = {
          type: 'json-value',
          body: {
            predictions: [
              {
                mimeType: 'image/png',
                prompt: 'revised imagen 4 prompt',
                bytesBase64Encoded: 'base64-imagen4-image',
              },
            ],
          },
        };
      }

      it('should generate images with Imagen 4', async () => {
        prepareImagen4Response();

        const result = await imagen4Model.doGenerate({
          prompt: 'A beautiful sunset over mountains',
          n: 1,
          size: undefined,
          aspectRatio: '16:9',
          seed: 42,
          providerOptions: {
            vertex: {
              addWatermark: false,
            },
          },
        });

        expect(result.images).toStrictEqual(['base64-imagen4-image']);
        expect(result.providerMetadata?.vertex).toStrictEqual({
          images: [
            {
              revisedPrompt: 'revised imagen 4 prompt',
            },
          ],
        });
      });

      it('should send correct request parameters for Imagen 4', async () => {
        prepareImagen4Response();

        await imagen4Model.doGenerate({
          prompt: 'test imagen 4 prompt',
          n: 2,
          size: undefined,
          aspectRatio: '1:1',
          seed: 123,
          providerOptions: {
            vertex: {
              personGeneration: 'allow_adult',
              safetySetting: 'block_medium_and_above',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          instances: [{ prompt: 'test imagen 4 prompt' }],
          parameters: {
            sampleCount: 2,
            aspectRatio: '1:1',
            seed: 123,
            personGeneration: 'allow_adult',
            safetySetting: 'block_medium_and_above',
          },
        });
      });
    });

    describe('imagen-4.0-fast-generate-preview-06-06', () => {
      const imagen4FastModel = new GoogleVertexImageModel(
        'imagen-4.0-fast-generate-preview-06-06',
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
        },
      );

      function prepareImagen4FastResponse() {
        server.urls[
          'https://api.example.com/models/imagen-4.0-fast-generate-preview-06-06:predict'
        ].response = {
          type: 'json-value',
          body: {
            predictions: [
              {
                mimeType: 'image/png',
                prompt: 'revised imagen 4 fast prompt',
                bytesBase64Encoded: 'base64-imagen4-fast-image',
              },
            ],
          },
        };
      }

      it('should generate images with Imagen 4 Fast', async () => {
        prepareImagen4FastResponse();

        const result = await imagen4FastModel.doGenerate({
          prompt: 'A quick sketch of a cat',
          n: 1,
          size: undefined,
          aspectRatio: '3:4',
          seed: undefined,
          providerOptions: {},
        });

        expect(result.images).toStrictEqual(['base64-imagen4-fast-image']);
        expect(result.providerMetadata?.vertex).toStrictEqual({
          images: [
            {
              revisedPrompt: 'revised imagen 4 fast prompt',
            },
          ],
        });
      });
    });

    describe('imagen-4.0-ultra-generate-preview-06-06', () => {
      const imagen4UltraModel = new GoogleVertexImageModel(
        'imagen-4.0-ultra-generate-preview-06-06',
        {
          provider: 'google-vertex',
          baseURL: 'https://api.example.com',
          headers: { 'api-key': 'test-key' },
        },
      );

      function prepareImagen4UltraResponse() {
        server.urls[
          'https://api.example.com/models/imagen-4.0-ultra-generate-preview-06-06:predict'
        ].response = {
          type: 'json-value',
          body: {
            predictions: [
              {
                mimeType: 'image/png',
                prompt: 'revised imagen 4 ultra prompt',
                bytesBase64Encoded: 'base64-imagen4-ultra-image',
              },
            ],
          },
        };
      }

      it('should generate images with Imagen 4 Ultra', async () => {
        prepareImagen4UltraResponse();

        const result = await imagen4UltraModel.doGenerate({
          prompt: 'A highly detailed photorealistic portrait',
          n: 1,
          size: undefined,
          aspectRatio: '4:3',
          seed: 999,
          providerOptions: {
            vertex: {
              negativePrompt: 'blurry, low quality',
              addWatermark: true,
            },
          },
        });

        expect(result.images).toStrictEqual(['base64-imagen4-ultra-image']);
        expect(result.providerMetadata?.vertex).toStrictEqual({
          images: [
            {
              revisedPrompt: 'revised imagen 4 ultra prompt',
            },
          ],
        });
      });

      it('should handle all provider options with Imagen 4 Ultra', async () => {
        prepareImagen4UltraResponse();

        await imagen4UltraModel.doGenerate({
          prompt: 'comprehensive test prompt',
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {
            vertex: {
              negativePrompt: 'avoid this content',
              personGeneration: 'dont_allow',
              safetySetting: 'block_only_high',
              addWatermark: true,
              storageUri: 'gs://my-bucket/images/',
            },
          },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          instances: [{ prompt: 'comprehensive test prompt' }],
          parameters: {
            sampleCount: 1,
            negativePrompt: 'avoid this content',
            personGeneration: 'dont_allow',
            safetySetting: 'block_only_high',
            addWatermark: true,
            storageUri: 'gs://my-bucket/images/',
          },
        });
      });
    });
  });
});
