import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { DecartImageModel } from './decart-image-model';
import { createDecart } from './decart-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt = 'A cute baby sea otter';

const provider = createDecart({ apiKey: 'test-api-key' });
const model = provider.image('lucy-pro-t2i');

const server = createTestServer({
  'https://api.decart.ai/v1/generate/lucy-pro-t2i': {},
});

describe('doGenerate', () => {
  function prepareBinaryResponse({
    headers,
  }: {
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.decart.ai/v1/generate/lucy-pro-t2i'].response = {
      type: 'binary',
      headers,
      body: Buffer.from('test-binary-image-data'),
    };
  }

  it('should pass the prompt in FormData', async () => {
    prepareBinaryResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    const requestBody = await server.calls[0].requestBodyMultipart;
    expect(requestBody).toStrictEqual({
      prompt,
    });
  });

  it('should pass seed in FormData when provided', async () => {
    prepareBinaryResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: 12345,
      providerOptions: {},
    });

    const requestBody = await server.calls[0].requestBodyMultipart;
    expect(requestBody).toStrictEqual({
      prompt,
      seed: '12345',
    });
  });

  it('should pass headers', async () => {
    prepareBinaryResponse();

    const provider = createDecart({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('lucy-pro-t2i').doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'x-api-key': 'test-api-key',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      `ai-sdk/decart/0.0.0-test`,
    );
  });

  it('should extract the generated image as binary', async () => {
    prepareBinaryResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toBeInstanceOf(Uint8Array);
    const imageBuffer = result.images[0] as Uint8Array;
    expect(Buffer.from(imageBuffer).toString()).toBe('test-binary-image-data');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareBinaryResponse({
      headers: {
        'x-request-id': 'test-request-id',
      },
    });

    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new DecartImageModel('lucy-pro-t2i', {
      provider: 'test-provider',
      baseURL: 'https://api.decart.ai',
      url: ({ path, modelId }) => `https://api.decart.ai/${path}/${modelId}`,
      headers: () => ({ 'x-api-key': 'test-key' }),
      _internal: {
        currentDate: () => testDate,
      },
    });

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
      modelId: 'lucy-pro-t2i',
      headers: expect.objectContaining({
        'x-request-id': 'test-request-id',
      }),
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareBinaryResponse();
    const beforeDate = new Date();

    const result = await model.doGenerate({
      prompt,
      n: 1,
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
    expect(result.response.modelId).toBe('lucy-pro-t2i');
  });

  it('should return warnings for unsupported settings', async () => {
    prepareBinaryResponse();

    const result = await model.doGenerate({
      prompt,
      n: 2,
      size: '1024x1024',
      aspectRatio: '4:3',
      seed: undefined,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'size',
      },
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: 'Only 16:9 and 9:16 aspect ratios are supported.',
      },
    ]);
  });

  it('should not warn for n=1', async () => {
    prepareBinaryResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([]);
  });

  it('should convert aspectRatio 16:9 to landscape orientation', async () => {
    prepareBinaryResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: '16:9',
      seed: undefined,
      providerOptions: {},
    });

    const requestBody = await server.calls[0].requestBodyMultipart;
    expect(requestBody).toStrictEqual({
      prompt,
      orientation: 'landscape',
    });
  });

  it('should convert aspectRatio 9:16 to portrait orientation', async () => {
    prepareBinaryResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: '9:16',
      seed: undefined,
      providerOptions: {},
    });

    const requestBody = await server.calls[0].requestBodyMultipart;
    expect(requestBody).toStrictEqual({
      prompt,
      orientation: 'portrait',
    });
  });
});

describe('constructor', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('decart.image');
    expect(model.modelId).toBe('lucy-pro-t2i');
    expect(model.specificationVersion).toBe('v3');
    expect(model.maxImagesPerCall).toBe(1);
  });
});
