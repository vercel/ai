import { describe, expect, it } from 'vitest';
import { createGoogleVertex } from './google-vertex-provider-base';

describe('GoogleVertexEmbeddingModel issue #19952', () => {
  const vertex = createGoogleVertex({ apiKey: 'test-api-key' });

  it('advertises the documented :predict batch limit', () => {
    expect(
      vertex.embeddingModel('gemini-embedding-001').maxEmbeddingsPerCall,
    ).toBe(250);
    expect(
      vertex.embeddingModel('text-embedding-005').maxEmbeddingsPerCall,
    ).toBe(250);
  });

  it('retains the :embedContent one-value limit', () => {
    expect(
      vertex.embeddingModel('gemini-embedding-2').maxEmbeddingsPerCall,
    ).toBe(1);
    expect(
      vertex.embeddingModel('gemini-embedding-2-preview').maxEmbeddingsPerCall,
    ).toBe(1);
  });
});
