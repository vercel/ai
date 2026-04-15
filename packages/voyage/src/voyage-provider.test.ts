import { describe, it, expect } from 'vitest';
import { createVoyage } from './voyage-provider';
import { VoyageEmbeddingModel } from './voyage-embedding-model';
import { VoyageRerankingModel } from './reranking/voyage-reranking-model';

const provider = createVoyage({ apiKey: 'test-api-key' });

describe('createVoyage', () => {
  describe('embeddingModel', () => {
    it('should return a VoyageEmbeddingModel', () => {
      const model = provider.embeddingModel('voyage-3');
      expect(model).toBeInstanceOf(VoyageEmbeddingModel);
    });
  });

  describe('embedding', () => {
    it('should return a VoyageEmbeddingModel', () => {
      const model = provider.embedding('voyage-3');
      expect(model).toBeInstanceOf(VoyageEmbeddingModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should return a VoyageEmbeddingModel', () => {
      const model = provider.textEmbeddingModel('voyage-3');
      expect(model).toBeInstanceOf(VoyageEmbeddingModel);
    });
  });

  describe('textEmbedding', () => {
    it('should return a VoyageEmbeddingModel', () => {
      const model = provider.textEmbedding('voyage-3');
      expect(model).toBeInstanceOf(VoyageEmbeddingModel);
    });
  });

  describe('rerankingModel', () => {
    it('should return a VoyageRerankingModel', () => {
      const model = provider.rerankingModel('rerank-2');
      expect(model).toBeInstanceOf(VoyageRerankingModel);
    });
  });

  describe('reranking', () => {
    it('should return a VoyageRerankingModel', () => {
      const model = provider.reranking('rerank-2');
      expect(model).toBeInstanceOf(VoyageRerankingModel);
    });
  });
});
