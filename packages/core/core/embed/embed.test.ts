import assert from 'node:assert';
import { setTestTracer } from '../telemetry/get-tracer';
import {
  MockEmbeddingModelV1,
  mockEmbed,
} from '../test/mock-embedding-model-v1';
import { MockTracer } from '../test/mock-tracer';
import { embed } from './embed';

const dummyEmbedding = [0.1, 0.2, 0.3];
const testValue = 'sunny day at the beach';

describe('result.embedding', () => {
  it('should generate embedding', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV1({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});

describe('result.value', () => {
  it('should include value in the result', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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

describe('telemetry', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
    setTestTracer(tracer);
  });

  afterEach(() => {
    setTestTracer(undefined);
  });

  it('should not record any telemetry data when not explicitly enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV1({
        doEmbed: mockEmbed([testValue], [dummyEmbedding]),
      }),
      value: testValue,
    });

    assert.deepStrictEqual(tracer.jsonSpans, []);
  });

  it('should record telemetry data when enabled', async () => {
    await embed({
      model: new MockEmbeddingModelV1({
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
      },
    });

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        attributes: {
          'operation.name': 'ai.embed test-function-id',
          'resource.name': 'test-function-id',
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.value': '"sunny day at the beach"',
          'ai.embedding': '[0.1,0.2,0.3]',
          'ai.usage.tokens': 10,
        },
        events: [],
        name: 'ai.embed',
      },
      {
        attributes: {
          'operation.name': 'ai.embed.doEmbed test-function-id',
          'resource.name': 'test-function-id',
          'ai.embeddings': ['[0.1,0.2,0.3]'],
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.usage.tokens': 10,
          'ai.values': ['"sunny day at the beach"'],
        },
        events: [],
        name: 'ai.embed.doEmbed',
      },
    ]);
  });

  it('should not record telemetry inputs / outputs when disabled', async () => {
    await embed({
      model: new MockEmbeddingModelV1({
        doEmbed: mockEmbed([testValue], [dummyEmbedding], { tokens: 10 }),
      }),
      value: testValue,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
      },
    });

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.usage.tokens': 10,
          'operation.name': 'ai.embed',
        },
        events: [],
        name: 'ai.embed',
      },
      {
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.usage.tokens': 10,
          'operation.name': 'ai.embed.doEmbed',
        },
        events: [],
        name: 'ai.embed.doEmbed',
      },
    ]);
  });
});
