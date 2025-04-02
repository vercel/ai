import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { FalImageModel } from './fal-image-model';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
  settings,
}: {
  headers?: Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  settings?: any;
} = {}) {
  return new FalImageModel('stable-diffusion-xl', settings ?? {}, {
    provider: 'fal',
    baseURL: 'https://api.example.com',
    headers: headers ?? { 'api-key': 'test-key' },
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('FalImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/stable-diffusion-xl': {
      response: {
        type: 'json-value',
        body: {
          images: [
            {
              url: 'https://api.example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
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
    it('should pass the correct parameters including size', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: 123,
        providerOptions: { fal: { additional_param: 'value' } },
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        seed: 123,
        image_size: { width: 1024, height: 1024 },
        num_images: 1,
        additional_param: 'value',
      });
    });

    it('should convert aspect ratio to size', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        prompt,
        image_size: 'landscape_16_9',
        num_images: 1,
      });
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
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

    it('should handle API errors', async () => {
      server.urls['https://api.example.com/stable-diffusion-xl'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          detail: [
            {
              loc: ['prompt'],
              msg: 'Invalid prompt',
              type: 'value_error',
            },
          ],
        }),
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
        message: 'prompt: Invalid prompt',
        statusCode: 400,
        url: 'https://api.example.com/stable-diffusion-xl',
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
          modelId: 'stable-diffusion-xl',
          headers: expect.any(Object),
        });
      });
    });
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('fal');
      expect(model.modelId).toBe('stable-diffusion-xl');
      expect(model.specificationVersion).toBe('v1');
      expect(model.maxImagesPerCall).toBe(1);
    });

    it('should use maxImagesPerCall from settings', () => {
      const model = createBasicModel({
        settings: {
          maxImagesPerCall: 4,
        },
      });

      expect(model.maxImagesPerCall).toBe(4);
    });

    it('should default maxImagesPerCall to 1 when not specified', () => {
      const model = createBasicModel();

      expect(model.maxImagesPerCall).toBe(1);
    });
  });

  describe('response schema validation', () => {
    it('should parse single image response', async () => {
      server.urls['https://api.example.com/stable-diffusion-xl'].response = {
        type: 'json-value',
        body: {
          image: {
            url: 'https://api.example.com/image.png',
            width: 1024,
            height: 1024,
            content_type: 'image/png',
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

      expect(result.images).toHaveLength(1);
      expect(result.images[0]).toBeInstanceOf(Uint8Array);
    });

    it('should parse multiple images response', async () => {
      server.urls['https://api.example.com/stable-diffusion-xl'].response = {
        type: 'json-value',
        body: {
          images: [
            {
              url: 'https://api.example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
            {
              url: 'https://api.example.com/image.png',
              width: 1024,
              height: 1024,
              content_type: 'image/png',
            },
          ],
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 2,
        providerOptions: {},
        size: undefined,
        seed: undefined,
        aspectRatio: undefined,
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBeInstanceOf(Uint8Array);
      expect(result.images[1]).toBeInstanceOf(Uint8Array);
    });
  });
});
