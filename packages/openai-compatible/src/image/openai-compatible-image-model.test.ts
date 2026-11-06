import { describe, it, expect, vi } from 'vitest';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { OpenAICompatibleImageModel } from './openai-compatible-image-model';
import type { OpenAICompatibleImageModelOptions } from './openai-compatible-image-model-options';
import { z } from 'zod/v4';
import type { ProviderErrorStructure } from '../openai-compatible-error';
import type { ImageModelV4CallOptions } from '@ai-sdk/provider';

const prompt = 'A photorealistic astronaut riding a horse';

describe.each(['generations', 'edits'])(
  'URL image responses (%s)',
  endpoint => {
    const imageUrl = 'https://cdn.example.com/image.png';
    const imageBytes = new Uint8Array([137, 80, 78, 71]);

    function setup(
      data: Array<{ b64_json?: string | null; url?: string | null }>,
      baseURL = 'https://api.example.com',
    ) {
      const fetch = vi
        .fn<FetchFunction>()
        .mockResolvedValueOnce(Response.json({ data }));
      fetch.mockImplementation(async () => new Response(imageBytes));
      const model = new OpenAICompatibleImageModel('test-model', {
        provider: 'test',
        url: ({ path }) => `${baseURL}${path}`,
        headers: () => ({ Authorization: 'Bearer test-key' }),
        fetch,
      });
      const params = createDefaultGenerateParams({
        files:
          endpoint === 'edits'
            ? [{ type: 'file', data: imageBytes, mediaType: 'image/png' }]
            : undefined,
        headers: { 'x-api-key': 'custom-key' },
      });
      return { model, fetch, params };
    }

    it('downloads URL-only images using the custom fetch and abort signal', async () => {
      const { model, fetch, params } = setup([
        { b64_json: null, url: imageUrl },
      ]);
      const abortSignal = new AbortController().signal;

      const result = await model.doGenerate({ ...params, abortSignal });

      expect(result.images).toEqual([imageBytes]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toBe(
        `https://api.example.com/images/${endpoint}`,
      );
      expect(fetch.mock.calls[1][0]).toBe(imageUrl);
      expect(fetch.mock.calls[1][1]?.method ?? 'GET').toBe('GET');
      expect(fetch.mock.calls[1][1]).toMatchObject({
        signal: abortSignal,
      });
      const downloadHeaders = new Headers(fetch.mock.calls[1][1]?.headers);
      expect(downloadHeaders.has('authorization')).toBe(false);
      expect(downloadHeaders.has('x-api-key')).toBe(false);
    });

    it('preserves order in mixed responses and prefers base64 when both are present', async () => {
      const { model, fetch, params } = setup([
        { url: imageUrl },
        { b64_json: 'AQID', url: 'https://cdn.example.com/unused.png' },
        { b64_json: 'BAUG', url: null },
      ]);

      const result = await model.doGenerate(params);

      expect(result.images).toEqual([
        imageBytes,
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('preserves base64 without downloading when both fields are present', async () => {
      const { model, fetch, params } = setup([
        { b64_json: 'AQID', url: imageUrl },
      ]);

      expect((await model.doGenerate(params)).images).toEqual(['AQID']);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([{}, { b64_json: null, url: null }])(
      'rejects responses with neither base64 nor a URL: %j',
      async image => {
        const { model, fetch, params } = setup([image]);

        await expect(model.doGenerate(params)).rejects.toMatchObject({
          name: 'AI_APICallError',
          message: 'Invalid JSON response',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );

    it('propagates image download failures', async () => {
      const { model, fetch, params } = setup([{ url: imageUrl }]);
      fetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

      await expect(model.doGenerate(params)).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: 404,
        url: imageUrl,
      });
    });

    it('propagates cancellation during download', async () => {
      const { model, fetch, params } = setup([{ url: imageUrl }]);
      const controller = new AbortController();
      const error = new DOMException('Aborted', 'AbortError');
      fetch.mockImplementationOnce(async (_url, init) => {
        controller.abort(error);
        init?.signal?.throwIfAborted();
        return new Response(imageBytes);
      });

      await expect(
        model.doGenerate({ ...params, abortSignal: controller.signal }),
      ).rejects.toBe(error);
    });

    it('rejects private download URLs before fetching them', async () => {
      const { model, fetch, params } = setup([
        { url: 'http://127.0.0.1/image.png' },
      ]);

      await expect(model.doGenerate(params)).rejects.toMatchObject({
        name: 'AI_DownloadError',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects redirects to private download URLs', async () => {
      const { model, fetch, params } = setup([{ url: imageUrl }]);
      fetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/image.png' },
        }),
      );

      await expect(model.doGenerate(params)).rejects.toMatchObject({
        name: 'AI_DownloadError',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('supports authenticated self-hosted downloads and strips credentials on cross-origin redirects', async () => {
      const baseURL = 'http://127.0.0.1:8000';
      const { model, fetch, params } = setup(
        [{ url: `${baseURL}/image.png` }],
        baseURL,
      );
      fetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: imageUrl },
        }),
      );

      expect((await model.doGenerate(params)).images).toEqual([imageBytes]);
      const sameOriginHeaders = new Headers(fetch.mock.calls[1][1]?.headers);
      expect(sameOriginHeaders.get('authorization')).toBe('Bearer test-key');
      expect(sameOriginHeaders.get('x-api-key')).toBe('custom-key');
      const redirectedHeaders = new Headers(fetch.mock.calls[2][1]?.headers);
      expect(redirectedHeaders.has('authorization')).toBe(false);
      expect(redirectedHeaders.has('x-api-key')).toBe(false);
    });
  },
);

function createBasicModel({
  headers,
  fetch,
  currentDate,
  errorStructure,
}: {
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  errorStructure?: ProviderErrorStructure<any>;
} = {}) {
  return new OpenAICompatibleImageModel('dall-e-3', {
    provider: 'openai-compatible',
    headers: headers ?? (() => ({ Authorization: 'Bearer test-key' })),
    url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
    fetch,
    errorStructure,
    _internal: {
      currentDate,
    },
  });
}

function createDefaultGenerateParams(overrides = {}): ImageModelV4CallOptions {
  return {
    prompt: 'A photorealistic astronaut riding a horse',
    files: undefined,
    mask: undefined,
    n: 1,
    size: '1024x1024',
    aspectRatio: undefined,
    seed: undefined,
    providerOptions: {},
    headers: {},
    abortSignal: undefined,
    ...overrides,
  };
}

describe('OpenAICompatibleImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/dall-e-3/images/generations': {
      response: {
        type: 'json-value',
        body: {
          data: [
            {
              b64_json: 'test1234',
            },
            {
              b64_json: 'test5678',
            },
          ],
        },
      },
    },
    'https://external.api.recraft.ai/v1/images/generations': {
      response: {
        type: 'json-value',
        body: {
          data: [
            {
              b64_json: 'recraft-test-image',
            },
          ],
        },
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('openai-compatible');
      expect(model.modelId).toBe('dall-e-3');
      expect(model.specificationVersion).toBe('v4');
      expect(model.maxImagesPerCall).toBe(10);
      expect(model.supportsFileInputs).toBeUndefined();
      expect(model.supportsMaskInputs).toBeUndefined();
    });
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters', async () => {
      const model = createBasicModel();

      await model.doGenerate(
        createDefaultGenerateParams({
          n: 2,
          providerOptions: {
            openaiCompatible: {
              quality: 'hd',
            } satisfies OpenAICompatibleImageModelOptions,
          },
        }),
      );

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 2,
        size: '1024x1024',
        quality: 'hd',
      });
    });

    it('should use provider name from config for providerOptions key', async () => {
      const recraftModel = new OpenAICompatibleImageModel('recraft-v3', {
        provider: 'recraft.image',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        url: ({ modelId, path }) => `https://external.api.recraft.ai/v1${path}`,
      });

      await recraftModel.doGenerate(
        createDefaultGenerateParams({
          prompt: 'A beautiful sunset',
          providerOptions: {
            recraft: {
              style: 'vector_illustration',
            } satisfies OpenAICompatibleImageModelOptions,
          },
        }),
      );

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'recraft-v3',
        prompt: 'A beautiful sunset',
        n: 1,
        size: '1024x1024',
        style: 'vector_illustration',
      });
    });

    it('should pass typed image output options', async () => {
      const model = createBasicModel();

      await model.doGenerate(
        createDefaultGenerateParams({
          providerOptions: {
            openaiCompatible: {
              size: 'auto',
              quality: 'high',
              output_format: 'jpeg',
              output_compression: 80,
              background: 'opaque',
            } satisfies OpenAICompatibleImageModelOptions,
          },
        }),
      );

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: 'auto',
        quality: 'high',
        output_format: 'jpeg',
        output_compression: 80,
        background: 'opaque',
      });
    });

    it('should emit deprecated warning when raw provider options key is used for hyphenated provider', async () => {
      const model = new OpenAICompatibleImageModel('dall-e-3', {
        provider: 'black-forest-labs.image',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
      });

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          providerOptions: {
            'black-forest-labs': { quality: 'hd' },
          },
        }),
      );

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "message": "Use 'blackForestLabs' instead.",
            "setting": "providerOptions key 'black-forest-labs'",
            "type": "deprecated",
          },
        ]
      `);
    });

    it('should not emit deprecated warning when camelCase provider options key is used', async () => {
      const model = new OpenAICompatibleImageModel('dall-e-3', {
        provider: 'black-forest-labs.image',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
      });

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          providerOptions: {
            blackForestLabs: { quality: 'hd' },
          },
        }),
      );

      expect(result.warnings).toMatchInlineSnapshot(`[]`);
    });

    it('should add warnings for unsupported settings', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          aspectRatio: '16:9',
          seed: 123,
        }),
      );

      expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "This model does not support aspect ratio. Use \`size\` instead.",
            "feature": "aspectRatio",
            "type": "unsupported",
          },
          {
            "feature": "seed",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await modelWithHeaders.doGenerate(
        createDefaultGenerateParams({
          headers: {
            'Custom-Request-Header': 'request-header-value',
          },
        }),
      );

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should handle API errors with custom error structure', async () => {
      // Define a custom error schema different from OpenAI's format
      const customErrorSchema = z.object({
        status: z.string(),
        details: z.object({
          errorMessage: z.string(),
          errorCode: z.number(),
        }),
      });

      server.urls[
        'https://api.example.com/dall-e-3/images/generations'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          status: 'error',
          details: {
            errorMessage: 'Custom provider error format',
            errorCode: 1234,
          },
        }),
      };

      const model = createBasicModel({
        errorStructure: {
          errorSchema: customErrorSchema,
          errorToMessage: data =>
            `Error ${data.details.errorCode}: ${data.details.errorMessage}`,
        },
      });

      await expect(
        model.doGenerate(createDefaultGenerateParams()),
      ).rejects.toMatchObject({
        message: 'Error 1234: Custom provider error format',
        statusCode: 400,
        url: 'https://api.example.com/dall-e-3/images/generations',
      });
    });

    it('should handle API errors with default error structure', async () => {
      server.urls[
        'https://api.example.com/dall-e-3/images/generations'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid prompt content',
            type: 'invalid_request_error',
            param: null,
            code: null,
          },
        }),
      };

      const model = createBasicModel();

      await expect(
        model.doGenerate(createDefaultGenerateParams()),
      ).rejects.toMatchObject({
        message: 'Invalid prompt content',
        statusCode: 400,
        url: 'https://api.example.com/dall-e-3/images/generations',
      });
    });

    it('should return the raw b64_json content', async () => {
      const model = createBasicModel();
      const result = await model.doGenerate(
        createDefaultGenerateParams({
          n: 2,
        }),
      );

      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('test1234');
      expect(result.images[1]).toBe('test5678');
    });

    describe('usage', () => {
      it('should map the usage object reported by the provider', async () => {
        server.urls[
          'https://api.example.com/dall-e-3/images/generations'
        ].response = {
          type: 'json-value',
          body: {
            data: [{ b64_json: 'test1234' }],
            usage: {
              input_tokens: 12,
              output_tokens: 4,
              total_tokens: 16,
            },
          },
        };

        const model = createBasicModel();
        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.usage).toStrictEqual({
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 16,
        });
      });

      it('should return undefined usage when the provider omits it', async () => {
        const model = createBasicModel();
        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.usage).toBeUndefined();
      });

      it('should map null usage fields to undefined', async () => {
        server.urls[
          'https://api.example.com/dall-e-3/images/generations'
        ].response = {
          type: 'json-value',
          body: {
            data: [{ b64_json: 'test1234' }],
            usage: {
              input_tokens: 7,
              output_tokens: null,
              total_tokens: null,
            },
          },
        };

        const model = createBasicModel();
        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.usage).toStrictEqual({
          inputTokens: 7,
          outputTokens: undefined,
          totalTokens: undefined,
        });
      });

      it('should ignore unknown usage fields', async () => {
        server.urls[
          'https://api.example.com/dall-e-3/images/generations'
        ].response = {
          type: 'json-value',
          body: {
            data: [{ b64_json: 'test1234' }],
            usage: {
              input_tokens: 3,
              output_tokens: 1,
              total_tokens: 4,
              input_tokens_details: { image_tokens: 2, text_tokens: 1 },
            },
          },
        };

        const model = createBasicModel();
        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.usage).toStrictEqual({
          inputTokens: 3,
          outputTokens: 1,
          totalTokens: 4,
        });
      });
    });

    describe('response metadata', () => {
      it('should include timestamp, headers and modelId in response', async () => {
        const testDate = new Date('2024-01-01T00:00:00Z');
        const model = createBasicModel({
          currentDate: () => testDate,
        });

        const result = await model.doGenerate(createDefaultGenerateParams());

        expect(result.response).toStrictEqual({
          timestamp: testDate,
          modelId: 'dall-e-3',
          headers: expect.any(Object),
        });
      });
    });

    it('should use real date when no custom date provider is specified', async () => {
      const beforeDate = new Date();

      const model = new OpenAICompatibleImageModel('dall-e-3', {
        provider: 'openai-compatible',
        headers: () => ({ Authorization: 'Bearer test-key' }),
        url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
      });

      const result = await model.doGenerate(createDefaultGenerateParams());

      const afterDate = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeDate.getTime(),
      );
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
        afterDate.getTime(),
      );
      expect(result.response.modelId).toBe('dall-e-3');
    });

    it('should pass the user setting in the request', async () => {
      const model = createBasicModel();

      await model.doGenerate(
        createDefaultGenerateParams({
          providerOptions: {
            openaiCompatible: {
              user: 'test-user-id',
            },
          },
        }),
      );

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        user: 'test-user-id',
      });
    });

    it('should not include user field in request when not set via provider options', async () => {
      const model = createBasicModel();

      await model.doGenerate(
        createDefaultGenerateParams({
          providerOptions: {
            openaiCompatible: {},
          },
        }),
      );

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).toStrictEqual({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
      });
      expect(requestBody).not.toHaveProperty('user');
    });
  });

  describe('Image Editing', () => {
    const editServer = createTestServer({
      'https://api.example.com/dall-e-3/images/edits': {
        response: {
          type: 'json-value',
          body: {
            data: [{ b64_json: 'edited-image-base64' }],
          },
        },
      },
    });

    it('should send edit request with files', async () => {
      const model = createBasicModel();

      // Use Uint8Array for test data to avoid base64 decoding issues
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Turn the cat into a dog',
          files: [
            {
              type: 'file',
              data: imageData,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.images).toStrictEqual(['edited-image-base64']);
      expect(editServer.calls[0].requestUrl).toBe(
        'https://api.example.com/dall-e-3/images/edits',
      );
    });

    it('should send edit request with files and mask', async () => {
      const model = createBasicModel();

      // Use Uint8Array for test data
      const imageData = new Uint8Array([137, 80, 78, 71]);
      const maskData = new Uint8Array([137, 80, 78, 71]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Add a flamingo to the pool',
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
        }),
      );

      expect(result.images).toStrictEqual(['edited-image-base64']);
      expect(editServer.calls[0].requestUrl).toBe(
        'https://api.example.com/dall-e-3/images/edits',
      );
    });

    it('should send edit request with Uint8Array data', async () => {
      const model = createBasicModel();

      const imageUint8Array = new Uint8Array([104, 101, 108, 108, 111]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Edit this image',
          files: [
            {
              type: 'file',
              data: imageUint8Array,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.images).toStrictEqual(['edited-image-base64']);
    });

    it('should send edit request with multiple images', async () => {
      const model = createBasicModel();

      const image1 = new Uint8Array([137, 80, 78, 71]);
      const image2 = new Uint8Array([137, 80, 78, 71]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Combine these images',
          files: [
            {
              type: 'file',
              data: image1,
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: image2,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.images).toStrictEqual(['edited-image-base64']);
    });

    it('should include response metadata for edit requests', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createBasicModel({
        currentDate: () => testDate,
      });

      const imageData = new Uint8Array([137, 80, 78, 71]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Edit this image',
          files: [
            {
              type: 'file',
              data: imageData,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'dall-e-3',
        headers: expect.any(Object),
      });
    });

    it('should map usage for edit requests', async () => {
      editServer.urls[
        'https://api.example.com/dall-e-3/images/edits'
      ].response = {
        type: 'json-value',
        body: {
          data: [{ b64_json: 'edited-image-base64' }],
          usage: {
            input_tokens: 20,
            output_tokens: 5,
            total_tokens: 25,
          },
        },
      };

      const model = createBasicModel();
      const imageData = new Uint8Array([137, 80, 78, 71]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Edit this image',
          files: [
            {
              type: 'file',
              data: imageData,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.usage).toStrictEqual({
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25,
      });
    });

    it('should return undefined usage for edit requests when omitted', async () => {
      const model = createBasicModel();
      const imageData = new Uint8Array([137, 80, 78, 71]);

      const result = await model.doGenerate(
        createDefaultGenerateParams({
          prompt: 'Edit this image',
          files: [
            {
              type: 'file',
              data: imageData,
              mediaType: 'image/png',
            },
          ],
        }),
      );

      expect(result.usage).toBeUndefined();
    });
  });
});
