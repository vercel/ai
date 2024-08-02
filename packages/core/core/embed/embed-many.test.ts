import assert from 'node:assert';
import {
  MockEmbeddingModelV1,
  mockEmbed,
} from '../test/mock-embedding-model-v1';
import { embedMany } from './embed-many';
import { MockTracer } from '../test/mock-tracer';
import { setTestTracer } from '../telemetry/get-tracer';

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

describe('result.embedding', () => {
  it('should generate embeddings', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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

describe('result.values', () => {
  it('should include values in the result', async () => {
    const result = await embedMany({
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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
    await embedMany({
      model: new MockEmbeddingModelV1({
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
      model: new MockEmbeddingModelV1({
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
      },
    });

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        attributes: {
          'operation.name': 'ai.embedMany test-function-id',
          'resource.name': 'test-function-id',
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.values': [
            '"sunny day at the beach"',
            '"rainy afternoon in the city"',
            '"snowy night in the mountains"',
          ],
          'ai.embeddings': ['[0.1,0.2,0.3]', '[0.4,0.5,0.6]', '[0.7,0.8,0.9]'],
          'ai.usage.tokens': 30,
        },
        events: [],
        name: 'ai.embedMany',
      },
      {
        attributes: {
          'ai.embeddings': ['[0.1,0.2,0.3]', '[0.4,0.5,0.6]'],
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.usage.tokens': 10,
          'ai.values': [
            '"sunny day at the beach"',
            '"rainy afternoon in the city"',
          ],
          'operation.name': 'ai.embedMany.doEmbed test-function-id',
          'resource.name': 'test-function-id',
        },
        events: [],
        name: 'ai.embedMany.doEmbed',
      },
      {
        attributes: {
          'ai.embeddings': ['[0.7,0.8,0.9]'],
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.usage.tokens': 20,
          'ai.values': ['"snowy night in the mountains"'],
          'operation.name': 'ai.embedMany.doEmbed test-function-id',
          'resource.name': 'test-function-id',
        },
        events: [],
        name: 'ai.embedMany.doEmbed',
      },
    ]);
  });

  it('should record telemetry data when enabled (single call path)', async () => {
    await embedMany({
      model: new MockEmbeddingModelV1({
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
      },
    });

    assert.deepStrictEqual(tracer.jsonSpans, [
      {
        attributes: {
          'operation.name': 'ai.embedMany test-function-id',
          'resource.name': 'test-function-id',
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.values': [
            '"sunny day at the beach"',
            '"rainy afternoon in the city"',
            '"snowy night in the mountains"',
          ],
          'ai.embeddings': ['[0.1,0.2,0.3]', '[0.4,0.5,0.6]', '[0.7,0.8,0.9]'],
          'ai.usage.tokens': 10,
        },
        events: [],
        name: 'ai.embedMany',
      },
      {
        attributes: {
          'operation.name': 'ai.embedMany.doEmbed test-function-id',
          'resource.name': 'test-function-id',
          'ai.embeddings': ['[0.1,0.2,0.3]', '[0.4,0.5,0.6]', '[0.7,0.8,0.9]'],
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.telemetry.functionId': 'test-function-id',
          'ai.telemetry.metadata.test1': 'value1',
          'ai.telemetry.metadata.test2': false,
          'ai.usage.tokens': 10,
          'ai.values': [
            '"sunny day at the beach"',
            '"rainy afternoon in the city"',
            '"snowy night in the mountains"',
          ],
        },
        events: [],
        name: 'ai.embedMany.doEmbed',
      },
    ]);
  });

  it('should not record telemetry inputs / outputs when disabled', async () => {
    await embedMany({
      model: new MockEmbeddingModelV1({
        maxEmbeddingsPerCall: null,
        doEmbed: mockEmbed(testValues, dummyEmbeddings, { tokens: 10 }),
      }),
      values: testValues,
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
          'operation.name': 'ai.embedMany',
        },
        events: [],
        name: 'ai.embedMany',
      },
      {
        attributes: {
          'ai.model.id': 'mock-model-id',
          'ai.model.provider': 'mock-provider',
          'ai.usage.tokens': 10,
          'operation.name': 'ai.embedMany.doEmbed',
        },
        events: [],
        name: 'ai.embedMany.doEmbed',
      },
    ]);
  });
});
