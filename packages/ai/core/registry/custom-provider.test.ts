import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { MockEmbeddingModelV2 } from '../test/mock-embedding-model-v2';
import { MockImageModelV2 } from '../test/mock-image-model-v2';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { customProvider } from './custom-provider';

const mockLanguageModel = new MockLanguageModelV2();
const mockEmbeddingModel = new MockEmbeddingModelV2();
const mockFallbackProvider = {
  languageModel: vi.fn(),
  textEmbeddingModel: vi.fn(),
  imageModel: vi.fn(),
};

describe('languageModel', () => {
  it('should return the language model if it exists', () => {
    const provider = customProvider({
      languageModels: { 'test-model': mockLanguageModel },
    });

    expect(provider.languageModel('test-model')).toBe(mockLanguageModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.languageModel.mockReturnValue(mockLanguageModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.languageModel('test-model')).toBe(mockLanguageModel);
    expect(mockFallbackProvider.languageModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});
    expect(() => provider.languageModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});

describe('textEmbeddingModel', () => {
  it('should return the embedding model if it exists', () => {
    const provider = customProvider({
      textEmbeddingModels: { 'test-model': mockEmbeddingModel },
    });

    expect(provider.textEmbeddingModel('test-model')).toBe(mockEmbeddingModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.textEmbeddingModel.mockReturnValue(mockEmbeddingModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.textEmbeddingModel('test-model')).toBe(mockEmbeddingModel);
    expect(mockFallbackProvider.textEmbeddingModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.textEmbeddingModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});

describe('imageModel', () => {
  const mockImageModel = new MockImageModelV2();

  it('should return the image model if it exists', () => {
    const provider = customProvider({
      imageModels: { 'test-model': mockImageModel },
    });

    expect(provider.imageModel('test-model')).toBe(mockImageModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.imageModel = vi.fn().mockReturnValue(mockImageModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.imageModel('test-model')).toBe(mockImageModel);
    expect(mockFallbackProvider.imageModel).toHaveBeenCalledWith('test-model');
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.imageModel('test-model')).toThrow(NoSuchModelError);
  });
});
