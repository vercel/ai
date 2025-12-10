import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  GoogleGenerativeAIImageModel,
  GoogleGenerativeAIImageProviderOptions,
} from './google-generative-ai-image-model';
import { describe, it, expect } from 'vitest';

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
        files: undefined,
        mask: undefined,
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

    it('should combine aspectRatio and provider options', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt: 'test prompt',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '1:1',
        seed: undefined,
        providerOptions: {
          google: {
            personGeneration: 'dont_allow',
          } satisfies GoogleGenerativeAIImageProviderOptions,
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
            "aspectRatio": "1:1",
            "personGeneration": "dont_allow",
            "sampleCount": 1,
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
          {
            "details": "This model does not support the \`seed\` option through this provider.",
            "feature": "seed",
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
          google: {
            // @ts-expect-error Testing invalid option
            addWatermark: false,
            personGeneration: 'allow_all',
            // @ts-expect-error Testing invalid option
            foo: 'bar',
            // @ts-expect-error Testing invalid option
            negativePrompt: 'negative prompt',
          } satisfies GoogleGenerativeAIImageProviderOptions,
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
            "aspectRatio": "16:9",
            "personGeneration": "allow_all",
            "sampleCount": 2,
          },
        }
      `);
    });
  });

  describe('Image Editing', () => {
    function prepareEditResponse({
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
          predictions: [{ bytesBase64Encoded: 'edited-base64-image' }],
        },
      };
    }

    it('should send edit request with files and mask', async () => {
      prepareEditResponse();

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
      prepareEditResponse();

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
      prepareEditResponse();

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
          google: {
            edit: {
              mode: 'EDIT_MODE_INPAINT_REMOVAL',
              baseSteps: 50,
              maskMode: 'MASK_MODE_USER_PROVIDED',
              maskDilation: 0.01,
            },
          } satisfies GoogleGenerativeAIImageProviderOptions,
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
      prepareEditResponse();

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

    it('should send edit request without mask', async () => {
      prepareEditResponse();

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
          google: {
            edit: { mode: 'EDIT_MODE_CONTROLLED_EDITING' },
          } satisfies GoogleGenerativeAIImageProviderOptions,
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
});
