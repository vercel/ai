import { EmbeddingModelV3 } from '@ai-sdk/provider';
import assert from 'node:assert';
import { beforeEach, describe, expect, it, vi, vitest } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockTracer } from '../test/mock-tracer';
import { Embedding, EmbeddingModelUsage, Warning } from '../types';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { embedMany } from './embed-many';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

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
      model: new MockEmbeddingModelV3({
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
            warnings: [],
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
      model: new MockEmbeddingModelV3({
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
            warnings: [],
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
      model: new MockEmbeddingModelV3({
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
            warnings: [],
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 2,
        doEmbed: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testValues.slice(0, 2));
              return { embeddings: dummyEmbeddings.slice(0, 2), warnings: [] };
            case 1:
              assert.deepStrictEqual(values, testValues.slice(2));
              return { embeddings: dummyEmbeddings.slice(2), warnings: [] };
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
      model: new MockEmbeddingModelV3({
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
                warnings: [],
              };
            case 1:
              assert.deepStrictEqual(values, [testValues[1]]);
              return {
                embeddings: dummyEmbeddings,
                response: {
                  body: { second: true },
                },
                warnings: [],
              };
            case 2:
              assert.deepStrictEqual(values, [testValues[2]]);
              return {
                embeddings: dummyEmbeddings,
                response: {
                  body: { third: true },
                },
                warnings: [],
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 2,
        doEmbed: async () => {
          switch (callCount++) {
            case 0:
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                usage: { tokens: 10 },
                warnings: [],
              };
            case 1:
              return {
                embeddings: dummyEmbeddings.slice(2),
                usage: { tokens: 20 },
                warnings: [],
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
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 5,
        doEmbed: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
            'user-agent': 'ai/0.0.0-test',
          });

          return { embeddings: dummyEmbeddings, warnings: [] };
        },
      }),
      values: testValues,
      headers: {
        'custom-request-header': 'request-header-value',
      },
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });
});

describe('options.providerOptions', () => {
  it('should pass provider options to model', async () => {
    const model = new MockEmbeddingModelV3({
      doEmbed: async ({ providerOptions }) => {
        return { embeddings: [[1, 2, 3]], warnings: [] };
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
      headers: {
        'user-agent': 'ai/0.0.0-test',
      },
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 2,
        doEmbed: async ({ values }) => {
          switch (callCount++) {
            case 0:
              assert.deepStrictEqual(values, testValues.slice(0, 2));
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                usage: { tokens: 10 },
                warnings: [],
              };
            case 1:
              assert.deepStrictEqual(values, testValues.slice(2));
              return {
                embeddings: dummyEmbeddings.slice(2),
                usage: { tokens: 20 },
                warnings: [],
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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

describe('result.warnings', () => {
  it('should include warnings in the result (single call path)', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ];

    const result = await embedMany({
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: null,
        doEmbed: async () => ({
          embeddings: dummyEmbeddings,
          warnings: expectedWarnings,
        }),
      }),
      values: testValues,
    });

    expect(result.warnings).toStrictEqual(expectedWarnings);
  });

  it('should aggregate warnings from multiple calls', async () => {
    const warning1: Warning = {
      type: 'other',
      message: 'Warning from call 1',
    };
    const warning2: Warning = {
      type: 'unsupported',
      feature: 'dimensions',
    };

    let callCount = 0;

    const result = await embedMany({
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 2,
        doEmbed: async () => {
          switch (callCount++) {
            case 0:
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                warnings: [warning1],
              };
            case 1:
              return {
                embeddings: dummyEmbeddings.slice(2),
                warnings: [warning2],
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
    });

    expect(result.warnings).toStrictEqual([warning1, warning2]);
  });
});

describe('logWarnings', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest.spyOn(logWarningsModule, 'logWarnings');
  });

  it('should call logWarnings with the correct warnings (single call path)', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ];

    await embedMany({
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: null,
        doEmbed: async () => ({
          embeddings: dummyEmbeddings,
          warnings: expectedWarnings,
        }),
      }),
      values: testValues,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: expectedWarnings,
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should call logWarnings with aggregated warnings from multiple calls', async () => {
    const warning1: Warning = {
      type: 'other',
      message: 'Warning from call 1',
    };
    const warning2: Warning = {
      type: 'unsupported',
      feature: 'dimensions',
    };

    let callCount = 0;

    await embedMany({
      model: new MockEmbeddingModelV3({
        maxEmbeddingsPerCall: 2,
        doEmbed: async () => {
          switch (callCount++) {
            case 0:
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                warnings: [warning1],
              };
            case 1:
              return {
                embeddings: dummyEmbeddings.slice(2),
                warnings: [warning2],
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [warning1, warning2],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });
});

function mockEmbed(
  expectedValues: Array<string>,
  embeddings: Array<Embedding>,
  usage?: EmbeddingModelUsage,
  response: Awaited<ReturnType<EmbeddingModelV3['doEmbed']>>['response'] = {
    headers: {},
    body: {},
  },
  providerMetadata?: Awaited<
    ReturnType<EmbeddingModelV3['doEmbed']>
  >['providerMetadata'],
): EmbeddingModelV3['doEmbed'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { embeddings, usage, response, providerMetadata, warnings: [] };
  };
}
