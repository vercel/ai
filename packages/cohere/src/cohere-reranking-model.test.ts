import { createCohere } from './cohere-provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { RerankingModelV1DocumentIndex } from '@ai-sdk/provider';

const dummyDocumentsIndices = [1, 0];
const dummyDocuments = ['sunny day at the beach', 'rainy day in the city'];

const provider = createCohere({
  baseURL: 'https://api.cohere.com/v1',
  apiKey: 'test-api-key',
});
const model = provider.reranking('rerank-english-v3.0');

describe('doRerank', () => {
  const server = new JsonTestServer('https://api.cohere.com/v1/rerank');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    rerankedIndices = dummyDocumentsIndices,
    meta = { billed_units: { input_tokens: 8 } },
  }: {
    rerankedIndices?: RerankingModelV1DocumentIndex[];
    meta?: { billed_units: { input_tokens: number } };
  } = {}) {
    server.responseBodyJson = {
      id: 'test-id',
      results: rerankedIndices.map(index => ({
        index,
        document: { text: dummyDocuments[index] },
      })),
      meta,
    };
  }

  it('should rerank documents', async () => {
    prepareJsonResponse();

    const { rerankedIndices } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(rerankedIndices).toStrictEqual(dummyDocumentsIndices);
  });

  it('should rerank documents and return documents', async () => {
    prepareJsonResponse();

    const { rerankedIndices, rerankedDocuments } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
      returnDocuments: true,
    });

    expect(rerankedDocuments).toStrictEqual(
      dummyDocumentsIndices.map(index => dummyDocuments[index]),
    );

    expect(rerankedIndices).toStrictEqual(dummyDocumentsIndices);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse();

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-length': '184',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      meta: { billed_units: { input_tokens: 20 } },
    });

    const { usage } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(usage).toStrictEqual({ tokens: 20 });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'rerank-english-v3.0',
      documents: dummyDocuments,
      query: 'rainy day',
      top_n: 2,
    });
  });

  it('should pass the input_type setting', async () => {
    prepareJsonResponse();

    await provider
      .reranking('rerank-english-v3.0', {
        max_chunks_per_document: 2,
      })
      .doRerank({ values: dummyDocuments, query: 'rainy day', topK: 2 });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'rerank-english-v3.0',
      documents: dummyDocuments,
      query: 'rainy day',
      top_n: 2,
      max_chunks_per_doc: 2,
    });

    await provider.reranking('rerank-english-v3.0').doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
      returnDocuments: true,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'rerank-english-v3.0',
      documents: dummyDocuments,
      query: 'rainy day',
      top_n: 2,
      return_documents: true,
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createCohere({
      baseURL: 'https://api.cohere.com/v1',
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.reranking('rerank-english-v3.0').doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
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
