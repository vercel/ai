import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleVertexImageModel,
  GoogleVertexImageProviderOptions,
} from './google-vertex-image-model';
import { createVertex } from './google-vertex-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

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

    // changed test to go through the provider `createVertex`
    it('should pass headers', async () => {
      prepareJsonResponse();

      const provider = createVertex({
        project: 'test-project',
        location: 'us-central1',
        baseURL: 'https://api.example.com',
        headers: { 'Custom-Provider-Header': 'provider-header-value' },
      });

      await provider.imageModel('imagen-3.0-generate-002').doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: { 'Custom-Request-Header': 'request-header-value' },
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(server.calls[0].requestUserAgent).toContain(
        `ai-sdk/google-vertex/0.0.0-test`,
      );
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
        files: undefined,
        mask: undefined,
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
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "test prompt",
            },
          ],
          "parameters": {
            "aspectRatio": "16:9",
            "sampleCount": 1,
          },
        }
      `);
    });

    it('should pass aspect ratio directly when specified', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "test prompt",
            },
          ],
          "parameters": {
            "aspectRatio": "16:9",
            "sampleCount": 1,
          },
        }
      `);
    });

    it('should pass seed directly when specified', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: 42,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "test prompt",
            },
          ],
          "parameters": {
            "sampleCount": 1,
            "seed": 42,
          },
        }
      `);
    });

    it('should combine aspectRatio, seed and provider options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: 42,
        providerOptions: {
          vertex: {
            addWatermark: false,
          } satisfies GoogleVertexImageProviderOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "test prompt",
            },
          ],
          "parameters": {
            "addWatermark": false,
            "aspectRatio": "1:1",
            "sampleCount": 1,
            "seed": 42,
          },
        }
      `);
    });

    it('should return warnings for unsupported settings', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 123,
        providerOptions: {},
      });

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "This model does not support the \`size\` option. Use \`aspectRatio\` instead.",
            "feature": "size",
            "type": "unsupported",
          },
        ]
      `);
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
        files: undefined,
        mask: undefined,
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
        files: undefined,
        mask: undefined,
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
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {
          vertex: {
            addWatermark: false,
            negativePrompt: 'negative prompt',
            personGeneration: 'allow_all',
            sampleImageSize: '2K',
            // @ts-expect-error Testing invalid option
            foo: 'bar',
          } satisfies GoogleVertexImageProviderOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "A cute baby sea otter",
            },
          ],
          "parameters": {
            "addWatermark": false,
            "aspectRatio": "16:9",
            "negativePrompt": "negative prompt",
            "personGeneration": "allow_all",
            "sampleCount": 2,
            "sampleImageSize": "2K",
          },
        }
      `);
    });

    it('should return image meta data', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        files: undefined,
        mask: undefined,
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

  describe('Image Editing', () => {
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
              bytesBase64Encoded: 'edited-base64-image',
            },
          ],
        },
      };
    }

    it('should send edit request with files and mask', async () => {
      prepareJsonResponse();

      // Create test image data (base64 encoded)
      const imageData = 'base64-source-image';
      const maskData = 'base64-mask-image';

      await model.doGenerate({
        prompt: 'A sunlit indoor lounge with a flamingo',
        files: [
          {
            type: 'file',
            data: imageData,
            mediaType: 'image/png',
          },
        ],
        mask: {
          type: 'file',
          data: maskData,
          mediaType: 'image/png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "A sunlit indoor lounge with a flamingo",
              "referenceImages": [
                {
                  "referenceId": 1,
                  "referenceImage": {
                    "bytesBase64Encoded": "base64-source-image",
                  },
                  "referenceType": "REFERENCE_TYPE_RAW",
                },
                {
                  "maskImageConfig": {
                    "maskMode": "MASK_MODE_USER_PROVIDED",
                  },
                  "referenceId": 2,
                  "referenceImage": {
                    "bytesBase64Encoded": "base64-mask-image",
                  },
                  "referenceType": "REFERENCE_TYPE_MASK",
                },
              ],
            },
          ],
          "parameters": {
            "editMode": "EDIT_MODE_INPAINT_INSERTION",
            "sampleCount": 1,
          },
        }
      `);
    });

    it('should send edit request with Uint8Array data', async () => {
      prepareJsonResponse();

      // Create test Uint8Array data (represents 'hello' in bytes)
      const imageUint8Array = new Uint8Array([104, 101, 108, 108, 111]);
      const maskUint8Array = new Uint8Array([119, 111, 114, 108, 100]);

      await model.doGenerate({
        prompt: 'Edit this image',
        files: [
          {
            type: 'file',
            data: imageUint8Array,
            mediaType: 'image/png',
          },
        ],
        mask: {
          type: 'file',
          data: maskUint8Array,
          mediaType: 'image/png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      const requestBody = await server.calls[0].requestBodyJson;
      // Check that the data was converted to base64
      expect(
        requestBody.instances[0].referenceImages[0].referenceImage
          .bytesBase64Encoded,
      ).toBe('aGVsbG8='); // 'hello' in base64
      expect(
        requestBody.instances[0].referenceImages[1].referenceImage
          .bytesBase64Encoded,
      ).toBe('d29ybGQ='); // 'world' in base64
    });

    it('should send edit request with custom edit options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'Remove the object',
        files: [
          {
            type: 'file',
            data: 'base64-source-image',
            mediaType: 'image/png',
          },
        ],
        mask: {
          type: 'file',
          data: 'base64-mask-image',
          mediaType: 'image/png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          vertex: {
            edit: {
              mode: 'EDIT_MODE_INPAINT_REMOVAL',
              baseSteps: 50,
              maskMode: 'MASK_MODE_USER_PROVIDED',
              maskDilation: 0.01,
            },
          } satisfies GoogleVertexImageProviderOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "Remove the object",
              "referenceImages": [
                {
                  "referenceId": 1,
                  "referenceImage": {
                    "bytesBase64Encoded": "base64-source-image",
                  },
                  "referenceType": "REFERENCE_TYPE_RAW",
                },
                {
                  "maskImageConfig": {
                    "dilation": 0.01,
                    "maskMode": "MASK_MODE_USER_PROVIDED",
                  },
                  "referenceId": 2,
                  "referenceImage": {
                    "bytesBase64Encoded": "base64-mask-image",
                  },
                  "referenceType": "REFERENCE_TYPE_MASK",
                },
              ],
            },
          ],
          "parameters": {
            "editConfig": {
              "baseSteps": 50,
            },
            "editMode": "EDIT_MODE_INPAINT_REMOVAL",
            "sampleCount": 1,
          },
        }
      `);
    });

    it('should extract the edited images', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt: 'Edit this image',
        files: [
          {
            type: 'file',
            data: 'base64-source-image',
            mediaType: 'image/png',
          },
        ],
        mask: {
          type: 'file',
          data: 'base64-mask-image',
          mediaType: 'image/png',
        },
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual(['edited-base64-image']);
    });

    it('should send edit request without mask (for operations that do not require mask)', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'Upscale this image',
        files: [
          {
            type: 'file',
            data: 'base64-source-image',
            mediaType: 'image/png',
          },
        ],
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          vertex: {
            edit: { mode: 'EDIT_MODE_CONTROLLED_EDITING' },
          } satisfies GoogleVertexImageProviderOptions,
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "instances": [
            {
              "prompt": "Upscale this image",
              "referenceImages": [
                {
                  "referenceId": 1,
                  "referenceImage": {
                    "bytesBase64Encoded": "base64-source-image",
                  },
                  "referenceType": "REFERENCE_TYPE_RAW",
                },
              ],
            },
          ],
          "parameters": {
            "editMode": "EDIT_MODE_CONTROLLED_EDITING",
            "sampleCount": 1,
          },
        }
      `);
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
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: '16:9',
          seed: 42,
          providerOptions: {
            vertex: {
              addWatermark: false,
            } satisfies GoogleVertexImageProviderOptions,
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
          files: undefined,
          mask: undefined,
          n: 2,
          size: undefined,
          aspectRatio: '1:1',
          seed: 123,
          providerOptions: {
            vertex: {
              personGeneration: 'allow_adult',
              safetySetting: 'block_medium_and_above',
            } satisfies GoogleVertexImageProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "instances": [
              {
                "prompt": "test imagen 4 prompt",
              },
            ],
            "parameters": {
              "aspectRatio": "1:1",
              "personGeneration": "allow_adult",
              "safetySetting": "block_medium_and_above",
              "sampleCount": 2,
              "seed": 123,
            },
          }
        `);
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
          files: undefined,
          mask: undefined,
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
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: '4:3',
          seed: 999,
          providerOptions: {
            vertex: {
              negativePrompt: 'blurry, low quality',
              addWatermark: true,
            } satisfies GoogleVertexImageProviderOptions,
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
          files: undefined,
          mask: undefined,
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
            } satisfies GoogleVertexImageProviderOptions,
          },
        });

        expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
          {
            "instances": [
              {
                "prompt": "comprehensive test prompt",
              },
            ],
            "parameters": {
              "addWatermark": true,
              "negativePrompt": "avoid this content",
              "personGeneration": "dont_allow",
              "safetySetting": "block_only_high",
              "sampleCount": 1,
              "storageUri": "gs://my-bucket/images/",
            },
          }
        `);
      });
    });
  });
});
