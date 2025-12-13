import { EmbeddingModelV3 } from '@ai-sdk/provider';
import assert from 'node:assert';
import { beforeEach, describe, expect, it, vi, vitest } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockTracer } from '../test/mock-tracer';
import { Embedding, EmbeddingModelUsage, Warning } from '../types';
import { embed } from './embed';

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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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
      model: new MockEmbeddingModelV3({
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

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV3({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_telemetry: { tracer },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });

  it('should record telemetry data when enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV3({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
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
    await embed({
      model: new MockEmbeddingModelV3({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
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
