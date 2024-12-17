import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexImageModel } from './google-vertex-image-model';

const prompt = 'A cute baby sea otter';

const model = new GoogleVertexImageModel('imagen-3.0-generate-001', {
  provider: 'google-vertex',
  baseURL: 'https://api.example.com',
  headers: { 'api-key': 'test-key' },
});

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.example.com/models/imagen-3.0-generate-001:predict',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse() {
    server.responseBodyJson = {
      predictions: [
        { bytesBase64Encoded: 'base64-image-1' },
        { bytesBase64Encoded: 'base64-image-2' },
      ],
    };
  }

  it('should pass the correct parameters', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 2,
      size: '1024x1024',
      providerOptions: { customOption: { value: 123 } },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 2,
        aspectRatio: '1:1',
        customOption: { value: 123 },
      },
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const modelWithHeaders = new GoogleVertexImageModel(
      'imagen-3.0-generate-001',
      {
        provider: 'google-vertex',
        baseURL: 'https://api.example.com',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      },
    );

    await modelWithHeaders.doGenerate({
      prompt,
      n: 2,
      size: '1024x1024',
      providerOptions: {},
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should extract the generated images', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      n: 2,
      size: undefined,
      providerOptions: {},
    });

    expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
  });

  it('should handle different aspect ratios', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 1,
      size: '1280x896',
      providerOptions: {},
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '4:3',
      },
    });
  });
});
