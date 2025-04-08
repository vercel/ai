import { EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAICompatible } from './openai-compatible-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createOpenAICompatible({
  baseURL: 'https://my.api.com/v1/',
  name: 'test-provider',
  headers: {
    Authorization: `Bearer test-api-key`,
  },
});
const model = provider.textEmbeddingModel('text-embedding-3-large');

const server = createTestServer({
  'https://my.api.com/v1/embeddings': {},
});

describe('doEmbed', () => {
  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    usage = { prompt_tokens: 8, total_tokens: 8 },
    headers,
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
    usage?: { prompt_tokens: number; total_tokens: number };
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://my.api.com/v1/embeddings'].response = {
      type: 'json-value',
      headers,
      body: {
        object: 'list',
        data: embeddings.map((embedding, i) => ({
          object: 'embedding',
          index: i,
          embedding,
        })),
        model: 'text-embedding-3-large',
        usage,
      },
    };
  }

  it('should extract embedding', async () => {
    prepareJsonResponse();

    const { embeddings } = await model.doEmbed({ values: testValues });

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { rawResponse } = await model.doEmbed({ values: testValues });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '236',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
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
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
    });
  });

  it('should pass the dimensions setting', async () => {
    prepareJsonResponse();

    await provider
      .textEmbeddingModel('text-embedding-3-large', { dimensions: 64 })
      .doEmbed({ values: testValues });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'text-embedding-3-large',
      input: testValues,
      encoding_format: 'float',
      dimensions: 64,
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAICompatible({
      baseURL: 'https://my.api.com/v1/',
      name: 'test-provider',
      headers: {
        Authorization: `Bearer test-api-key`,
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.textEmbeddingModel('text-embedding-3-large').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });
});
