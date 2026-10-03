import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { createNebul } from './nebul-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createNebul({ apiKey: 'test-api-key' });
const model = provider.rerankingModel('BAAI/bge-reranker-v2-m3');

const server = createTestServer({
  'https://api.inference.nebul.io/v1/rerank': {},
});

function prepareJsonResponse(body: Record<string, any>) {
  server.urls['https://api.inference.nebul.io/v1/rerank'].response = {
    type: 'json-value',
    body,
  };
}

describe('doRerank', () => {
  it('should send the model, query, documents, and top_n', async () => {
    prepareJsonResponse({
      object: 'rerank',
      results: [
        { relevance_score: 0.99, index: 0, document: null },
        { relevance_score: 0.01, index: 1, document: null },
      ],
      model: 'BAAI/bge-reranker-v2-m3',
      usage: { prompt_tokens: 123, total_tokens: 123 },
      id: 'infinity-test-id',
      created: 1788864455,
    });

    await model.doRerank({
      query: 'What is the speed of light?',
      documents: {
        type: 'text',
        values: [
          'The speed of light is 299,792,458 m/s.',
          'Paris is the capital of France.',
        ],
      },
      topN: 2,
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'BAAI/bge-reranker-v2-m3',
      query: 'What is the speed of light?',
      documents: [
        'The speed of light is 299,792,458 m/s.',
        'Paris is the capital of France.',
      ],
      top_n: 2,
    });
  });

  it('should omit top_n when not provided', async () => {
    prepareJsonResponse({
      object: 'rerank',
      results: [{ relevance_score: 0.99, index: 0 }],
      model: 'BAAI/bge-reranker-v2-m3',
      usage: { prompt_tokens: 123, total_tokens: 123 },
      id: 'infinity-test-id',
    });

    await model.doRerank({
      query: 'What is the speed of light?',
      documents: {
        type: 'text',
        values: ['The speed of light is 299,792,458 m/s.'],
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'BAAI/bge-reranker-v2-m3',
      query: 'What is the speed of light?',
      documents: ['The speed of light is 299,792,458 m/s.'],
    });
  });

  it('should stringify object documents', async () => {
    prepareJsonResponse({
      object: 'rerank',
      results: [{ relevance_score: 0.99, index: 0 }],
      model: 'BAAI/bge-reranker-v2-m3',
    });

    await model.doRerank({
      query: 'What is the speed of light?',
      documents: {
        type: 'object',
        values: [{ text: 'The speed of light is 299,792,458 m/s.' }],
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'BAAI/bge-reranker-v2-m3',
      query: 'What is the speed of light?',
      documents: ['{"text":"The speed of light is 299,792,458 m/s."}'],
    });
  });

  it('should extract the ranking result', async () => {
    prepareJsonResponse({
      object: 'rerank',
      results: [
        { relevance_score: 0.9988664388656616, index: 0, document: null },
        { relevance_score: 0.000022827996872365475, index: 1, document: null },
      ],
      model: 'BAAI/bge-reranker-v2-m3',
      usage: { prompt_tokens: 123, total_tokens: 123 },
      id: 'infinity-fa13864d-2080-4bb4-92c9-a9ef7034102a',
      created: 1788864455,
    });

    const result = await model.doRerank({
      query: 'What is the speed of light?',
      documents: {
        type: 'text',
        values: [
          'The speed of light is 299,792,458 m/s.',
          'Paris is the capital of France.',
        ],
      },
    });

    expect(result.ranking).toEqual([
      { index: 0, relevanceScore: 0.9988664388656616 },
      { index: 1, relevanceScore: 0.000022827996872365475 },
    ]);
    expect(result.response).toMatchObject({
      id: 'infinity-fa13864d-2080-4bb4-92c9-a9ef7034102a',
      modelId: 'BAAI/bge-reranker-v2-m3',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({
      object: 'rerank',
      results: [{ relevance_score: 0.99, index: 0 }],
      model: 'BAAI/bge-reranker-v2-m3',
    });

    const providerWithHeaders = createNebul({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await providerWithHeaders
      .rerankingModel('BAAI/bge-reranker-v2-m3')
      .doRerank({
        query: 'What is the speed of light?',
        documents: {
          type: 'text',
          values: ['The speed of light is 299,792,458 m/s.'],
        },
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/nebul/0.0.0-test',
    );
  });
});
