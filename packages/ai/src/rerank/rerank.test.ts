import assert from 'node:assert';
import { MockTracer } from '../test/mock-tracer';
import { rerank } from './rerank';
import {
  mockRerank,
  MockRerankingModelV2,
} from '../test/mock-reranking-model-v2';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { RerankedResultIndex } from '../types';

const dummyResultIndices: Array<RerankedResultIndex> = [
  { index: 1, relevance_score: 0.9 },
  { index: 0, relevance_score: 0.8 },
  { index: 2, relevance_score: 0.7 },
];

const testDocuments = [
  'sunny day at the beach',
  'rainy day in the city',
  'cloudy day in the mountains',
];

const dummyRerankedDocuments = [
  'rainy day in the city',
  'sunny day at the beach',
  'cloudy day in the mountains',
];

const query = 'rainy day';

const topK = 3;

describe('model.supportsParallelCalls', () => {
  it('should not parallelize when false', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const rerankPromise = rerank({
      model: new MockRerankingModelV2({
        supportsParallelCalls: false,
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            rerankedIndices: [dummyResultIndices[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { rerankedIndices } = await rerankPromise;

    expect(events).toStrictEqual([
      'start-0',
      'end-0',
      'start-1',
      'end-1',
      'start-2',
      'end-2',
    ]);

    expect(rerankedIndices).toStrictEqual(dummyResultIndices);
  });

  it('should parallelize when true', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const rerankPromise = rerank({
      model: new MockRerankingModelV2({
        supportsParallelCalls: true,
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            rerankedIndices: [dummyResultIndices[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { rerankedIndices } = await rerankPromise;

    expect(events).toStrictEqual([
      'start-0',
      'start-1',
      'start-2',
      'end-0',
      'end-1',
      'end-2',
    ]);

    expect(rerankedIndices).toStrictEqual(dummyResultIndices);
  });

  it('should support maxParallelCalls', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const rerankPromise = rerank({
      maxParallelCalls: 2,
      model: new MockRerankingModelV2({
        supportsParallelCalls: true,
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            rerankedIndices: [dummyResultIndices[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { rerankedIndices } = await rerankPromise;

    expect(events).toStrictEqual([
      'start-0',
      'start-1',
      'end-0',
      'end-1',
      'start-2',
      'end-2',
    ]);

    expect(rerankedIndices).toStrictEqual(dummyResultIndices);
  });
});

describe('result.reranking', () => {
  it('should reranking documents', async () => {
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: testDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyResultIndices);
  });

  it('should reranking documents when several calls are required', async () => {
    let callCount = 0;
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 2,
        doRerank: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testDocuments.slice(0, 2));
              return {
                rerankedIndices: dummyResultIndices.slice(0, 2),
              };
            case 1:
              assert.deepStrictEqual(values, testDocuments.slice(2));
              return {
                rerankedIndices: dummyResultIndices.slice(2),
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyResultIndices);
  });
});

describe('result.responses', () => {
  it('should include responses in the result', async () => {
    let callCount = 0;
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 1,
        doRerank: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, [testDocuments[0]]);
              return {
                rerankedIndices: dummyResultIndices.slice(0, 1),
                response: {
                  body: { first: true },
                },
              };
            case 1:
              assert.deepStrictEqual(values, [testDocuments[1]]);
              return {
                rerankedIndices: dummyResultIndices.slice(1, 2),
                response: {
                  body: { second: true },
                },
              };
            case 2:
              assert.deepStrictEqual(values, [testDocuments[2]]);
              return {
                rerankedIndices: dummyResultIndices.slice(2),
                response: {
                  body: { third: true },
                },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    expect(result.responses).toMatchSnapshot();
  });
});

describe('result.value', () => {
  it('should include value in the result', async () => {
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: testDocuments,
      query,
      topK,
      returnDocuments: true,
    });

    assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  });

  it('should include documents in the result when returnDocuments is true', async () => {
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: testDocuments,
      query,
      topK,
      returnDocuments: true,
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyResultIndices);
    assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  });
});

describe('result.usage', () => {
  it('should include usage in the result', async () => {
    let callCount = 0;
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 2,
        doRerank: async () => {
          switch (callCount++) {
            case 0:
              return {
                rerankedIndices: dummyResultIndices.slice(0, 2),
                usage: { tokens: 10 },
              };
            case 1:
              return {
                rerankedIndices: dummyResultIndices.slice(2),
                usage: { tokens: 20 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.usage, { tokens: 30 });
  });
});

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 5,
        doRerank: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

          return { rerankedIndices: dummyResultIndices };
        },
      }),
      values: testDocuments,
      query,
      topK,
      headers: { 'custom-request-header': 'request-header-value' },
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyResultIndices);
  });
});

describe('options.providerOptions', () => {
  it('should pass provider options to model', async () => {
    const model = new MockRerankingModelV2({
      maxDocumentsPerCall: 5,
      doRerank: async ({ providerOptions }) => {
        return {
          rerankedIndices: [dummyResultIndices[0]],
        };
      },
    });

    vi.spyOn(model, 'doRerank');

    await rerank({
      model,
      values: ['test-input'],
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
      query: 'test-query',
      topK: 1,
    });

    expect(model.doRerank).toHaveBeenCalledWith({
      abortSignal: undefined,
      headers: undefined,
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
      values: ['test-input'],
      query: 'test-query',
      returnDocuments: false,
      topK: 1,
    });
  });
});

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: testDocuments,
      query,
      topK,
    });
    assert.deepStrictEqual(tracer.jsonSpans, []);
  });

  it('should record telemetry data when enabled (single call path)', async () => {
    await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: null,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
          {
            tokens: 10,
          },
        ),
      }),
      values: testDocuments,
      query,
      topK,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'test-function-id',
        metadata: {
          test1: 'value1',
          test2: false,
        },
        tracer,
      },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });

  it('should record telemetry data when enabled (multiple calls path)', async () => {
    let callCount = 0;
    await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: 2,
        doRerank: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testDocuments.slice(0, 2));
              return {
                rerankedIndices: dummyResultIndices.slice(0, 2),
                usage: { tokens: 20 },
              };
            case 1:
              assert.deepStrictEqual(values, testDocuments.slice(2));
              return {
                rerankedIndices: dummyResultIndices.slice(2),
                usage: { tokens: 10 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testDocuments,
      query,
      topK,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'test-function-id',
        metadata: {
          test1: 'value1',
          test2: false,
        },
        tracer,
      },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });

  it('should not record telemetry inputs / outputs when disabled', async () => {
    await rerank({
      model: new MockRerankingModelV2({
        maxDocumentsPerCall: null,
        doRerank: mockRerank(
          testDocuments,
          dummyResultIndices,
          dummyRerankedDocuments,
          {
            tokens: 10,
          },
        ),
      }),
      values: testDocuments,
      query,
      topK,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        tracer,
      },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });
});
