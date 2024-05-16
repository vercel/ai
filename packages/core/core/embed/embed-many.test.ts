import assert from 'node:assert';
import {
  MockEmbeddingModelV1,
  mockEmbed,
} from '../test/mock-embedding-model-v1';
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
          if (callCount === 0) {
            assert.deepStrictEqual(values, testValues.slice(0, 2));
            callCount++;
            return { embeddings: dummyEmbeddings.slice(0, 2) };
          }

          if (callCount === 1) {
            assert.deepStrictEqual(values, testValues.slice(2));
            callCount++;
            return { embeddings: dummyEmbeddings.slice(2) };
          }

          throw new Error('Unexpected call');
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
