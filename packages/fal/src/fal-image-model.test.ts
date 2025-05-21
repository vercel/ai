import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { FalImageModel } from './fal-image-model';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
}: {
  headers?: Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  settings?: any;
} = {}) {
  return new FalImageModel('stable-diffusion-xl', {
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

    describe('providerMetaData', () => {
      // https://fal.ai/models/fal-ai/lora/api#schema-output
      it('for lora', async () => {
        const responseMetaData = {
          prompt: '<prompt>',
          seed: 123,
          has_nsfw_concepts: [true],
          debug_latents: {
            url: '<debug_latents url>',
            content_type: '<debug_latents content_type>',
            file_name: '<debug_latents file_name>',
            file_data: '<debug_latents file_data>',
            file_size: 123,
          },
          debug_per_pass_latents: {
            url: '<debug_per_pass_latents url>',
            content_type: '<debug_per_pass_latents content_type>',
            file_name: '<debug_per_pass_latents file_name>',
            file_data: '<debug_per_pass_latents file_data>',
            file_size: 456,
          },
        };
        server.urls['https://api.example.com/stable-diffusion-xl'].response = {
          type: 'json-value',
          body: {
            images: [
              {
                url: 'https://api.example.com/image.png',
                width: 1024,
                height: 1024,
                content_type: 'image/png',
                file_data: '<image file_data>',
                file_size: 123,
                file_name: '<image file_name>',
              },
            ],
            ...responseMetaData,
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
        expect(result.providerMetadata).toStrictEqual({
          fal: {
            images: [
              {
                width: 1024,
                height: 1024,
                contentType: 'image/png',
                fileName: '<image file_name>',
                fileData: '<image file_data>',
                fileSize: 123,
                nsfw: true,
              },
            ],
            seed: 123,
            debug_latents: {
              url: '<debug_latents url>',
              content_type: '<debug_latents content_type>',
              file_name: '<debug_latents file_name>',
              file_data: '<debug_latents file_data>',
              file_size: 123,
            },
            debug_per_pass_latents: {
              url: '<debug_per_pass_latents url>',
              content_type: '<debug_per_pass_latents content_type>',
              file_name: '<debug_per_pass_latents file_name>',
              file_data: '<debug_per_pass_latents file_data>',
              file_size: 456,
            },
          },
        });
      });

      it('for lcm', async () => {
        const responseMetaData = {
          seed: 123,
          num_inference_steps: 456,
          nsfw_content_detected: [false],
        };
        server.urls['https://api.example.com/stable-diffusion-xl'].response = {
          type: 'json-value',
          body: {
            images: [
              {
                url: 'https://api.example.com/image.png',
                width: 1024,
                height: 1024,
              },
            ],
            ...responseMetaData,
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
        expect(result.providerMetadata).toStrictEqual({
          fal: {
            images: [
              {
                width: 1024,
                height: 1024,
                nsfw: false,
              },
            ],
            seed: 123,
            num_inference_steps: 456,
          },
        });
      });
    });
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('fal');
      expect(model.modelId).toBe('stable-diffusion-xl');
      expect(model.specificationVersion).toBe('v2');
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
