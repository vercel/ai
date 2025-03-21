import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { XaiImageModel } from './xai-image-model';

const prompt = 'A photorealistic astronaut riding a horse';

function createBasicModel({
  headers,
  fetch,
  currentDate,
  settings,
}: {
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  settings?: any;
} = {}) {
  return new XaiImageModel('grok-2-image', settings ?? {}, {
    provider: 'xai',
    headers: headers ?? (() => ({ Authorization: 'Bearer test-key' })),
    url: ({ modelId, path }) => `https://api.example.com/${modelId}${path}`,
    fetch,
    _internal: {
      currentDate,
    },
  });
}

describe('XaiImageModel', () => {
  const server = createTestServer({
    'https://api.example.com/grok-2-image/images/generations': {
      response: {
        type: 'json-value',
        body: {
          data: [
            {
              b64_json: 'data:image/png;base64,test1234',
            },
            {
              b64_json: 'data:image/png;base64,test5678',
            },
          ],
        },
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createBasicModel();

      expect(model.provider).toBe('xai');
      expect(model.modelId).toBe('grok-2-image');
      expect(model.specificationVersion).toBe('v1');
      expect(model.maxImagesPerCall).toBe(10);
    });

    it('should use maxImagesPerCall from settings', () => {
      const model = createBasicModel({
        settings: {
          maxImagesPerCall: 5,
        },
      });

      expect(model.maxImagesPerCall).toBe(5);
    });

    it('should default maxImagesPerCall to 10 when not specified', () => {
      const model = createBasicModel();

      expect(model.maxImagesPerCall).toBe(10);
    });
  });

  describe('doGenerate', () => {
    it('should pass the correct parameters', async () => {
      const model = createBasicModel();

      await model.doGenerate({
        prompt,
        n: 2,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: { openai: { quality: 'hd' } },
        headers: {},
        abortSignal: undefined,
      });

      expect(await server.calls[0].requestBody).toStrictEqual({
        model: 'grok-2-image',
        prompt,
        n: 2,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'b64_json',
      });
    });

    it('should add warnings for unsupported settings', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: '16:9',
        seed: 123,
        providerOptions: {},
        headers: {},
        abortSignal: undefined,
      });

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'seed',
      });
    });

    it('should pass headers', async () => {
      const modelWithHeaders = createBasicModel({
        headers: () => ({
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await modelWithHeaders.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
        size: '1024x1024',
        seed: undefined,
        aspectRatio: undefined,
        abortSignal: undefined,
      });

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should handle API errors', async () => {
      server.urls[
        'https://api.example.com/grok-2-image/images/generations'
      ].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          code: 'invalid_request_error',
          error: 'Invalid prompt content',
        }),
      };

      const model = createBasicModel();
      await expect(
        model.doGenerate({
          prompt,
          n: 1,
          providerOptions: {},
          size: '1024x1024',
          seed: undefined,
          aspectRatio: undefined,
          headers: {},
          abortSignal: undefined,
        }),
      ).rejects.toMatchObject({
        message: 'Invalid prompt content',
        statusCode: 400,
        url: 'https://api.example.com/grok-2-image/images/generations',
      });
    });

    it('should strip data URI scheme prefix from b64 content', async () => {
      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: '1024x1024',
        providerOptions: {},
        headers: {},
        abortSignal: undefined,
        aspectRatio: undefined,
        seed: undefined,
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('test1234');
      expect(result.images[1]).toBe('test5678');
    });

    it('should handle b64 content without data URI scheme prefix', async () => {
      server.urls[
        'https://api.example.com/grok-2-image/images/generations'
      ].response = {
        type: 'json-value',
        body: {
          data: [
            {
              b64_json: 'SGVsbG8gV29ybGQh', // Base64 for "Hello World!"
            },
            {
              b64_json: 'QUkgU0RLIFRlc3Rpbmc=', // Base64 for "AI SDK Testing"
            },
          ],
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: '1024x1024',
        providerOptions: {},
        headers: {},
        abortSignal: undefined,
        aspectRatio: undefined,
        seed: undefined,
      });

      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe('SGVsbG8gV29ybGQh');
      expect(result.images[1]).toBe('QUkgU0RLIFRlc3Rpbmc=');
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
          size: '1024x1024',
          seed: undefined,
          aspectRatio: undefined,
          headers: {},
          abortSignal: undefined,
        });

        expect(result.response).toStrictEqual({
          timestamp: testDate,
          modelId: 'grok-2-image',
          headers: expect.any(Object),
        });
      });
    });

    it('should respect maxImagesPerCall setting', async () => {
      const customModel = createBasicModel({
        settings: { maxImagesPerCall: 5 },
      });
      expect(customModel.maxImagesPerCall).toBe(5);

      const defaultModel = createBasicModel();
      expect(defaultModel.maxImagesPerCall).toBe(10); // default for XAI models
    });

    it('should use real date when no custom date provider is specified', async () => {
      const beforeDate = new Date();

      const model = new XaiImageModel(
        'grok-2-image',
        {},
        {
          provider: 'xai',
          headers: () => ({ Authorization: 'Bearer test-key' }),
          url: ({ modelId, path }) =>
            `https://api.example.com/${modelId}${path}`,
        },
      );

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
        headers: {},
        abortSignal: undefined,
      });

      const afterDate = new Date();

      expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeDate.getTime(),
      );
      expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
        afterDate.getTime(),
      );
      expect(result.response.modelId).toBe('grok-2-image');
    });
  });
});
