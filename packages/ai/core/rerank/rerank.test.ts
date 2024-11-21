import assert from 'node:assert';
import { MockTracer } from '../test/mock-tracer';
import { rerank } from './rerank';
import {
  mockRerank,
  MockRerankingModelV1,
} from '../test/mock-reranking-model-v1';

const dummyDocumentsIndices = [1, 0];
const dummyDocuments = ['sunny day at the beach', 'rainy day in the city'];
const dummyRerankedDocuments = [
  'rainy day in the city',
  'sunny day at the beach',
];
const query = 'rainy day';
const topK = 2;

describe('result.reranking', () => {
  it('should reranking documents', async () => {
    const result = await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          dummyDocuments,
          dummyDocumentsIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: dummyDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyDocumentsIndices);
  });

  it('should reranking documents when several calls are required', async () => {
    let callCount = 0;
    const result = await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          switch (callCount++) {
            case 0:
              return {
                rerankedIndices: dummyDocumentsIndices.slice(0, 1),
              };
            case 1:
              return {
                rerankedIndices: dummyDocumentsIndices.slice(1),
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: dummyDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyDocumentsIndices);
  });
});

describe('result.value', () => {
  it('should include value in the result', async () => {
    const result = await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          dummyDocuments,
          dummyDocumentsIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: dummyDocuments,
      query,
      topK,
      returnDocuments: true,
    });

    assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  });
});

describe('result.usage', () => {
  it('should include usage in the result', async () => {
    let callCount = 0;
    const result = await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 1,
        doRerank: async () => {
          switch (callCount++) {
            case 0:
              return {
                rerankedIndices: dummyDocumentsIndices.slice(0, 1),
                usage: { tokens: 10 },
              };
            case 1:
              return {
                rerankedIndices: dummyDocumentsIndices.slice(1),
                usage: { tokens: 10 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: dummyDocuments,
      query,
      topK,
    });

    assert.deepStrictEqual(result.usage, { tokens: 20 });
  });
});

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 5,
        doRerank: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

          return { rerankedIndices: dummyDocumentsIndices };
        },
      }),
      values: dummyDocuments,
      query,
      topK,
      headers: { 'custom-request-header': 'request-header-value' },
    });

    assert.deepStrictEqual(result.rerankedIndices, dummyDocumentsIndices);
  });
});

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 5,
        doRerank: mockRerank(
          dummyDocuments,
          dummyDocumentsIndices,
          dummyRerankedDocuments,
        ),
      }),
      values: dummyDocuments,
      query,
      topK,
    });
    assert.deepStrictEqual(tracer.jsonSpans, []);
  });

  it('should record telemetry data when enabled (single call path)', async () => {
    await rerank({
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: null,
        doRerank: mockRerank(
          dummyDocuments,
          dummyDocumentsIndices,
          dummyRerankedDocuments,
          {
            tokens: 10,
          },
        ),
      }),
      values: dummyDocuments,
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
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: 1,
        doRerank: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, dummyDocuments.slice(0, 1));
              return {
                rerankedIndices: dummyDocumentsIndices.slice(0, 1),
                usage: { tokens: 10 },
              };
            case 1:
              assert.deepStrictEqual(values, dummyDocuments.slice(1));
              return {
                rerankedIndices: dummyDocumentsIndices.slice(1),
                usage: { tokens: 10 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: dummyDocuments,
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
      model: new MockRerankingModelV1({
        maxDocumentsPerCall: null,
        doRerank: mockRerank(
          dummyDocuments,
          dummyDocumentsIndices,
          dummyRerankedDocuments,
          {
            tokens: 10,
          },
        ),
      }),
      values: dummyDocuments,
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
