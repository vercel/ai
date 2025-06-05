import { FetchFunction } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { AimlapiImageModel } from './aimlapi-image-model';
import { AimlapiImageSettings } from './aimlapi-image-settings';

const prompt = 'A cute baby sea otter';

function createBasicModel({
  headers,
  fetch,
  currentDate,
  settings,
}: {
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  currentDate?: () => Date;
  settings?: AimlapiImageSettings;
} = {}) {
  return new AimlapiImageModel(
    'dall-e-2',
    settings ?? {},
    {
      provider: 'aimlapi',
      baseURL: 'https://api.example.com',
      headers: headers ?? (() => ({ 'api-key': 'test-key' })),
      fetch,
      _internal: {
        currentDate,
      },
    },
  );
}

const server = createTestServer({
  'https://api.example.com/*': {
    response: {
      type: 'binary',
      body: Buffer.from('test-binary-content'),
    },
  },
});

describe('doGenerate', () => {
  it('should pass the correct parameters including aspect ratio and seed', async () => {
    const model = createBasicModel();

    await model.doGenerate({
      prompt,
      n: 1,
      aspectRatio: '16:9',
      seed: 42,
      providerOptions: { aimlapi: { additional_param: 'value' } },
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      prompt,
      aspect_ratio: '16:9',
      seed: 42,
      additional_param: 'value',
    });
  });

  it('should call the correct url', async () => {
    const model = createBasicModel();

    await model.doGenerate({
      prompt,
      n: 1,
      providerOptions: {},
    });

    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(
      'https://api.example.com/images/generations'
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

  it('should handle API errors', async () => {
    server.urls['https://api.example.com/*'].response = {
      type: 'error',
      status: 400,
      body: 'Bad Request',
    };

    const model = createBasicModel();
    await expect(
      model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
      }),
    ).rejects.toMatchObject({
      message: 'Bad Request',
    });
  });

  it('should respect the abort signal', async () => {
    const model = createBasicModel();
    const controller = new AbortController();

    const generatePromise = model.doGenerate({
      prompt,
      n: 1,
      providerOptions: {},
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
        providerOptions: {},
      });

      expect(result.response).toMatchObject({
        timestamp: testDate,
        modelId: 'dall-e-2',
        headers: expect.any(Object),
      });
    });

    it('should include response headers from API call', async () => {

      server.urls['https://api.example.com/*'].response = {
        type: 'binary',
        body: Buffer.from('test-binary-content'),
        headers: {
          'x-request-id': 'test-request-id',
          'content-type': 'image/png',
        },
      };

      const model = createBasicModel();
      const result = await model.doGenerate({
        prompt,
        n: 1,
        providerOptions: {},
      });

      expect(result.response.headers).toMatchObject({
        'x-request-id': 'test-request-id',
        'content-type': 'image/png',
        'content-length': '19',
      });
    });
  });
});
