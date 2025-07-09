import { createTestServer } from '@ai-sdk/provider-utils/test';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const mockEmbeddings = [
  [-0.09, 0.05, -0.02, 0.01, 0.04],
  [-0.08, 0.06, -0.03, 0.02, 0.03],
];

const fakeFetchWithAuth = injectFetchHeaders({ 'x-amz-auth': 'test-auth' });

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const embedUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'amazon.titan-embed-text-v2:0',
)}/invoke`;

describe('doEmbed', () => {
  const mockConfigHeaders = {
    'config-header': 'config-value',
    'shared-header': 'config-shared',
  };

  const server = createTestServer({
    [embedUrl]: {
      response: {
        type: 'binary',
        headers: {
          'content-type': 'application/json',
        },
        body: Buffer.from(
          JSON.stringify({
            embedding: mockEmbeddings[0],
            inputTextTokenCount: 8,
          }),
        ),
      },
    },
  });

  const model = new BedrockEmbeddingModel('amazon.titan-embed-text-v2:0', {
    baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    headers: mockConfigHeaders,
    fetch: fakeFetchWithAuth,
  });

  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    server.urls[embedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embedding: mockEmbeddings[0],
          inputTextTokenCount: 8,
        }),
      ),
    };
  });

  it('should handle single input value and return embeddings', async () => {
    const { embeddings } = await model.doEmbed({
      values: [testValues[0]],
    });

    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);

    const body = await server.calls[0].requestBodyJson;
    expect(body).toEqual({
      inputText: testValues[0],
      dimensions: undefined,
      normalize: undefined,
    });
  });

  it('should handle single input value and extract usage', async () => {
    const { usage } = await model.doEmbed({
      values: [testValues[0]],
    });

    expect(usage?.tokens).toStrictEqual(8);
  });

  it('should properly combine headers from all sources', async () => {
    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const modelWithHeaders = new BedrockEmbeddingModel(
      'amazon.titan-embed-text-v2:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {
          'model-header': 'model-value',
          'shared-header': 'model-shared',
        },
        fetch: injectFetchHeaders({
          'signed-header': 'signed-value',
          authorization: 'AWS4-HMAC-SHA256...',
        }),
      },
    );

    await modelWithHeaders.doEmbed({
      values: [testValues[0]],
      headers: optionsHeaders,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['options-header']).toBe('options-value');
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
    expect(requestHeaders['shared-header']).toBe('options-shared');
  });

  it('should work with partial headers', async () => {
    const modelWithPartialHeaders = new BedrockEmbeddingModel(
      'amazon.titan-embed-text-v2:0',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {
          'model-header': 'model-value',
        },
        fetch: injectFetchHeaders({
          'signed-header': 'signed-value',
          authorization: 'AWS4-HMAC-SHA256...',
        }),
      },
    );

    await modelWithPartialHeaders.doEmbed({
      values: [testValues[0]],
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
  });
});
