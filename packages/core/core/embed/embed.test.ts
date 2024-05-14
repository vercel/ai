import assert from 'node:assert';
import { MockEmbeddingModelV1 } from '../test/mock-embedding-model-v1';
import { embed } from './embed';

const dummyEmbedding = [0.1, 0.2, 0.3];
const testValue = 'sunny day at the beach';

describe('result.embedding', () => {
  it('should generate embedding', async () => {
    const result = await embed({
      model: new MockEmbeddingModelV1({
        doEmbed: async ({ values }) => {
          assert.deepStrictEqual(values, [testValue]);

          return {
            embeddings: [dummyEmbedding],
          };
        },
      }),
      value: testValue,
    });

    assert.deepStrictEqual(result.embedding, dummyEmbedding);
  });
});
