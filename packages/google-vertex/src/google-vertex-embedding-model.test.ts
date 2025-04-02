import {
  EmbeddingModelV1Embedding,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3],
  [0.4, 0.5, 0.6],
];
const testValues = ['test text one', 'test text two'];

describe('GoogleVertexEmbeddingModel', () => {
  const mockModelId = 'textembedding-gecko@001';
  const mockSettings = {
    outputDimensionality: 768,
    taskType: 'RETRIEVAL_QUERY',
    autoTruncate: true,
  };
  const mockConfig = {
    provider: 'google-vertex',
    region: 'us-central1',
    project: 'test-project',
    headers: () => ({}),
    baseURL:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google',
  };

  const model = new GoogleVertexEmbeddingModel(
    mockModelId,
    mockSettings,
    mockConfig,
  );
  const server = new JsonTestServer(
    'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/textembedding-gecko@001:predict',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    tokenCounts = [1, 1],
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
    tokenCounts?: number[];
  } = {}) {
    server.responseBodyJson = {
      predictions: embeddings.map((values, i) => ({
        embeddings: {
          values,
          statistics: { token_count: tokenCounts[i] },
        },
      })),
    };
  }

  it('should extract embeddings', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse();

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doEmbed({ values: testValues });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '159',
      'content-type': 'application/json',
      // custom header
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      tokenCounts: [10, 15],
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 25 });
  });

  it('should pass the model parameters correctly', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      instances: testValues.map(value => ({
        content: value,
        task_type: mockSettings.taskType,
      })),
      parameters: {
        outputDimensionality: mockSettings.outputDimensionality,
        autoTruncate: mockSettings.autoTruncate,
      },
    });
  });

  it('should pass headers correctly', async () => {
    prepareJsonResponse();

    const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
      ...mockConfig,
      headers: () => ({
        'X-Custom-Header': 'custom-value',
      }),
    });

    await model.doEmbed({
      values: testValues,
      headers: {
        'X-Request-Header': 'request-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'x-request-header': 'request-value',
    });
  });

  it('should throw TooManyEmbeddingValuesForCallError when too many values provided', async () => {
    const tooManyValues = Array(2049).fill('test');

    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      TooManyEmbeddingValuesForCallError,
    );
  });
});

describe('GoogleVertexEmbeddingModel', () => {
  const customBaseURL = 'https://custom-endpoint.com';
  const server = new JsonTestServer(
    `${customBaseURL}/models/textembedding-gecko@001:predict`,
  );
  server.setupTestEnvironment();

  it('should use custom baseURL when provided', async () => {
    server.responseBodyJson = {
      predictions: dummyEmbeddings.map(values => ({
        embeddings: {
          values,
          statistics: { token_count: 1 },
        },
      })),
    };

    const fetchSpy = vi.spyOn(global, 'fetch');

    const modelWithCustomUrl = new GoogleVertexEmbeddingModel(
      'textembedding-gecko@001',
      { outputDimensionality: 768 },
      {
        headers: () => ({}),
        baseURL: customBaseURL,
        provider: 'google-vertex',
        fetch: global.fetch,
      },
    );

    const response = await modelWithCustomUrl.doEmbed({
      values: testValues,
    });

    expect(response.embeddings).toStrictEqual(dummyEmbeddings);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(customBaseURL),
      expect.any(Object),
    );

    const requestUrl = await server.getRequestUrl();
    expect(requestUrl).toBe(
      'https://custom-endpoint.com/models/textembedding-gecko@001:predict',
    );
  });

  it('should use custom fetch when provided and include proper request content', async () => {
    const customFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          predictions: dummyEmbeddings.map(values => ({
            embeddings: {
              values,
              statistics: { token_count: 1 },
            },
          })),
        }),
      ),
    );

    const modelWithCustomFetch = new GoogleVertexEmbeddingModel(
      'textembedding-gecko@001',
      {
        outputDimensionality: 768,
        taskType: 'RETRIEVAL_QUERY',
        autoTruncate: true,
      },
      {
        headers: () => ({}),
        baseURL: customBaseURL,
        provider: 'google-vertex',
        fetch: customFetch,
      },
    );

    const response = await modelWithCustomFetch.doEmbed({
      values: testValues,
    });

    expect(response.embeddings).toStrictEqual(dummyEmbeddings);

    expect(customFetch).toHaveBeenCalledWith(
      `${customBaseURL}/models/textembedding-gecko@001:predict`,
      expect.any(Object),
    );

    const [_, secondArgument] = customFetch.mock.calls[0];
    const requestBody = JSON.parse(secondArgument.body);

    expect(requestBody).toStrictEqual({
      instances: testValues.map(value => ({
        content: value,
        task_type: 'RETRIEVAL_QUERY',
      })),
      parameters: {
        outputDimensionality: 768,
        autoTruncate: true,
      },
    });
  });
});
