import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from './openai-provider';
import { OpenAIImageModel } from './openai-image-model';

const prompt = 'A cute baby sea otter';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.image('dall-e-3', { maxImagesPerCall: 2 });

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/images/generations',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse() {
    server.responseBodyJson = {
      created: 1733837122,
      data: [
        {
          revised_prompt:
            'A charming visual illustration of a baby sea otter swimming joyously.',
          b64_json: 'base64-image-1',
        },
        {
          b64_json: 'base64-image-2',
        },
      ],
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { style: 'vivid' } },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      style: 'vivid',
      response_format: 'b64_json',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('dall-e-3').doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: { openai: { style: 'vivid' } },
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });

  it('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
  });

  it('should return warnings for unsupported settings', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 123,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
      {
        type: 'unsupported-setting',
        setting: 'seed',
      },
    ]);
  });

  it('should respect maxImagesPerCall setting', async () => {
    prepareJsonResponse();

    const customModel = provider.image('dall-e-2', { maxImagesPerCall: 5 });
    expect(customModel.maxImagesPerCall).toBe(5);

    const defaultModel = provider.image('dall-e-2');
    expect(defaultModel.maxImagesPerCall).toBe(10); // dall-e-2's default from settings

    const unknownModel = provider.image('unknown-model' as any);
    expect(unknownModel.maxImagesPerCall).toBe(1); // fallback for unknown models
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareJsonResponse();
    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new OpenAIImageModel(
      'dall-e-3',
      {},
      {
        provider: 'test-provider',
        url: () => 'https://api.openai.com/v1/images/generations',
        headers: () => ({}),
        _internal: {
          currentDate: () => testDate,
        },
      },
    );

    server.responseHeaders = {
      'x-request-id': 'test-request-id',
      'x-ratelimit-remaining': '123',
    };

    const result = await customModel.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(result.response).toStrictEqual({
      timestamp: testDate,
      modelId: 'dall-e-3',
      headers: {
        'content-length': '180',
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareJsonResponse();
    const beforeDate = new Date();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
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
    expect(result.response.modelId).toBe('dall-e-3');
  });
});
