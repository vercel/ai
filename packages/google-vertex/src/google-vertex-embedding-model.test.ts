import {
  EmbeddingModelV2Embedding,
  TooManyEmbeddingValuesForCallError,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3],
  [0.4, 0.5, 0.6],
];
const testValues = ['test text one', 'test text two'];

const DEFAULT_URL =
  'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/textembedding-gecko@001:predict';

const CUSTOM_URL =
  'https://custom-endpoint.com/models/textembedding-gecko@001:predict';

const server = createTestServer({
  [DEFAULT_URL]: {},
  [CUSTOM_URL]: {},
});

describe('GoogleVertexEmbeddingModel', () => {
  const mockModelId = 'textembedding-gecko@001';
  const mockProviderOptions = {
    outputDimensionality: 768,
    taskType: 'SEMANTIC_SIMILARITY',
  };

  const mockConfig = {
    provider: 'google-vertex',
    region: 'us-central1',
    project: 'test-project',
    headers: () => ({}),
    baseURL:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google',
  };

  const model = new GoogleVertexEmbeddingModel(mockModelId, mockConfig);

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    tokenCounts = [1, 1],
    headers,
  }: {
    embeddings?: EmbeddingModelV2Embedding[];
    tokenCounts?: number[];
    headers?: Record<string, string>;
  } = {}) {
    server.urls[DEFAULT_URL].response = {
      type: 'json-value',
      headers,
      body: {
        predictions: embeddings.map((values, i) => ({
          embeddings: {
            values,
            statistics: { token_count: tokenCounts[i] },
          },
        })),
      },
    };
  }

  it('should extract embeddings', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({
      values: testValues,
      providerOptions: { google: mockProviderOptions },
    });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response', async () => {
    prepareJsonResponse({
      headers: {
        'test-header': 'test-value',
      },
    });

    const { response } = await model.doEmbed({
      values: testValues,
      providerOptions: { google: mockProviderOptions },
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '159',
      'content-type': 'application/json',
      // custom header
      'test-header': 'test-value',
    });
    expect(response).toMatchSnapshot();
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      tokenCounts: [10, 15],
    });

    const { usage } = await model.doEmbed({
      values: testValues,
      providerOptions: { google: mockProviderOptions },
    });

    expect(usage).toStrictEqual({ tokens: 25 });
  });

  it('should pass the model parameters correctly', async () => {
    prepareJsonResponse();

    await model.doEmbed({
      values: testValues,
      providerOptions: { google: mockProviderOptions },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      instances: testValues.map(value => ({ content: value })),
      parameters: {
        outputDimensionality: mockProviderOptions.outputDimensionality,
        taskType: mockProviderOptions.taskType,
      },
    });
  });

  it('should pass the taskType setting', async () => {
    prepareJsonResponse();

    await model.doEmbed({
      values: testValues,
      providerOptions: { google: { taskType: mockProviderOptions.taskType } },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      instances: testValues.map(value => ({ content: value })),
      parameters: {
        taskType: mockProviderOptions.taskType,
      },
    });
  });

  it('should pass headers correctly', async () => {
    prepareJsonResponse();

    const model = new GoogleVertexEmbeddingModel(mockModelId, {
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

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'x-request-header': 'request-value',
    });
  });

  it('should throw TooManyEmbeddingValuesForCallError when too many values provided', async () => {
    const tooManyValues = Array(2049).fill('test');

    await expect(
      model.doEmbed({
        values: tooManyValues,
        providerOptions: { google: mockProviderOptions },
      }),
    ).rejects.toThrow(TooManyEmbeddingValuesForCallError);
  });

  it('should use custom baseURL when provided', async () => {
    server.urls[CUSTOM_URL].response = {
      type: 'json-value',
      body: {
        predictions: dummyEmbeddings.map(values => ({
          embeddings: {
            values,
            statistics: { token_count: 1 },
          },
        })),
      },
    };

    const modelWithCustomUrl = new GoogleVertexEmbeddingModel(
      'textembedding-gecko@001',
      {
        headers: () => ({}),
        baseURL: 'https://custom-endpoint.com',
        provider: 'google-vertex',
      },
    );

    const response = await modelWithCustomUrl.doEmbed({
      values: testValues,
      providerOptions: {
        google: { outputDimensionality: 768 },
      },
    });

    expect(response.embeddings).toStrictEqual(dummyEmbeddings);

    expect(server.calls[0].requestUrl).toBe(
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
        headers: () => ({}),
        baseURL: 'https://custom-endpoint.com',
        provider: 'google-vertex',
        fetch: customFetch,
      },
    );

    const response = await modelWithCustomFetch.doEmbed({
      values: testValues,
      providerOptions: {
        google: { outputDimensionality: 768 },
      },
    });

    expect(response.embeddings).toStrictEqual(dummyEmbeddings);

    expect(customFetch).toHaveBeenCalledWith(CUSTOM_URL, expect.any(Object));

    const [_, secondArgument] = customFetch.mock.calls[0];
    const requestBody = JSON.parse(secondArgument.body);

    expect(requestBody).toStrictEqual({
      instances: testValues.map(value => ({ content: value })),
      parameters: {
        outputDimensionality: 768,
      },
    });
  });
});
