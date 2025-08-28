import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createCohere } from './cohere-provider';
import { RerankedDocument } from '@ai-sdk/provider';
import { describe, it, expect } from 'vitest';

const dummyResultDocuments: RerankedDocument<string>[] = [
  {
    index: 1,
    relevanceScore: 0.45028743,
    document: 'rainy day in the city',
  },
  {
    index: 0,
    relevanceScore: 0.0926305,
    document: 'sunny day at the beach',
  },
];

const testDocuments = ['sunny day at the beach', 'rainy day in the city'];

const provider = createCohere({ apiKey: 'test-api-key' });
const model = provider.rerankingModel('rerank-english-v3.0');
const server = createTestServer({
  'https://api.cohere.com/v2/rerank': {},
});

describe('doRerank', () => {
  function prepareJsonResponse({
    rerankedDocuments = dummyResultDocuments,
    meta = {
      billed_units: { search_units: 1 },
      api_version: { version: 'v1' },
    },
    headers,
  }: {
    rerankedDocuments?: RerankedDocument<string>[];
    meta?: {
      billed_units: { search_units: number };
      api_version?: { version: string };
    };
    headers?: Record<string, string>;
  } = {}) {
    // Convert RerankedDocument format to API response format
    const apiResults = rerankedDocuments.map(doc => ({
      index: doc.index,
      relevance_score: doc.relevanceScore,
    }));

    server.urls['https://api.cohere.com/v2/rerank'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        results: apiResults,
        meta,
      },
    };
  }

  it('should rerank documents', async () => {
    prepareJsonResponse();

    const { rerankedDocuments } = await model.doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(rerankedDocuments).toStrictEqual(dummyResultDocuments);
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '183',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      meta: {
        billed_units: { search_units: 1 },
        api_version: { version: 'v1' },
      },
    });

    const { usage } = await model.doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(usage).toStrictEqual({ tokens: 1 });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'rerank-english-v3.0',
      documents: testDocuments,
      query: 'rainy day',
      max_tokens_per_doc: 4096,
      top_n: 2,
    });
  });

  it('should pass the maxTokensPerDoc setting', async () => {
    prepareJsonResponse();

    await provider.rerankingModel('rerank-english-v3.0').doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
      providerOptions: {
        cohere: {
          maxTokensPerDoc: 1000,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'rerank-english-v3.0',
      documents: testDocuments,
      query: 'rainy day',
      top_n: 2,
      max_tokens_per_doc: 1000,
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

    await provider.rerankingModel('rerank-english-v3.0').doRerank({
      values: testDocuments,
      query: 'rainy day',
      topK: 2,
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
});
