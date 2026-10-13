import { describe, expect, it } from 'vitest';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

const config = {
  provider: 'google-vertex',
  headers: () => ({}),
  baseURL: 'https://vertex.example.test/v1/publishers/google',
};

describe('GoogleVertexEmbeddingModel issue #19952', () => {
  it('advertises the documented :predict batch limit', () => {
    expect(
      new GoogleVertexEmbeddingModel('gemini-embedding-001', config)
        .maxEmbeddingsPerCall,
    ).toBe(250);
    expect(
      new GoogleVertexEmbeddingModel('text-embedding-005', config)
        .maxEmbeddingsPerCall,
    ).toBe(250);
  });

  it.each(['gemini-embedding-2', 'gemini-embedding-2-preview'] as const)(
    'retains the :embedContent one-value limit for %s',
    modelId => {
      expect(
        new GoogleVertexEmbeddingModel(modelId, config).maxEmbeddingsPerCall,
      ).toBe(1);
    },
  );
});
