import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { MockEmbeddingModelV3 } from '../test/mock-embedding-model-v3';
import { MockImageModelV3 } from '../test/mock-image-model-v3';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { MockRerankingModelV3 } from '../test/mock-reranking-model-v3';
import { MockSpeechModelV3 } from '../test/mock-speech-model-v3';
import { MockTranscriptionModelV3 } from '../test/mock-transcription-model-v3';
import { customProvider } from './custom-provider';

const mockLanguageModel = new MockLanguageModelV3();
const mockEmbeddingModel = new MockEmbeddingModelV3();
const mockRerankingModel = new MockRerankingModelV3();
const mockFallbackProvider = {
  specificationVersion: 'v3' as const,
  languageModel: vi.fn(),
  embeddingModel: vi.fn(),
  imageModel: vi.fn(),
  transcriptionModel: vi.fn(),
  speechModel: vi.fn(),
  rerankingModel: vi.fn(),
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

describe('embeddingModel', () => {
  it('should return the embedding model if it exists', () => {
    const provider = customProvider({
      embeddingModels: { 'test-model': mockEmbeddingModel },
    });

    expect(provider.embeddingModel('test-model')).toBe(mockEmbeddingModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.embeddingModel.mockReturnValue(mockEmbeddingModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.embeddingModel('test-model')).toBe(mockEmbeddingModel);
    expect(mockFallbackProvider.embeddingModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.embeddingModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});

describe('imageModel', () => {
  const mockImageModel = new MockImageModelV3();

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

describe('transcriptionModel', () => {
  const mockTranscriptionModel = new MockTranscriptionModelV3();

  it('should return the transcription model if it exists', () => {
    const provider = customProvider({
      transcriptionModels: { 'test-model': mockTranscriptionModel },
    });

    expect(provider.transcriptionModel('test-model')).toBe(
      mockTranscriptionModel,
    );
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.transcriptionModel = vi
      .fn()
      .mockReturnValue(mockTranscriptionModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.transcriptionModel('test-model')).toBe(
      mockTranscriptionModel,
    );
    expect(mockFallbackProvider.transcriptionModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.transcriptionModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});

describe('speechModel', () => {
  const mockSpeechModel = new MockSpeechModelV3();

  it('should return the speech model if it exists', () => {
    const provider = customProvider({
      speechModels: { 'test-model': mockSpeechModel },
    });

    expect(provider.speechModel('test-model')).toBe(mockSpeechModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.speechModel = vi.fn().mockReturnValue(mockSpeechModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.speechModel('test-model')).toBe(mockSpeechModel);
    expect(mockFallbackProvider.speechModel).toHaveBeenCalledWith('test-model');
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.speechModel('test-model')).toThrow(NoSuchModelError);
  });
});

describe('rerankingModel', () => {
  it('should return the reranking model if it exists', () => {
    const provider = customProvider({
      rerankingModels: { 'test-model': mockRerankingModel },
    });

    expect(provider.rerankingModel('test-model')).toBe(mockRerankingModel);
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.rerankingModel.mockReturnValue(mockRerankingModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.rerankingModel('test-model')).toBe(mockRerankingModel);
    expect(mockFallbackProvider.rerankingModel).toHaveBeenCalledWith(
      'test-model',
    );
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.rerankingModel('test-model')).toThrow(
      NoSuchModelError,
    );
  });
});
