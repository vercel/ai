import { EmbeddingModelV2Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createHeroku } from './heroku-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createHeroku({ apiKey: 'test-api-key' });
const model = provider.textEmbeddingModel('cohere-embed-multilingual');

const server = createTestServer({
  'https://us.inference.heroku.com/v1/embeddings': {},
});

describe('doEmbed', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    usage = { prompt_tokens: 8, total_tokens: 8 },
    headers,
  }: {
    embeddings?: EmbeddingModelV2Embedding[];
    usage?: { prompt_tokens: number; total_tokens: number };
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://us.inference.heroku.com/v1/embeddings'].response = {
      type: 'json-value',
      headers,
      body: {
        data: embeddings.map((embedding, index) => ({
          embedding,
          index,
        })),
        usage,
      },
    };
  }

  it('should extract embedding', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doEmbed({ values: testValues });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '185',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
    expect(response).toMatchSnapshot();
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'cohere-embed-multilingual',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass custom embedding options', async () => {
    prepareJsonResponse();

    await provider.textEmbeddingModel('cohere-embed-multilingual').doEmbed({
      values: testValues,
      providerOptions: {
        heroku: {
          inputType: 'search_document',
          truncate: 'START',
          dimensions: 1024,
          user: 'test-user',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'cohere-embed-multilingual',
      input: testValues,
      encoding_format: 'float',
      inputType: 'search_document',
      truncate: 'START',
      dimensions: 1024,
      user: 'test-user',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createHeroku({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.textEmbeddingModel('cohere-embed-multilingual').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = server.calls[0].requestHeaders;

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should handle empty usage response', async () => {
    prepareJsonResponse({
      usage: undefined,
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toBeUndefined();
  });

  it('should throw error when too many values are provided', async () => {
    const tooManyValues = Array.from({ length: 100 }, (_, i) => `text ${i}`);

    await expect(
      model.doEmbed({ values: tooManyValues }),
    ).rejects.toThrow(/Too many values for a single embedding call/);
  });

  it('should handle abort signal', async () => {
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      model.doEmbed({ values: testValues, abortSignal: abortController.signal }),
    ).rejects.toThrow();
  });
});

describe('model properties', () => {
  it('should have correct specification version', () => {
    expect(model.specificationVersion).toBe('v2');
  });

  it('should have correct provider', () => {
    expect(model.provider).toBe('heroku.textEmbedding');
  });

  it('should have correct model ID', () => {
    expect(model.modelId).toBe('cohere-embed-multilingual');
  });

  it('should support parallel calls', () => {
    expect(model.supportsParallelCalls).toBe(true);
  });

  it('should have correct max embeddings per call', () => {
    expect(model.maxEmbeddingsPerCall).toBe(96);
  });
});
