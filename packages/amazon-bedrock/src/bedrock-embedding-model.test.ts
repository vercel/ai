import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createAmazonBedrock } from './bedrock-provider';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';

const mockEmbeddings = [
  [
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ],
  [
    [0.2, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ],
];

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const embedUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'amazon.titan-embed-text-v2:0',
)}/invoke`;

describe('doEmbed', () => {
  const mockConfigHeaders = {
    'config-header': 'config-value',
    'shared-header': 'config-shared',
  };

  const mockSignedHeaders = {
    'signed-header': 'signed-value',
    'shared-header': 'signed-shared',
    authorization: 'AWS4-HMAC-SHA256...',
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

  const provider = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    sessionToken: 'test-token-key',
    headers: mockConfigHeaders,
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
    const { embeddings } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      inputText: testValues[0],
    });
  });

  it('should handle single input value and extract usage', async () => {
    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(usage?.tokens).toStrictEqual(8);
  });

  // TODO: Update unified test server to support dynamic responses.

  // it('should handle multiple input values and return embeddings', async () => {
  //   const { embeddings } = await provider
  //     .embedding('amazon.titan-embed-text-v2:0')
  //     .doEmbed({
  //       values: testValues,
  //     });

  //   expect(embeddings.length).toBe(2);
  //   expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);
  //   expect(embeddings[1]).toStrictEqual(mockEmbeddings[1]);

  //   const firstRequest = JSON.parse(await calls[0].requestBody);
  //   const secondRequest = JSON.parse(await calls[1].requestBody);
  //   expect(firstRequest).toEqual({ inputText: testValues[0] });
  //   expect(secondRequest).toEqual({ inputText: testValues[1] });
  // });

  it('should handle multiple input values and extract usage', async () => {
    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: testValues,
      });

    expect(usage?.tokens).toStrictEqual(16);
  });

  it('should properly combine headers from all sources', async () => {
    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const model = new BedrockEmbeddingModel(
      'amazon.titan-embed-text-v2:0',
      {},
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {
          'model-header': 'model-value',
          'shared-header': 'model-shared',
        },
        sign: ({ headers }) => ({
          'options-header': 'options-value',
          'model-header': 'model-value',
          'shared-header': 'options-shared',
          'signed-header': 'signed-value',
          authorization: 'AWS4-HMAC-SHA256...',
        }),
      },
    );

    await model.doEmbed({
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
    const model = new BedrockEmbeddingModel(
      'amazon.titan-embed-text-v2:0',
      {},
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {
          'model-header': 'model-value',
        },
        sign: ({ headers }) => ({
          'model-header': 'model-value',
          'signed-header': 'signed-value',
          authorization: 'AWS4-HMAC-SHA256...',
        }),
      },
    );

    await model.doEmbed({
      values: [testValues[0]],
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['model-header']).toBe('model-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
  });
});
