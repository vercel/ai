import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider';
import { postJsonToApi } from '@ai-sdk/provider-utils';
import { GoogleVertexEmbeddingModel } from './google-vertex-embedding-model';

// Mock the postJsonToApi utility
vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const actual = await importOriginal<
    typeof import('@ai-sdk/provider-utils')
  >();
  return {
    ...actual,
    postJsonToApi: vi.fn(),
  };
});

describe('GoogleVertexEmbeddingModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default successful response
    (postJsonToApi as any).mockResolvedValue({
      responseHeaders: {},
      value: {
        predictions: [
          {
            embeddings: {
              values: [0.1, 0.2, 0.3],
              statistics: { token_count: 1 },
            },
          },
        ],
      },
    });
  });

  describe('header merging logic', () => {
    const mockModelId = 'textembedding-gecko@001';
    const mockSettings = { outputDimensionality: 768 };

    it('handles all header sources being undefined', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({}),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {},
        }),
      );
    });

    it('handles generateAuthToken returning null/undefined', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Test': 'test' }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Test': 'test',
          },
        }),
      );
    });

    it('combines all header sources correctly', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Static': 'static' }),
      });

      await model.doEmbed({
        values: ['test'],
        headers: { 'X-Request': 'request' },
      });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Request': 'request',
            'X-Static': 'static',
          },
        }),
      );
    });

    it('handles experimental_getHeadersAsync returning undefined', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Static': 'static' }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Static': 'static',
          },
        }),
      );
    });

    it('prioritizes headers correctly when overlapping', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Common': 'static' }),
      });

      await model.doEmbed({
        values: ['test'],
        headers: { 'X-Common': 'request' },
      });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Common': 'request',
          },
        }),
      );
    });

    it('handles headers function returning undefined values', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Static': undefined }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {},
        }),
      );
    });

    it('handles generateAuthToken returning undefined', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({ 'X-Static': 'static' }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Static': 'static',
          },
        }),
      );
    });
  });

  describe('async headers handling', () => {
    const mockModelId = 'textembedding-gecko@001';
    const mockSettings = { outputDimensionality: 768 };

    it('handles async function headers from config', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: async () => ({
          'X-Async-Header': 'async-value',
        }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Async-Header': 'async-value',
          },
        }),
      );
    });

    it('handles Promise-based headers', async () => {
      const model = new GoogleVertexEmbeddingModel(mockModelId, mockSettings, {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: Promise.resolve({
          'X-Promise-Header': 'promise-value',
        }),
      });

      await model.doEmbed({ values: ['test'] });

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Promise-Header': 'promise-value',
          },
        }),
      );
    });

    it('merges async config headers with sync request headers', async () => {
      const model = new GoogleVertexEmbeddingModel(
        'textembedding-gecko@001',
        { outputDimensionality: 768 },
        {
          provider: 'google-vertex',
          region: 'us-central1',
          project: 'test-project',
          headers: async () => ({
            'X-Async-Config': 'async-config-value',
            'X-Common': 'config-value',
          }),
        },
      );

      const embedPromise = model.doEmbed({
        values: ['test'],
        headers: {
          'X-Sync-Request': 'sync-request-value',
          'X-Common': 'request-value', // Should override config value
        },
      });

      await embedPromise;

      expect(postJsonToApi).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Async-Config': 'async-config-value',
            'X-Sync-Request': 'sync-request-value',
            'X-Common': 'request-value', // Request headers take precedence
          },
        }),
      );
    });
  });

  it('throws TooManyEmbeddingValuesForCallError when too many values provided', async () => {
    const model = new GoogleVertexEmbeddingModel(
      'textembedding-gecko@001',
      { outputDimensionality: 768 },
      {
        provider: 'google-vertex',
        region: 'us-central1',
        project: 'test-project',
        headers: () => ({}),
      },
    );

    const tooManyValues = Array(2049).fill('test');
    await expect(model.doEmbed({ values: tooManyValues })).rejects.toThrow(
      TooManyEmbeddingValuesForCallError,
    );
  });
});
