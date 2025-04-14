import assert from 'node:assert';
import {
  MockEmbeddingModelV2,
  mockEmbed,
} from '../test/mock-embedding-model-v2';
import { MockTracer } from '../test/mock-tracer';
import { embed } from './embed';

const dummyEmbedding = [0.1, 0.2, 0.3];
const testValue = 'sunny day at the beach';

describe('result.embedding', () => {
  it('should generate embedding', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV2({
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
      model: new MockEmbeddingModelV2({
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
      model: new MockEmbeddingModelV2({
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
      model: new MockEmbeddingModelV2({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.usage, { tokens: 10 });
  });
});

describe('options.headers', () => {
  it('should set headers', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV2({
        doEmbed: async ({ headers }) => {
          assert.deepStrictEqual(headers, {
            'custom-request-header': 'request-header-value',
          });

          return { embeddings: [dummyEmbedding] };
        },
      }),
      value: testValue,
      headers: { 'custom-request-header': 'request-header-value' },
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});

describe('options.providerOptions', () => {
  it('should pass provider options to model', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV2({
        doEmbed: async ({ providerOptions }) => {
          expect(providerOptions).toStrictEqual({
            aProvider: { someKey: 'someValue' },
          });

          return { embeddings: [[1, 2, 3]] };
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

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV2({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
      experimental_telemetry: { tracer },
    });

    expect(tracer.jsonSpans).toMatchSnapshot();
  });

  it('should record telemetry data when enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV2({
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
      model: new MockEmbeddingModelV2({
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
