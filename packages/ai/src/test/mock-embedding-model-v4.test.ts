import { describe, it, expect } from 'vitest';
import { MockEmbeddingModelV4 } from './mock-embedding-model-v4';

describe('MockEmbeddingModelV4', () => {
  describe('doEmbed array form', () => {
    it('should return entries in order starting from the first', async () => {
      const model = new MockEmbeddingModelV4({
        doEmbed: [{ embeddings: [[1]] } as any, { embeddings: [[2]] } as any],
      });

      const r1 = await model.doEmbed({} as any);
      const r2 = await model.doEmbed({} as any);

      expect(r1.embeddings).toEqual([[1]]);
      expect(r2.embeddings).toEqual([[2]]);
    });
  });
});
