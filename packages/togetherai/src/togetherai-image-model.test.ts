import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { TogetherAIImageModel } from './togetherai-image-model';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
} = {}) {
  return new TogetherAIImageModel('stabilityai/stable-diffusion-xl', {
    provider: 'togetherai',
    baseURL: 'https://api.example.com',
    headers: headers ?? (() => ({ 'api-key': 'test-key' })),
    fetch,
    _internal: {
      currentDate,
    },
  });
}

const server = createTestServer({
  'https://api.example.com/*': {
    response: {
      type: 'json-value',
      body: {
        id: 'test-id',
        data: [{ index: 0, b64_json: 'test-base64-content' }],
        model: 'stabilityai/stable-diffusion-xl',
        object: 'list',
      },
    },
  },
});

describe('doGenerate', () => {
  it('should pass the correct parameters including size and seed', async () => {
    const model = createBasicModel();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      seed: 42,
      providerOptions: { togetherai: { additional_param: 'value' } },
      aspectRatio: undefined,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'stabilityai/stable-diffusion-xl',
      prompt,
      seed: 42,
      n: 1,
      width: 1024,
      height: 1024,
      response_format: 'base64',
      additional_param: 'value',
    });
  });

  it('should call the correct url', async () => {
    const model = createBasicModel();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      seed: 42,
      providerOptions: {},
      aspectRatio: undefined,
    });

    expect(server.calls[0].requestMethod).toStrictEqual('POST');
    expect(server.calls[0].requestUrl).toStrictEqual(
      'https://api.example.com/images/generations',
    );
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
      size: undefined,
      seed: undefined,
      providerOptions: {},
      aspectRatio: undefined,
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

  it('should handle API errors', async () => {
    server.urls['https://api.example.com/*'].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'Bad Request',
        },
      }),
    };

    const model = createBasicModel();
    await expect(
      model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        seed: undefined,
        providerOptions: {},
        aspectRatio: undefined,
      }),
    ).rejects.toMatchObject({
      message: 'Bad Request',
    });
  });

  describe('warnings', () => {
    it('should return aspectRatio warning when aspectRatio is provided', async () => {
      const model = createBasicModel();

      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 123,
        providerOptions: {},
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support the `aspectRatio` option. Use `size` instead.',
      });
    });
  });

  it('should respect the abort signal', async () => {
    const model = createBasicModel();
    const controller = new AbortController();

    const generatePromise = model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      seed: undefined,
      providerOptions: {},
      aspectRatio: undefined,
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(generatePromise).rejects.toThrow('This operation was aborted');
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
        size: undefined,
        seed: undefined,
        providerOptions: {},
        aspectRatio: undefined,
      });

      expect(result.response).toStrictEqual({
        timestamp: testDate,
        modelId: 'stabilityai/stable-diffusion-xl',
        headers: expect.any(Object),
      });
    });

    it('should include response headers from API call', async () => {
      server.urls['https://api.example.com/*'].response = {
        type: 'json-value',
        body: {
          id: 'test-id',
          data: [{ index: 0, b64_json: 'test-base64-content' }],
          model: 'stabilityai/stable-diffusion-xl',
          object: 'list',
        },
        headers: {
          'x-request-id': 'test-request-id',
          'content-length': '128',
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        seed: undefined,
        providerOptions: {},
        aspectRatio: undefined,
      });

      expect(result.response.headers).toStrictEqual({
        'x-request-id': 'test-request-id',
        'content-type': 'application/json',
        'content-length': '128',
      });
    });
  });
});

describe('constructor', () => {
  it('should expose correct provider and model information', () => {
    const model = createBasicModel();

    expect(model.provider).toBe('togetherai');
    expect(model.modelId).toBe('stabilityai/stable-diffusion-xl');
    expect(model.specificationVersion).toBe('v2');
    expect(model.maxImagesPerCall).toBe(1);
  });
});
