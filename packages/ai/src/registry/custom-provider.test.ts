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
<<<<<<< HEAD
=======

describe('videoModel', () => {
  const mockVideoModel = new MockVideoModelV4();

  it('should return the video model if it exists', () => {
    const provider = customProvider({
      videoModels: { 'test-model': mockVideoModel },
    });

    expect(provider.videoModel('test-model')).toBe(mockVideoModel);
  });

  it('should convert v3 video models to v4 on demand', () => {
    const provider = customProvider({
      videoModels: { 'v3-model': new MockVideoModelV3() },
    });

    expect(provider.videoModel('v3-model').specificationVersion).toBe('v4');
  });

  it('should use fallback provider if model not found and fallback exists', () => {
    mockFallbackProvider.videoModel = vi.fn().mockReturnValue(mockVideoModel);

    const provider = customProvider({
      fallbackProvider: mockFallbackProvider,
    });

    expect(provider.videoModel('test-model')).toBe(mockVideoModel);
    expect(mockFallbackProvider.videoModel).toHaveBeenCalledWith('test-model');
  });

  it('should convert v3 fallback provider video models to v4', () => {
    const fallbackProvider = Object.assign(new MockProviderV3(), {
      videoModel(modelId: string) {
        expect(this).toBe(fallbackProvider);
        expect(modelId).toBe('test-model');
        return new MockVideoModelV3();
      },
    });

    const provider = customProvider({ fallbackProvider });

    expect(provider.videoModel('test-model').specificationVersion).toBe('v4');
  });

  it('should throw NoSuchModelError if model not found and no fallback', () => {
    const provider = customProvider({});

    expect(() => provider.videoModel('test-model')).toThrow(NoSuchModelError);
  });
});

describe('files', () => {
  it('should return the files interface if it exists', () => {
    const provider = customProvider({
      files: mockFiles,
    });

    expect(provider.files()).toBe(mockFiles);
  });

  it('should use fallback provider files if files is not configured and fallback exists', () => {
    const fallbackProvider = {
      ...mockFallbackProvider,
      files: vi.fn().mockReturnValue(mockFiles),
    };

    const provider = customProvider({
      fallbackProvider,
    });

    expect(provider.files()).toBe(mockFiles);
    expect(fallbackProvider.files).toHaveBeenCalled();
  });

  it('should not expose files if files is not configured and fallback does not support files', () => {
    const provider = customProvider({});

    expect(provider.files).toBeUndefined();
  });
});

describe('skills', () => {
  it('should return the skills interface if it exists', () => {
    const provider = customProvider({
      skills: mockSkills,
    });

    expect(provider.skills()).toBe(mockSkills);
  });

  it('should use fallback provider skills if skills is not configured and fallback exists', () => {
    const fallbackProvider = {
      ...mockFallbackProvider,
      skills: vi.fn().mockReturnValue(mockSkills),
    };

    const provider = customProvider({
      fallbackProvider,
    });

    expect(provider.skills()).toBe(mockSkills);
    expect(fallbackProvider.skills).toHaveBeenCalled();
  });

  it('should not expose skills if skills is not configured and fallback does not support skills', () => {
    const provider = customProvider({});

    expect(provider.skills).toBeUndefined();
  });
});
>>>>>>> 8f72832752 (fix: preserve v3 video models in custom-provider fallbacks (#21119))
