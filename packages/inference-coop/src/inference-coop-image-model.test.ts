import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createInferenceCoop } from './inference-coop-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createInferenceCoop({ apiKey: 'test-api-key' });
const model = provider.image('regolo/qwen-image');
const url = 'https://gateway.inference.coop/v1/images/generations';

const server = createTestServer({
  [url]: {},
});

// Structure captured from the gateway (2026-11): base64-encoded JPEGs with
// `url` null, plus an (all-zero) usage block.
function prepareImageResponse({
  headers,
}: {
  headers?: Record<string, string>;
} = {}) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body: {
      created: 1793582476,
      background: null,
      data: [
        {
          b64_json: 'AQIDBA==',
          revised_prompt: null,
          url: null,
        },
      ],
      output_format: null,
      quality: null,
      size: null,
      usage: {
        total_tokens: 0,
        input_tokens: 0,
        input_tokens_details: { image_tokens: 0, text_tokens: 0 },
        output_tokens: 0,
        output_tokens_details: null,
      },
    },
  };
  return ['AQIDBA=='];
}

describe('InferenceCoopImageModel', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('inference-coop.image');
    expect(model.modelId).toBe('regolo/qwen-image');
    expect(model.specificationVersion).toBe('v4');
  });
});

describe('doGenerate', () => {
  it('should pass the prompt to the /images/generations endpoint', async () => {
    prepareImageResponse();

    await model.doGenerate({
      prompt: 'a red circle on a white background',
      n: 1,
      size: '512x512',
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'regolo/qwen-image',
      prompt: 'a red circle on a white background',
      n: 1,
      size: '512x512',
    });
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
  });

  it('should pass headers and the co-op user agent', async () => {
    prepareImageResponse();

    const customProvider = createInferenceCoop({
      apiKey: 'test-api-key',
      headers: { 'Custom-Provider-Header': 'provider-header-value' },
    });

    await customProvider.image('regolo/qwen-image').doGenerate({
      prompt: 'a red circle',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
      headers: { 'Custom-Request-Header': 'request-header-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk-inference-coop/0.0.0-test',
    );
  });

  it('should return base64 images unchanged', async () => {
    const images = prepareImageResponse();

    const result = await model.doGenerate({
      prompt: 'a red circle',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(images);
    expect(result.warnings).toEqual([]);
  });

  it('should include response timestamp, model id, and headers', async () => {
    prepareImageResponse({ headers: { 'x-request-id': 'test-request-id' } });

    const result = await model.doGenerate({
      prompt: 'a red circle',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
    });

    expect(result.response).toMatchObject({
      modelId: 'regolo/qwen-image',
      headers: expect.objectContaining({ 'x-request-id': 'test-request-id' }),
    });
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('should handle API errors', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'Invalid model name passed in model=regolo/qwen-imge.',
          type: 'invalid_request_error',
        },
      }),
    };

    await expect(
      model.doGenerate({
        prompt: 'a red circle',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      }),
    ).rejects.toMatchObject({
      message: 'Invalid model name passed in model=regolo/qwen-imge.',
      statusCode: 400,
    });
  });
});
