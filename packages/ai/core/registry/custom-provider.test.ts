import { describe, it, expect, vi } from 'vitest';
import { experimental_customProvider } from './custom-provider';
import { NoSuchModelError } from '@ai-sdk/provider';

import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { MockEmbeddingModelV1 } from '../test/mock-embedding-model-v1';

const mockLanguageModel = new MockLanguageModelV1();
const mockEmbeddingModel = new MockEmbeddingModelV1();
const mockFallbackProvider = {
  languageModel: vi.fn(),
  textEmbeddingModel: vi.fn(),
};

describe('languageModel', () => {
  it('should return the language model if it exists', () => {
    const provider = experimental_customProvider({
      languageModels: { 'test-model': mockLanguageModel },
    });

    expect(provider.languageModel('test-model')).toBe(mockLanguageModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.languageModel.mockReturnValue(mockLanguageModel);

    const provider = experimental_customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.languageModel('test-model')).toBe(mockLanguageModel);
    expect(mockFallbackProvider.languageModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = experimental_customProvider({});
    expect(() => provider.languageModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});

describe('textEmbeddingModel', () => {
  it('should return the embedding model if it exists', () => {
    const provider = experimental_customProvider({
      textEmbeddingModels: { 'test-model': mockEmbeddingModel },
    });

    expect(provider.textEmbeddingModel('test-model')).toBe(mockEmbeddingModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.textEmbeddingModel.mockReturnValue(mockEmbeddingModel);

    const provider = experimental_customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.textEmbeddingModel('test-model')).toBe(mockEmbeddingModel);
    expect(mockFallbackProvider.textEmbeddingModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = experimental_customProvider({});

    expect(() => provider.textEmbeddingModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});
