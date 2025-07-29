import assert from 'node:assert';
import {
  MockEmbeddingModelV2,
  mockEmbed,
} from '../test/mock-embedding-model-v2';
import { MockTracer } from '../test/mock-tracer';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { embedMany } from './embed-many';

const dummyEmbeddings = [
  [0.1, 0.2, 0.3],
  [0.4, 0.5, 0.6],
  [0.7, 0.8, 0.9],
];

const testValues = [
  'sunny day at the beach',
  'rainy afternoon in the city',
  'snowy night in the mountains',
];

describe('model.supportsParallelCalls', () => {
  it('should not parallelize when false', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const embedManyPromise = embedMany({
      model: new MockEmbeddingModelV2({
        supportsParallelCalls: false,
        maxEmbeddingsPerCall: 1,
        doEmbed: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            embeddings: [dummyEmbeddings[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testValues,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { embeddings } = await embedManyPromise;

    expect(events).toStrictEqual([
      'start-0',
      'end-0',
      'start-1',
      'end-1',
      'start-2',
      'end-2',
    ]);

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should parallelize when true', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const embedManyPromise = embedMany({
      model: new MockEmbeddingModelV2({
        supportsParallelCalls: true,
        maxEmbeddingsPerCall: 1,
        doEmbed: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            embeddings: [dummyEmbeddings[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testValues,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { embeddings } = await embedManyPromise;

    expect(events).toStrictEqual([
      'start-0',
      'start-1',
      'start-2',
      'end-0',
      'end-1',
      'end-2',
    ]);

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });

  it('should support maxParallelCalls', async () => {
    const events: string[] = [];
    let callCount = 0;

    const resolvables = [
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
      createResolvablePromise<void>(),
    ];

    const embedManyPromise = embedMany({
      maxParallelCalls: 2,
      model: new MockEmbeddingModelV2({
        supportsParallelCalls: true,
        maxEmbeddingsPerCall: 1,
        doEmbed: async () => {
          const index = callCount++;
          events.push(`start-${index}`);

          await resolvables[index].promise;
          events.push(`end-${index}`);

          return {
            embeddings: [dummyEmbeddings[index]],
            response: { headers: {}, body: {} },
          };
        },
      }),
      values: testValues,
    });

    resolvables.forEach(resolvable => {
      resolvable.resolve();
    });

    const { embeddings } = await embedManyPromise;

    expect(events).toStrictEqual([
      'start-0',
      'start-1',
      'end-0',
      'end-1',
      'start-2',
      'end-2',
    ]);

    expect(embeddings).toStrictEqual(dummyEmbeddings);
  });
});

describe('result.embedding', () => {
  it('should generate embeddings', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });

  it('should generate embeddings when several calls are required', async () => {
    let callCount = 0;

    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 2,
        doEmbed: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testValues.slice(0, 2));
              return { embeddings: dummyEmbeddings.slice(0, 2) };
            case 1:
              assert.deepStrictEqual(values, testValues.slice(2));
              return { embeddings: dummyEmbeddings.slice(2) };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });
});

describe('result.responses', () => {
  it('should include responses in the result', async () => {
    let callCount = 0;
    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 1,

        doEmbed: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, [testValues[0]]);
              return {
                embeddings: dummyEmbeddings,
                response: {
                  body: { first: true },
                },
              };
            case 1:
              assert.deepStrictEqual(values, [testValues[1]]);
              return {
                embeddings: dummyEmbeddings,
                response: {
                  body: { second: true },
                },
              };
            case 2:
              assert.deepStrictEqual(values, [testValues[2]]);
              return {
                embeddings: dummyEmbeddings,
                response: {
                  body: { third: true },
                },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
    });

    expect(result.responses).toMatchSnapshot();
  });
});

describe('result.values', () => {
  it('should include values in the result', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
    });

    assert.deepStrictEqual(result.values, testValues);
  });
});

describe('result.usage', () => {
  it('should include usage in the result', async () => {
    let callCount = 0;

    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 2,
        doEmbed: async () => {
          switch (callCount++) {
            case 0:
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                usage: { tokens: 10 },
              };
            case 1:
              return {
                embeddings: dummyEmbeddings.slice(2),
                usage: { tokens: 20 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
    });

    assert.deepStrictEqual(result.usage, { tokens: 30 });
  });
});

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 5,
        doEmbed: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

          return { embeddings: dummyEmbeddings };
        },
      }),
      values: testValues,
      headers: { 'custom-request-header': 'request-header-value' },
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });
});

describe('options.providerOptions', () => {
  it('should pass provider options to model', async () => {
    const model = new MockEmbeddingModelV2({
      doEmbed: async ({ providerOptions }) => {
        return { embeddings: [[1, 2, 3]] };
      },
    });

    vi.spyOn(model, 'doEmbed');

    await embedMany({
      model,
      values: ['test-input'],
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
    });

    expect(model.doEmbed).toHaveBeenCalledWith({
      abortSignal: undefined,
      headers: undefined,
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
      values: ['test-input'],
    });
  });
});

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
    });

    assert.deepStrictEqual(tracer.jsonSpans, []);
  });

  it('should record telemetry data when enabled (multiple calls path)', async () => {
    let callCount = 0;

    await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: 2,
        doEmbed: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testValues.slice(0, 2));
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                usage: { tokens: 10 },
              };
            case 1:
              assert.deepStrictEqual(values, testValues.slice(2));
              return {
                embeddings: dummyEmbeddings.slice(2),
                usage: { tokens: 20 },
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
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

  it('should record telemetry data when enabled (single call path)', async () => {
    await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: null,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, { tokens: 10 }),
      }),
      values: testValues,
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
    await embedMany({
      model: new MockEmbeddingModelV2({
        maxEmbeddingsPerCall: null,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, { tokens: 10 }),
      }),
      values: testValues,
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

describe('result.providerMetadata', () => {
  it('should include provider metadata when returned by the model', async () => {
    const providerMetadata = {
      gateway: { routing: { resolvedProvider: 'test-provider' } },
    };

    const result = await embedMany({
      model: new MockEmbeddingModelV2({
        supportsParallelCalls: false,
        maxEmbeddingsPerCall: 3,
        doEmbed: mockEmbed(
          testValues,
          dummyEmbeddings,
          undefined,
          {
            headers: {},
            body: {},
          },
          providerMetadata,
        ),
      }),
      values: testValues,
    });

    expect(result.providerMetadata).toStrictEqual(providerMetadata);
  });
});
