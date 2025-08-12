import { createGitHubModels } from './github-models-provider';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
  OpenAICompatibleCompletionLanguageModel: vi.fn(),
  OpenAICompatibleEmbeddingModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('GitHubModelsProvider', () => {
  let mockLanguageModel: LanguageModelV2;

  beforeEach(() => {
    mockLanguageModel = {} as LanguageModelV2;
    vi.clearAllMocks();
  });

  describe('createGitHubModels', () => {
    it('should create a provider instance with default options', () => {
      const provider = createGitHubModels();
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'GITHUB_TOKEN',
        description: 'GitHub Models',
      });
    });

    it('should create a provider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createGitHubModels(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'GITHUB_TOKEN',
        description: 'GitHub Models',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createGitHubModels();
      const modelId = 'model-id';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'github-models',
        }),
      );
    });

    it('should construct a language model with correct configuration', () => {
      const provider = createGitHubModels();
      const modelId = 'model-id';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
      expect(OpenAICompatibleChatLanguageModelMock).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'github-models',
        }),
      );
    });

    it('should return an embeddings model when called as a function', () => {
      const provider = createGitHubModels();
      const modelId = 'model-id';

      const model = provider.textEmbeddingModel(modelId);
      expect(model).toBeInstanceOf(OpenAICompatibleEmbeddingModel);
      expect(OpenAICompatibleEmbeddingModel).toHaveBeenCalledWith(
        modelId,
        expect.objectContaining({
          provider: 'github-models',
        }),
      );
    });
  });
});
