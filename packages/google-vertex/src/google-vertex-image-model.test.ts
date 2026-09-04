import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { GoogleVertexImageModel } from './google-vertex-image-model';
import type { GoogleVertexImageModelOptions } from './google-vertex-image-model-options';

const TEST_URL =
  'https://api.example.com/models/gemini-2.5-flash-image:generateContent';

const server = createTestServer({
  [TEST_URL]: {},
});

const model = new GoogleVertexImageModel('gemini-2.5-flash-image', {
  provider: 'google.vertex.image',
  baseURL: 'https://api.example.com',
  headers: { 'api-key': 'test-key' },
});

function prepareJsonResponse({
  images = [{ mimeType: 'image/png', data: 'base64-generated-image' }],
  usage = {
    promptTokenCount: 10,
    candidatesTokenCount: 100,
    totalTokenCount: 110,
  },
  headers,
}: {
  images?: Array<{ mimeType: string; data: string }>;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  headers?: Record<string, string>;
} = {}) {
  server.urls[TEST_URL].response = {
    type: 'json-value',
    headers,
    body: {
      candidates: [
        {
          content: {
            parts: images.map(image => ({
              inlineData: {
                mimeType: image.mimeType,
                data: image.data,
              },
            })),
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: usage,
    },
  };
}

describe('GoogleVertexImageModel', () => {
  it('should return 10 for maxImagesPerCall', () => {
    expect(model.maxImagesPerCall).toBe(10);
  });

  describe('doGenerate', () => {
    it('should reject non-Gemini model IDs before sending a request', async () => {
      const nonGeminiModel = new GoogleVertexImageModel('legacy-image-model', {
        provider: 'google.vertex.image',
        baseURL: 'https://api.example.com',
        headers: { 'api-key': 'test-key' },
      });

      await expect(
        nonGeminiModel.doGenerate({
          prompt: 'A beautiful sunset',
          files: undefined,
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(
        'Google image models other than Gemini are no longer supported. Use a model ID that starts with `gemini-`.',
      );

      expect(server.calls).toHaveLength(0);
    });

    it('should use the language model endpoint and extract generated images', async () => {
      prepareJsonResponse({});

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(server.calls[0].requestUrl).toBe(TEST_URL);
      expect(result.images).toStrictEqual(['base64-generated-image']);
      expect(result.providerMetadata).toStrictEqual({
        googleVertex: { images: [{}] },
        vertex: { images: [{}] },
      });
    });

    it('should send response modalities, aspect ratio, seed, and headers', async () => {
      prepareJsonResponse({});
      const modelWithHeaders = new GoogleVertexImageModel(
        'gemini-2.5-flash-image',
        {
          provider: 'google.vertex.image',
          baseURL: 'https://api.example.com',
          headers: {
            'Custom-Provider-Header': 'provider-header-value',
          },
        },
      );

      await modelWithHeaders.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '21:9',
        seed: 12345,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "contents": [
            {
              "parts": [
                {
                  "text": "A beautiful sunset",
                },
              ],
              "role": "user",
            },
          ],
          "generationConfig": {
            "imageConfig": {
              "aspectRatio": "21:9",
            },
            "responseModalities": [
              "IMAGE",
            ],
            "seed": 12345,
          },
        }
      `);
    });

    it('should accept the legacy vertex options key and prefer googleVertex', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: '16:9',
        seed: undefined,
        providerOptions: {
          googleVertex: {
            imageConfig: { imageSize: '4K' },
          } satisfies GoogleVertexImageModelOptions,
          vertex: {
            imageConfig: { imageSize: '2K' },
          } satisfies GoogleVertexImageModelOptions,
        },
      });

      expect(
        (await server.calls[0].requestBodyJson).generationConfig.imageConfig,
      ).toStrictEqual({ aspectRatio: '16:9', imageSize: '4K' });

      prepareJsonResponse({});
      await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {
          vertex: {
            imageConfig: { imageSize: '2K' },
          } satisfies GoogleVertexImageModelOptions,
        },
      });

      expect(
        (await server.calls[1].requestBodyJson).generationConfig.imageConfig,
      ).toStrictEqual({ imageSize: '2K' });
    });

    it('should include usage and response metadata', async () => {
      prepareJsonResponse({
        usage: {
          promptTokenCount: 20,
          candidatesTokenCount: 200,
          totalTokenCount: 220,
        },
        headers: { 'request-id': 'test-request-id' },
      });
      const testDate = new Date('2024-03-15T12:00:00Z');
      const customModel = new GoogleVertexImageModel('gemini-2.5-flash-image', {
        provider: 'google.vertex.image',
        baseURL: 'https://api.example.com',
        headers: { 'api-key': 'test-key' },
        _internal: { currentDate: () => testDate },
      });

      const result = await customModel.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.usage).toStrictEqual({
        inputTokens: 20,
        outputTokens: 200,
        totalTokens: 220,
      });
      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'gemini-2.5-flash-image',
        headers: expect.objectContaining({
          'request-id': 'test-request-id',
        }),
      });
    });

    it('should return a warning for the unsupported size option', async () => {
      prepareJsonResponse({});

      const result = await model.doGenerate({
        prompt: 'A beautiful sunset',
        files: undefined,
        mask: undefined,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      });

      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'size',
          details:
            'This model does not support the `size` option. Use `aspectRatio` instead.',
        },
      ]);
    });

    it('should include input images for editing', async () => {
      prepareJsonResponse({});

      await model.doGenerate({
        prompt: 'Add a hat to this cat',
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
        providerOptions: {},
      });

      expect((await server.calls[0].requestBodyJson).contents).toStrictEqual([
        {
          role: 'user',
          parts: [
            { text: 'Add a hat to this cat' },
            {
              inlineData: {
                mimeType: 'image/png',
                data: 'base64-source-image',
              },
            },
          ],
        },
      ]);
    });

    it('should reject unsupported URL editing input, multiple images, and masks', async () => {
      prepareJsonResponse({});

      await expect(
        model.doGenerate({
          prompt: 'Add a hat to this cat',
          files: [{ type: 'url', url: 'https://example.com/cat.png' }],
          mask: undefined,
          n: 1,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(/media type "image\/\*".*not passed as inline bytes/);

      await expect(
        model.doGenerate({
          prompt: 'A beautiful sunset',
          files: undefined,
          mask: undefined,
          n: 2,
          size: undefined,
          aspectRatio: undefined,
          seed: undefined,
          providerOptions: {},
        }),
      ).rejects.toThrow(
        'Gemini image models do not support generating a set number of images per call.',
      );

      await expect(
        model.doGenerate({
          prompt: 'Edit this image',
          files: undefined,
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
        }),
      ).rejects.toThrow(
        'Gemini image models do not support mask-based image editing.',
      );
    });
  });
});
