import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTwelveLabs } from './twelvelabs-provider';
import { TwelveLabsLanguageModel } from './twelvelabs-language-model';
import { TwelveLabsEmbeddingModel } from './twelvelabs-embedding-model';
import { NoSuchModelError } from '@ai-sdk/provider';

// Mock the imported modules
vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const mod = await importOriginal<typeof import('@ai-sdk/provider-utils')>();
  return {
    ...mod,
    loadApiKey: vi
      .fn()
      .mockImplementation(({ apiKey }) => apiKey || 'test-api-key'),
    withoutTrailingSlash: vi.fn().mockImplementation(url => url),
  };
});

vi.mock('twelvelabs-js', () => ({
  TwelveLabs: vi.fn().mockImplementation(() => ({
    indexes: {
      list: vi.fn().mockResolvedValue({
        data: [
          { indexName: 'ai-sdk-pegasus', id: 'pegasus-index-id' },
          { indexName: 'ai-sdk-marengo', id: 'marengo-index-id' },
        ],
      }),
      create: vi.fn().mockImplementation((params: any) => {
        if (params.indexName.includes('pegasus')) {
          return Promise.resolve({ id: 'pegasus-index-id' });
        }
        return Promise.resolve({ id: 'marengo-index-id' });
      }),
    },
  })),
}));

vi.mock('./twelvelabs-language-model', () => ({
  TwelveLabsLanguageModel: vi.fn(),
}));

vi.mock('./twelvelabs-embedding-model', () => ({
  TwelveLabsEmbeddingModel: vi.fn(),
}));

describe('twelvelabs-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TWELVELABS_API_KEY;
    delete process.env.TWELVELABS_PEGASUS_INDEX_NAME;
    delete process.env.TWELVELABS_MARENGO_INDEX_NAME;
  });

  describe('createTwelveLabs', () => {
    it('should create a provider with default settings', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
      expect(provider.languageModel).toBeDefined();
      expect(provider.chat).toBeDefined();
      expect(provider.embedding).toBeDefined();
      expect(provider.textEmbedding).toBeDefined();
      expect(provider.textEmbeddingModel).toBeDefined();
    });

    it('should use environment variables when not provided', () => {
      process.env.TWELVELABS_API_KEY = 'env-api-key';
      process.env.TWELVELABS_PEGASUS_INDEX_NAME = 'env-pegasus-index';
      process.env.TWELVELABS_MARENGO_INDEX_NAME = 'env-marengo-index';

      const provider = createTwelveLabs();

      expect(provider).toBeDefined();
    });

    it('should create language model with provider function', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider('pegasus1.2');

      expect(model).toBeDefined();
    });

    it('should create language model with languageModel method', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider.languageModel('marengo2.7');

      expect(model).toBeDefined();
    });

    it('should create language model with chat method', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider.chat('pegasus1.2');

      expect(model).toBeDefined();
    });

    it('should create embedding model', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider.embedding('marengo2.7');

      expect(TwelveLabsEmbeddingModel).toHaveBeenCalledWith(
        'marengo2.7',
        expect.objectContaining({
          modelId: 'marengo2.7',
        }),
      );
    });

    it('should create text embedding model with textEmbedding method', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider.textEmbedding('marengo2.7');

      expect(TwelveLabsEmbeddingModel).toHaveBeenCalledWith(
        'marengo2.7',
        expect.objectContaining({
          modelId: 'marengo2.7',
        }),
      );
    });

    it('should create text embedding model with textEmbeddingModel method', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });
      const model = provider.textEmbeddingModel('marengo2.7');

      expect(TwelveLabsEmbeddingModel).toHaveBeenCalledWith(
        'marengo2.7',
        expect.objectContaining({
          modelId: 'marengo2.7',
        }),
      );
    });

    it('should throw NoSuchModelError for image model', () => {
      const provider = createTwelveLabs({ apiKey: 'test-key' });

      expect(() => provider.imageModel('any-model')).toThrow(NoSuchModelError);
      expect(() => provider.imageModel('any-model')).toThrow(
        'No such imageModel: any-model',
      );
    });

    it('should accept custom base URL', () => {
      const provider = createTwelveLabs({
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com',
      });

      expect(provider).toBeDefined();
    });

    it('should accept custom headers', () => {
      const provider = createTwelveLabs({
        apiKey: 'test-key',
        headers: { 'X-Custom-Header': 'value' },
      });

      expect(provider).toBeDefined();
    });

    it('should accept custom index names', () => {
      const provider = createTwelveLabs({
        apiKey: 'test-key',
        pegasusIndexName: 'custom-pegasus-index',
        marengoIndexName: 'custom-marengo-index',
      });

      expect(provider).toBeDefined();
    });
  });

  describe('default export', () => {
    it('should provide a default instance', async () => {
      // Import the default export
      const { twelvelabs } = await import('./twelvelabs-provider');

      expect(twelvelabs).toBeDefined();
      expect(typeof twelvelabs).toBe('function');
      expect(twelvelabs.languageModel).toBeDefined();
      expect(twelvelabs.chat).toBeDefined();
      expect(twelvelabs.embedding).toBeDefined();
    });
  });
});
