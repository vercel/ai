import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createAmazonBedrock } from './bedrock-provider';
import { BedrockImageModel } from './bedrock-image-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const prompt = 'A cute baby sea otter';

const provider = createAmazonBedrock();
const fakeFetchWithAuth = injectFetchHeaders({ 'x-amz-auth': 'test-auth' });

const invokeUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'amazon.nova-canvas-v1:0',
)}/invoke`;

describe('doGenerate', () => {
  const mockConfigHeaders = {
    'config-header': 'config-value',
    'shared-header': 'config-shared',
  };

  const server = createTestServer({
    [invokeUrl]: {
      response: {
        type: 'binary',
        headers: {
          'content-type': 'application/json',
        },
        body: Buffer.from(
          JSON.stringify({
            images: ['base64-image-1', 'base64-image-2'],
          }),
        ),
      },
    },
  });

  const model = new BedrockImageModel('amazon.nova-canvas-v1:0', {
    baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    headers: mockConfigHeaders,
    fetch: fakeFetchWithAuth,
  });

  it('should pass the model and the settings', async () => {
    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: 1234,
      providerOptions: {
        bedrock: {
          negativeText: 'bad',
          quality: 'premium',
          cfgScale: 1.2,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: prompt,
        negativeText: 'bad',
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        seed: 1234,
        quality: 'premium',
        cfgScale: 1.2,
        width: 1024,
        height: 1024,
      },
    });
  });

  it('should properly combine headers from all sources', async () => {
    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const modelWithHeaders = new BedrockImageModel('amazon.nova-canvas-v1:0', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {
        'model-header': 'model-value',
        'shared-header': 'model-shared',
      },
      fetch: injectFetchHeaders({
        'signed-header': 'signed-value',
        authorization: 'AWS4-HMAC-SHA256...',
      }),
    });

    await modelWithHeaders.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
      headers: optionsHeaders,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['options-header']).toBe('options-value');
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
    expect(requestHeaders['shared-header']).toBe('options-shared');
  });

  it('should respect maxImagesPerCall setting', async () => {
    const defaultModel = provider.image('amazon.nova-canvas-v1:0');
    expect(defaultModel.maxImagesPerCall).toBe(5); // 'amazon.nova-canvas-v1:0','s default from settings

    const unknownModel = provider.image('unknown-model' as any);
    expect(unknownModel.maxImagesPerCall).toBe(1); // fallback for unknown models
  });

  it('should return warnings for unsupported settings', async () => {
    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: undefined,
      providerOptions: {},
    });

    expect(result.warnings).toStrictEqual([
      {
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      },
    ]);
  });

  it('should extract the generated images', async () => {
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

  it('should include response data with timestamp, modelId and headers', async () => {
    const testDate = new Date('2024-03-15T12:00:00Z');

    const customModel = new BedrockImageModel('amazon.nova-canvas-v1:0', {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

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
      modelId: 'amazon.nova-canvas-v1:0',
      headers: {
        'content-length': '46',
        'content-type': 'application/json',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    const beforeDate = new Date();

    const result = await model.doGenerate({
      prompt,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: 1234,
      providerOptions: {},
    });

    const afterDate = new Date();

    expect(result.response.timestamp.getTime()).toBeGreaterThanOrEqual(
      beforeDate.getTime(),
    );
    expect(result.response.timestamp.getTime()).toBeLessThanOrEqual(
      afterDate.getTime(),
    );
    expect(result.response.modelId).toBe('amazon.nova-canvas-v1:0');
  });

  it('should pass the style parameter when provided', async () => {
    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: 1234,
      providerOptions: {
        bedrock: {
          negativeText: 'bad',
          quality: 'premium',
          cfgScale: 1.2,
          style: 'PHOTOREALISM',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: prompt,
        negativeText: 'bad',
        style: 'PHOTOREALISM',
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        seed: 1234,
        quality: 'premium',
        cfgScale: 1.2,
        width: 1024,
        height: 1024,
      },
    });
  });

  it('should not include style parameter when not provided', async () => {
    await model.doGenerate({
      prompt,
      n: 1,
      size: '1024x1024',
      aspectRatio: undefined,
      seed: 1234,
      providerOptions: {
        bedrock: {
          quality: 'standard',
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.textToImageParams).not.toHaveProperty('style');
  });
});
