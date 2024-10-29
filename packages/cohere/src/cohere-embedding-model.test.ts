import { EmbeddingModelV1Embedding } from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createCohere } from './cohere-provider';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3, 0.4, 0.5],
  [0.6, 0.7, 0.8, 0.9, 1.0],
];
const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createCohere({ apiKey: 'test-api-key' });
const model = provider.textEmbeddingModel('embed-english-v3.0');

describe('doEmbed', () => {
  const server = new JsonTestServer('https://api.cohere.com/v2/embed');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    embeddings = dummyEmbeddings,
    meta = { billed_units: { input_tokens: 8 } },
  }: {
    embeddings?: EmbeddingModelV1Embedding[];
    meta?: { billed_units: { input_tokens: number } };
  } = {}) {
    server.responseBodyJson = {
      id: 'test-id',
      texts: testValues,
      embeddings: { float: embeddings },
      meta,
    };
  }

  it('should extract embedding', async () => {
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
      'content-length': '185',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      meta: { billed_units: { input_tokens: 20 } },
    });

    const { usage } = await model.doEmbed({ values: testValues });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'embed-english-v3.0',
      embedding_types: ['float'],
      texts: testValues,
      input_type: 'search_query',
    });
  });

  it('should pass the input_type setting', async () => {
    prepareJsonResponse();

    await provider
      .textEmbeddingModel('embed-english-v3.0', {
        inputType: 'search_document',
      })
      .doEmbed({ values: testValues });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'embed-english-v3.0',
      embedding_types: ['float'],
      texts: testValues,
      input_type: 'search_document',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.textEmbeddingModel('embed-english-v3.0').doEmbed({
      values: testValues,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });
});
