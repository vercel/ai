import { EmbeddingModelV4 } from '@ai-sdk/provider';
import assert from 'node:assert';
import { beforeEach, describe, expect, it, vi, vitest } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { Embedding, EmbeddingModelUsage, Warning } from '../types';
import { embed } from './embed';
import type { EmbedOnStartEvent, EmbedOnFinishEvent } from './embed-events';

const dummyEmbedding = [0.1, 0.2, 0.3];
const testValue = 'sunny day at the beach';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

describe('result.embedding', () => {
  it('should generate embedding', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});

describe('result.response', () => {
  it('should include response in the result', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], undefined, {
          body: { foo: 'bar' },
          headers: { foo: 'bar' },
        }),
      }),
      value: testValue,
    });

    expect(result.response?.body).toMatchInlineSnapshot(`
      {
        "foo": "bar",
      }
    `);
    expect(result.response?.headers).toMatchInlineSnapshot(`
      {
        "foo": "bar",
      }
    `);
  });
});

describe('result.value', () => {
  it('should include value in the result', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.value, testValue);
  });
});

describe('result.usage', () => {
  it('should include usage in the result', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.usage, { tokens: 10 });
  });
});

describe('result.providerMetadata', () => {
  it('should include provider metadata when returned by the model', async () => {
    const providerMetadata = {
      gateway: {
        routing: {
          resolvedProvider: 'test-provider',
        },
      },
    };

    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed(
          [testValue],
          [dummyEmbedding],
          undefined,
          {
            headers: {},
            body: {},
          },
          providerMetadata,
        ),
      }),
      value: testValue,
    });

    expect(result.providerMetadata).toStrictEqual(providerMetadata);
  });
});

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
            'user-agent': 'ai/0.0.0-test',
          });

          return { embeddings: [dummyEmbedding], warnings: [] };
        },
      }),
      value: testValue,
      headers: {
        'custom-request-header': 'request-header-value',
      },
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});

describe('options.providerOptions', () => {
  it('should pass provider options to model', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ providerOptions }) => {
          expect(providerOptions).toStrictEqual({
            aProvider: { someKey: 'someValue' },
          });

          return { embeddings: [[1, 2, 3]], warnings: [] };
        },
      }),
      value: 'test-input',
      providerOptions: {
        aProvider: { someKey: 'someValue' },
      },
    });

    expect(result.embedding).toStrictEqual([1, 2, 3]);
  });
});

describe('result.warnings', () => {
  it('should include warnings in the result', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported',
        feature: 'dimensions',
        details: 'Dimensions parameter not supported',
      },
    ];

    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async () => ({
          embeddings: [dummyEmbedding],
          warnings: expectedWarnings,
        }),
      }),
      value: testValue,
    });

    expect(result.warnings).toStrictEqual(expectedWarnings);
  });
});

describe('logWarnings', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest.spyOn(logWarningsModule, 'logWarnings');
  });

  it('should call logWarnings with the correct warnings', async () => {
    const expectedWarnings: Warning[] = [
      {
        type: 'other',
        message: 'Setting is not supported',
      },
      {
        type: 'unsupported',
        feature: 'dimensions',
        details: 'Dimensions parameter not supported',
      },
    ];

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async () => ({
          embeddings: [dummyEmbedding],
          warnings: expectedWarnings,
        }),
      }),
      value: testValue,
    });

    expect(logWarningsSpy).toHaveBeenCalledOnce();
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: expectedWarnings,
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });
});

describe('options.experimental_onStart', () => {
  it('should send correct event information', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_telemetry: {
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

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: true,
        functionId: 'embed-fn',
      },
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.isEnabled).toBe(true);
    expect(startEvent.recordInputs).toBe(false);
    expect(startEvent.recordOutputs).toBe(true);
    expect(startEvent.functionId).toBe('embed-fn');
  });

  it('should include model information', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_onStart: async event => {
        startEvent = event;
      },
    });

    expect(startEvent.provider).toBe('mock-provider');
    expect(startEvent.modelId).toBe('mock-model-id');
    expect(startEvent.operationId).toBe('ai.embed');
  });

  it('should be called before doEmbed', async () => {
    const callOrder: string[] = [];

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: [dummyEmbedding], warnings: [] };
        },
      }),
      value: testValue,
      experimental_onStart: async () => {
        callOrder.push('onStart');
      },
    });

    expect(callOrder).toEqual(['onStart', 'doEmbed']);
  });

  it('should not break embedding when callback throws', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_onStart: async () => {
        throw new Error('callback error');
      },
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });

  it('should include providerOptions and headers', async () => {
    let startEvent!: EmbedOnStartEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
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
  it('should send correct event information', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
      experimental_telemetry: {
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

  it('should include embedding and usage in event', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 15 }),
      }),
      value: testValue,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.embedding).toEqual(dummyEmbedding);
    expect(finishEvent.usage).toEqual({ tokens: 15 });
    expect(finishEvent.value).toBe(testValue);
  });

  it('should include model information', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.provider).toBe('mock-provider');
    expect(finishEvent.modelId).toBe('mock-model-id');
    expect(finishEvent.operationId).toBe('ai.embed');
  });

  it('should include warnings and providerMetadata', async () => {
    let finishEvent!: EmbedOnFinishEvent;
    const expectedWarnings: Warning[] = [
      { type: 'other', message: 'test warning' },
    ];
    const providerMetadata = {
      gateway: { routing: { resolvedProvider: 'test' } },
    };

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed(
          [testValue],
          [dummyEmbedding],
          undefined,
          { headers: {}, body: {} },
          providerMetadata,
          expectedWarnings,
        ),
      }),
      value: testValue,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.providerMetadata).toEqual(providerMetadata);
    expect(finishEvent.warnings).toEqual(expectedWarnings);
  });

  it('should include response data', async () => {
    let finishEvent!: EmbedOnFinishEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], undefined, {
          headers: { 'x-resp': 'val' },
          body: { result: 'ok' },
        }),
      }),
      value: testValue,
      experimental_onFinish: async event => {
        finishEvent = event;
      },
    });

    expect(finishEvent.response).toEqual({
      headers: { 'x-resp': 'val' },
      body: { result: 'ok' },
    });
  });

  it('should be called after doEmbed', async () => {
    const callOrder: string[] = [];

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: [dummyEmbedding], warnings: [] };
        },
      }),
      value: testValue,
      experimental_onFinish: async () => {
        callOrder.push('onFinish');
      },
    });

    expect(callOrder).toEqual(['doEmbed', 'onFinish']);
  });

  it('should not break embedding when callback throws', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_onFinish: async () => {
        throw new Error('callback error');
      },
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});

describe('options.experimental_onStart and experimental_onFinish together', () => {
  it('should have consistent callId across both events', async () => {
    let startEvent!: EmbedOnStartEvent;
    let finishEvent!: EmbedOnFinishEvent;

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
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

    await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => {
          callOrder.push('doEmbed');
          return { embeddings: [dummyEmbedding], warnings: [] };
        },
      }),
      value: testValue,
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

    const result = await embed({
      model: new MockEmbeddingModelV4({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_onStart: async () => {
        throw new Error('start error');
      },
      experimental_onFinish: async () => {
        finishCalled = true;
      },
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
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
  warnings: Warning[] = [],
): EmbeddingModelV4['doEmbed'] {
  return async ({ values }) => {
    assert.deepStrictEqual(expectedValues, values);
    return { embeddings, usage, response, providerMetadata, warnings };
  };
}
