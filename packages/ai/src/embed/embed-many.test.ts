import { EmbeddingModelV4 } from '@ai-sdk/provider';
import assert from 'node:assert';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { Embedding, EmbeddingModelUsage, Warning } from '../types';
import { createResolvablePromise } from '../util/create-resolvable-promise';
import { embedMany } from './embed-many';
import type { EmbedOnStartEvent, EmbedOnFinishEvent } from './embed-events';

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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
    const model = new MockEmbeddingModelV4({
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

describe('result.providerMetadata', () => {
  it('should include provider metadata when returned by the model', async () => {
    const providerMetadata = {
      gateway: { routing: { resolvedProvider: 'test-provider' } },
    };

    const result = await embedMany({
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call logWarnings with the correct warnings (single call path)', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
    ];

    await embedMany({
      model: new MockEmbeddingModelV4({
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
      model: new MockEmbeddingModelV4({
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

describe('options.experimental_onStart', () => {
  it('should send correct event information', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      telemetry: {
        functionId: 'test-function',
      },
      _internal: {
        generateCallId: () => 'test-call-id',
      },
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent).toMatchSnapshot();
  });

  it('should include telemetry fields', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: true,
        functionId: 'embed-many-fn',
      },
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.isEnabled).toBe(true);
    expect(startEvent.recordInputs).toBe(false);
    expect(startEvent.recordOutputs).toBe(true);
    expect(startEvent.functionId).toBe('embed-many-fn');
  });

  it('should accept deprecated experimental_telemetry as an alias for telemetry', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: true,
        functionId: 'embed-many-fn-deprecated',
      },
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.isEnabled).toBe(true);
    expect(startEvent.recordInputs).toBe(false);
    expect(startEvent.recordOutputs).toBe(true);
    expect(startEvent.functionId).toBe('embed-many-fn-deprecated');
  });

  it('should include model information', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.provider).toBe('mock-provider');
    expect(startEvent.modelId).toBe('mock-model-id');
    expect(startEvent.operationId).toBe('ai.embedMany');
  });

  it('should be called before doEmbed', async () => {
    const callOrder: string[] = [];

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: dummyEmbeddings, warnings: [] };
        },
      }),
      values: testValues,
      experimental_onStart: async () => {
        callOrder.push('onStart');
      },
    });

    expect(callOrder).toEqual(['onStart', 'doEmbed']);
  });

  it('should not break embedding when callback throws', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_onStart: async () => {
        throw new Error('callback error');
      },
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });

  it('should include providerOptions and headers', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      headers: { 'x-custom': 'header-value' },
      providerOptions: { myProvider: { key: 'value' } },
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.headers).toEqual({
      'x-custom': 'header-value',
      'user-agent': 'ai/0.0.0-test',
    });
    expect(startEvent.providerOptions).toEqual({
      myProvider: { key: 'value' },
    });
  });
});

describe('options.experimental_onFinish', () => {
  it('should send correct event information (single call path)', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, { tokens: 10 }),
      }),
      values: testValues,
      telemetry: {
        functionId: 'test-function',
      },
      _internal: {
        generateCallId: () => 'test-call-id',
      },
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent).toMatchSnapshot();
  });

  it('should send correct event information (chunked path)', async () => {
    let finishEvent!: EmbedOnFinishEvent;
    let callCount = 0;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 2,
        doEmbed: async () => {
          switch (callCount++) {
            case 0:
              return {
                embeddings: dummyEmbeddings.slice(0, 2),
                usage: { tokens: 10 },
                response: { headers: {}, body: {} },
                warnings: [],
              };
            case 1:
              return {
                embeddings: dummyEmbeddings.slice(2),
                usage: { tokens: 5 },
                response: { headers: {}, body: {} },
                warnings: [],
              };
            default:
              throw new Error('Unexpected call');
          }
        },
      }),
      values: testValues,
      _internal: {
        generateCallId: () => 'test-call-id',
      },
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.callId).toBe('test-call-id');
    expect(finishEvent.operationId).toBe('ai.embedMany');
    expect(finishEvent.embedding).toEqual(dummyEmbeddings);
    expect(finishEvent.usage).toEqual({ tokens: 15 });
    expect(finishEvent.value).toEqual(testValues);
    expect(finishEvent.response).toHaveLength(2);
  });

  it('should include embeddings and usage in event', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, { tokens: 15 }),
      }),
      values: testValues,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.embedding).toEqual(dummyEmbeddings);
    expect(finishEvent.usage).toEqual({ tokens: 15 });
    expect(finishEvent.value).toEqual(testValues);
  });

  it('should include model information', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.provider).toBe('mock-provider');
    expect(finishEvent.modelId).toBe('mock-model-id');
    expect(finishEvent.operationId).toBe('ai.embedMany');
  });

  it('should include responses data', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, undefined, {
          headers: { 'x-resp': 'val' },
          body: { result: 'ok' },
        }),
      }),
      values: testValues,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.response).toEqual([
      {
        headers: { 'x-resp': 'val' },
        body: { result: 'ok' },
      },
    ]);
  });

  it('should be called after doEmbed', async () => {
    const callOrder: string[] = [];

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: dummyEmbeddings, warnings: [] };
        },
      }),
      values: testValues,
      experimental_onFinish: async () => {
        callOrder.push('onFinish');
      },
    });

    expect(callOrder).toEqual(['doEmbed', 'onFinish']);
  });

  it('should not break embedding when callback throws', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_onFinish: async () => {
        throw new Error('callback error');
      },
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
  });
});

describe('options.experimental_onStart and experimental_onFinish together', () => {
  it('should have consistent callId across both events', async () => {
    let startEvent!: EmbedOnStartEvent;
    let finishEvent!: EmbedOnFinishEvent;

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      _internal: {
        generateCallId: () => 'consistent-call-id',
      },
      experimental_onStart: async event => {
        startEvent = event;
      },
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(startEvent.callId).toBe('consistent-call-id');
    expect(finishEvent.callId).toBe('consistent-call-id');
    expect(startEvent.callId).toBe(finishEvent.callId);
  });

  it('should call onStart before doEmbed and onFinish after', async () => {
    const callOrder: string[] = [];

    await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: dummyEmbeddings, warnings: [] };
        },
      }),
      values: testValues,
      experimental_onStart: async () => {
        callOrder.push('onStart');
      },
      experimental_onFinish: async () => {
        callOrder.push('onFinish');
      },
    });

    expect(callOrder).toEqual(['onStart', 'doEmbed', 'onFinish']);
  });

  it('should still call onFinish when onStart throws', async () => {
    let finishCalled = false;

    const result = await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: 5,
        doEmbed: mockEmbed(testValues, dummyEmbeddings),
      }),
      values: testValues,
      experimental_onStart: async () => {
        throw new Error('start error');
      },
      experimental_onFinish: async () => {
        finishCalled = true;
      },
    });

    assert.deepStrictEqual(result.embeddings, dummyEmbeddings);
    expect(finishCalled).toBe(true);
  });
});

function mockEmbed(
  expectedValues: Array<string>,
  embeddings: Array<Embedding>,
  usage?: EmbeddingModelUsage,
  response: Awaited<ReturnType<EmbeddingModelV4['doEmbed']>>['response'] = {
    headers: {},
    body: {},
  },
  providerMetadata?: Awaited<
    ReturnType<EmbeddingModelV4['doEmbed']>
  >['providerMetadata'],
): EmbeddingModelV4['doEmbed'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { embeddings, usage, response, providerMetadata, warnings: [] };
  };
}
