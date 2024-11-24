import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

describe('GoogleVertexEmbeddingModel', () => {
  const server = new JsonTestServer(
    'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/text-embedding-001:predict',
  );

  server.setupTestEnvironment();

  const model = new GoogleVertexEmbeddingModel(
    'text-embedding-001',
    {},
    {
      provider: 'google.vertex',
      region: 'us-central1',
      project: 'test-project',
      headers: async () => ({
        authorization: 'Bearer test-auth-token',
      }),
    },
  );

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    tokenCounts = [5, 3],
  } = {}) {
    server.responseBodyJson = {
      predictions: embeddings.map((embedding, index) => ({
        embeddings: {
          values: embedding,
          statistics: {
            token_count: tokenCounts[index],
          },
        },
      })),
    };
  }

  it('should extract embedding and token usage', async () => {
    prepareJsonResponse();

    const { embeddings, usage } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
    expect(usage).toStrictEqual({ tokens: 8 });
  });

  it('should pass the correct request body', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      instances: testValues.map(value => ({
        content: value,
      })),
      parameters: {},
    });
  });

  it('should pass the outputDimensionality setting', async () => {
    prepareJsonResponse();

    const modelWithDimensions = new GoogleVertexEmbeddingModel(
      'text-embedding-001',
      { outputDimensionality: 64 },
      {
        provider: 'google.vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: async () => ({}),
      },
    );

    await modelWithDimensions.doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      instances: testValues.map(value => ({
        content: value,
      })),
      parameters: {
        outputDimensionality: 64,
      },
    });
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse();

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doEmbed({ values: testValues });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '173',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    await model.doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-auth-token',
      'content-type': 'application/json',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should throw an error if too many values are provided', async () => {
    const model = new GoogleVertexEmbeddingModel(
      'text-embedding-001',
      {},
      {
        provider: 'google.vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: async () => ({}),
      },
    );

    const tooManyValues = Array(2049).fill('test');

    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      'Too many values for a single embedding call. The google.vertex model "text-embedding-001" can only embed up to 2048 values per call, but 2049 values were provided.',
    );
  });
});
