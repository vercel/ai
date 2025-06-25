import { createTestServer } from '@ai-sdk/provider-utils/test';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import { injectFetchHeaders } from './inject-fetch-headers';

const mockEmbeddings = [
  [-0.09, 0.05, -0.02, 0.01, 0.04],
  [-0.08, 0.06, -0.03, 0.02, 0.03],
];

const fakeFetchWithAuth = injectFetchHeaders({ 'x-amz-auth': 'test-auth' });

const testValues = ['sunny day at the beach', 'rainy day in the city'];
const mockImageUri =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/example';

const titanEmbedUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'amazon.titan-embed-text-v2:0',
)}/invoke`;

const cohereEmbedUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'cohere.embed-english-v3',
)}/invoke`;

describe('doEmbed with Titan models', () => {
  const mockConfigHeaders = {
    'config-header': 'config-value',
    'shared-header': 'config-shared',
  };

  const server = createTestServer({
    [titanEmbedUrl]: {
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

  const model = new BedrockEmbeddingModel(
    'amazon.titan-embed-text-v2:0',
    {},
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: mockConfigHeaders,
      fetch: fakeFetchWithAuth,
    },
  );

  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    server.urls[titanEmbedUrl].response = {
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

    const body = await server.calls[0].requestBody;
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

  it('should handle multiple input values and extract usage', async () => {
    const { usage } = await model.doEmbed({
      values: testValues,
    });

    expect(usage?.tokens).toStrictEqual(16);
  });

  it('should properly combine headers from all sources', async () => {
    const optionsHeaders = {
      'options-header': 'options-value',
      'shared-header': 'options-shared',
    };

    const modelWithHeaders = new BedrockEmbeddingModel(
      'amazon.titan-embed-text-v2:0',
      {},
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
      {},
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

describe('doEmbed with Cohere models', () => {
  const server = createTestServer({
    [cohereEmbedUrl]: {
      response: {
        type: 'binary',
        headers: {
          'content-type': 'application/json',
        },
        body: Buffer.from(
          JSON.stringify({
            embeddings: [mockEmbeddings[0]],
            id: 'emb_123456',
            response_type: 'embeddings_floats',
            texts: [testValues[0]],
          }),
        ),
      },
    },
  });

  const cohereModel = new BedrockEmbeddingModel(
    'cohere.embed-english-v3',
    {
      cohere: {
        input_type: 'search_document',
        truncate: 'NONE',
        embedding_types: ['float'],
      },
    },
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: fakeFetchWithAuth,
    },
  );

  beforeEach(() => {
    server.urls[cohereEmbedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embeddings: [mockEmbeddings[0]],
          id: 'emb_123456',
          response_type: 'embeddings_floats',
          texts: [testValues[0]],
        }),
      ),
    };
  });

  it('should handle single input value for Cohere models', async () => {
    const { embeddings } = await cohereModel.doEmbed({
      values: [testValues[0]],
    });

    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      texts: [testValues[0]],
      input_type: 'search_document',
      truncate: 'NONE',
      embedding_types: ['float'],
    });
  });

  it('should handle multiple input values for Cohere models', async () => {
    // Update server response for multiple inputs
    server.urls[cohereEmbedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embeddings: mockEmbeddings,
          id: 'emb_123456',
          response_type: 'embeddings_floats',
          texts: testValues,
        }),
      ),
    };

    const { embeddings } = await cohereModel.doEmbed({
      values: testValues,
    });

    expect(embeddings.length).toBe(2);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);
    expect(embeddings[1]).toStrictEqual(mockEmbeddings[1]);

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      texts: testValues,
      input_type: 'search_document',
      truncate: 'NONE',
      embedding_types: ['float'],
    });
  });

  it('should estimate token usage for Cohere models', async () => {
    const { usage } = await cohereModel.doEmbed({
      values: [testValues[0]],
    });

    // Based on the approximate 1 token = 4 chars rule mentioned in AWS docs
    const expectedTokens = Math.ceil(testValues[0].length / 4);
    expect(usage?.tokens).toStrictEqual(expectedTokens);
  });

  it('should use default cohere settings if not specified', async () => {
    const cohereModelWithDefaults = new BedrockEmbeddingModel(
      'cohere.embed-english-v3',
      {}, // No cohere settings specified
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: fakeFetchWithAuth,
      },
    );

    await cohereModelWithDefaults.doEmbed({
      values: [testValues[0]],
    });

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      texts: [testValues[0]],
      input_type: 'search_document', // Default value
      truncate: 'NONE', // Default value
      embedding_types: ['float'], // Default value
    });
  });

  it('should handle image input for Cohere models', async () => {
    // Set up model with image settings
    const cohereImageModel = new BedrockEmbeddingModel(
      'cohere.embed-english-v3',
      {
        cohere: {
          input_type: 'image',
          images: [mockImageUri],
          embedding_types: ['float'],
        },
      },
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: fakeFetchWithAuth,
      },
    );

    // Mock the response for image embed
    server.urls[cohereEmbedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embeddings: [mockEmbeddings[0]],
          id: 'emb_789012',
          response_type: 'embeddings_floats',
        }),
      ),
    };

    // Call embed on image
    await cohereImageModel.doEmbed({
      values: ['placeholder'], // Value is ignored for image embedding
    });

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      images: [mockImageUri],
      input_type: 'image',
      truncate: 'NONE',
      embedding_types: ['float'],
    });
  });

  it('should handle multiple embedding types in response', async () => {
    // Set up model with multiple embedding types
    const cohereMultiTypeModel = new BedrockEmbeddingModel(
      'cohere.embed-english-v3',
      {
        cohere: {
          input_type: 'search_document',
          embedding_types: ['float', 'int8'],
        },
      },
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: fakeFetchWithAuth,
      },
    );

    // Mock the response for multiple embedding types
    server.urls[cohereEmbedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embeddings: {
            float: [mockEmbeddings[0]],
            int8: [[1, 2, 3, 4, 5]],
          },
          id: 'emb_345678',
          response_type: 'embeddings_multiple',
          texts: [testValues[0]],
        }),
      ),
    };

    // Call embed with multiple types
    const { embeddings } = await cohereMultiTypeModel.doEmbed({
      values: [testValues[0]],
    });

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      texts: [testValues[0]],
      input_type: 'search_document',
      truncate: 'NONE',
      embedding_types: ['float', 'int8'],
    });

    // Should prefer float embeddings when multiple types are available
    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);
  });

  it('should fall back to the first embedding type if float is not available', async () => {
    // Set up model with multiple embedding types
    const cohereMultiTypeModel = new BedrockEmbeddingModel(
      'cohere.embed-english-v3',
      {
        cohere: {
          input_type: 'search_document',
          embedding_types: ['int8', 'binary'],
        },
      },
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        fetch: fakeFetchWithAuth,
      },
    );

    // Mock the response without float embeddings
    server.urls[cohereEmbedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embeddings: {
            int8: [[1, 2, 3, 4, 5]],
            binary: [[0, 1, 0, 1, 0]],
          },
          id: 'emb_901234',
          response_type: 'embeddings_multiple',
          texts: [testValues[0]],
        }),
      ),
    };

    // Call embed with multiple types
    const { embeddings } = await cohereMultiTypeModel.doEmbed({
      values: [testValues[0]],
    });

    // Should fall back to the first type (int8) when float is not available
    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual([1, 2, 3, 4, 5]);
  });
});
