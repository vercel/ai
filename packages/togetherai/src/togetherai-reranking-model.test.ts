import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';

import { createTogetherAI } from './togetherai-provider';
import {
  RerankedDocument,
  TooManyDocumentsForRerankingError,
} from '@ai-sdk/provider';

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

const testStringDocuments = ['sunny day at the beach', 'rainy day in the city'];
const testObjectDocuments = [
  { title: 'sunny day', text: 'sunny day at the beach' },
  { title: 'rainy day', text: 'rainy day in the city' },
];

const provider = createTogetherAI({ apiKey: 'test-api-key' });
const model = provider.rerankingModel('Salesforce/Llama-Rank-v1');
const server = createTestServer({
  'https://api.together.xyz/v1/rerank': {},
});

describe('doRerank', () => {
  function prepareJsonResponse({
    rerankedDocuments = dummyResultDocuments,
    usage = {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
    headers,
  }: {
    rerankedDocuments?: RerankedDocument<string>[];
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    headers?: Record<string, string>;
  } = {}) {
    // Convert RerankedDocument format to API response format
    const apiResults = rerankedDocuments.map(doc => ({
      index: doc.index,
      relevance_score: doc.relevanceScore,
    }));

    server.urls['https://api.together.xyz/v1/rerank'].response = {
      type: 'json-value',
      headers,
      body: {
        id: 'test-id',
        model: 'Salesforce/Llama-Rank-v1',
        object: 'rerank',
        results: apiResults,
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      },
    };
  }

  it('should rerank documents', async () => {
    prepareJsonResponse();

    const { rerankedDocuments } = await model.doRerank({
      values: testStringDocuments,
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
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '229',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    });

    const { usage } = await model.doRerank({
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(usage).toStrictEqual({ tokens: 2 });
  });

  it('should pass the model and the values', async () => {
    prepareJsonResponse();

    await model.doRerank({
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'Salesforce/Llama-Rank-v1',
      documents: testStringDocuments,
      query: 'rainy day',
      top_n: 2,
    });
  });

  it('should pass the rankFields setting', async () => {
    prepareJsonResponse();

    await provider.rerankingModel('Salesforce/Llama-Rank-v1').doRerank({
      values: testObjectDocuments,
      query: 'rainy day',
      topK: 2,
      providerOptions: {
        togetherai: {
          rankFields: ['title', 'text'],
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'Salesforce/Llama-Rank-v1',
      documents: testObjectDocuments,
      query: 'rainy day',
      top_n: 2,
      rank_fields: ['title', 'text'],
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createTogetherAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.rerankingModel('Salesforce/Llama-Rank-v1').doRerank({
      values: testStringDocuments,
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

  it('should throw an error if the number of documents is greater than the 1024 for Llama-Rank-v1', async () => {
    const tooManyDocuments = Array.from(
      { length: 1025 },
      (_, i) => `document ${i}`,
    );

    try {
      await model.doRerank({
        values: tooManyDocuments,
        query: 'test query',
        topK: 2,
      });
      expect.fail('Expected TooManyDocumentsForRerankingError to be thrown');
    } catch (error) {
      expect(TooManyDocumentsForRerankingError.isInstance(error)).toBe(true);
    }
  });
});
