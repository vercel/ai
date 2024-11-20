import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createTogetherAI } from './togetherai-provider';
import {
  OpenAICompatibleProvider,
  createOpenAICompatible,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { TogetherAIChatSettings } from './togetherai-chat-settings';

vi.mock('@ai-sdk/openai-compatible', () => {
  const actual = vi.importActual('@ai-sdk/openai-compatible');
  return {
    ...actual,
    createOpenAICompatible: vi.fn(),
  };
});

describe('TogetherAIProvider', () => {
  let mockLanguageModel: LanguageModelV1;
  let mockEmbeddingModel: EmbeddingModelV1<string>;
  let mockOpenAICompatibleProvider: OpenAICompatibleProvider;
  let createOpenAICompatibleMock: Mock;

  beforeEach(() => {
    // Mock implementations of models
    mockLanguageModel = {} as LanguageModelV1;
    mockEmbeddingModel = {} as EmbeddingModelV1<string>;

    // Mock the OpenAICompatibleProvider methods
    mockOpenAICompatibleProvider = Object.assign(
      vi.fn(() => mockLanguageModel),
      {
        chatModel: vi.fn(() => mockLanguageModel),
        completionModel: vi.fn(() => mockLanguageModel),
        languageModel: vi.fn(() => mockLanguageModel),
        textEmbeddingModel: vi.fn(() => mockEmbeddingModel),
      },
    );

    // Mock createOpenAICompatible to return our mock provider
    createOpenAICompatibleMock = createOpenAICompatible as unknown as Mock;
    createOpenAICompatibleMock.mockReturnValue(mockOpenAICompatibleProvider);
  });

  describe('createTogetherAI', () => {
    it('should create a TogetherAIProvider instance', () => {
      const provider = createTogetherAI();
      expect(provider).toBeDefined();
      expect(typeof provider).toBe('function');
    });

    it('should return a default language model when called as a function', () => {
      const provider = createTogetherAI();
      const modelId = 'foo-model-id';
      const settings = { user: 'foo-user' };

      const model = provider(modelId, settings);

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.languageModel).toHaveBeenCalledWith(
        modelId,
        settings,
      );
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model using the openAICompatibleProvider', () => {
      const provider = createTogetherAI();
      const modelId = 'together-chat-model';
      const settings: TogetherAIChatSettings = { user: 'foo-user' };

      const model = provider.chatModel(modelId, settings);

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.chatModel).toHaveBeenCalledWith(
        modelId,
        { defaultObjectGenerationMode: 'json', ...settings },
      );
    });
  });

  describe('completionModel', () => {
    it('should construct a completion model using the openAICompatibleProvider', () => {
      const provider = createTogetherAI();
      const modelId = 'together-completion-model';
      const settings: TogetherAIChatSettings = { user: 'foo-user' };

      const model = provider.completionModel(modelId, settings);

      expect(model).toBe(mockLanguageModel);
      expect(mockOpenAICompatibleProvider.languageModel).toHaveBeenCalledWith(
        modelId,
        settings,
      );
    });
  });

  describe('textEmbeddingModel', () => {
    it('should construct a text embedding model using the openAICompatibleProvider', () => {
      const provider = createTogetherAI();
      const modelId = 'together-embedding-model';
      const settings: TogetherAIChatSettings = { user: 'foo-user' };

      const model = provider.textEmbeddingModel(modelId, settings);

      expect(model).toBe(mockEmbeddingModel);
      expect(
        mockOpenAICompatibleProvider.textEmbeddingModel,
      ).toHaveBeenCalledWith(modelId, settings);
    });
  });
});
