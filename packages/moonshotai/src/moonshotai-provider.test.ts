import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { MoonshotAIChatLanguageModel } from './moonshotai-chat-language-model';

const MoonshotAIChatLanguageModelMock =
  MoonshotAIChatLanguageModel as unknown as Mock;

vi.mock('./moonshotai-chat-language-model', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    settings: any,
  ) {
    this.provider = 'moonshotai.chat';
    this.modelId = modelId;
    this.settings = settings;
  });
  return {
    MoonshotAIChatLanguageModel: mockConstructor,
  };
});

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
    withoutTrailingSlash: vi.fn(url => url),
  };
});

describe('MoonshotAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMoonshotAI', () => {
    it('should create a MoonshotAIProvider instance with default options', () => {
      const provider = createMoonshotAI();
      const model = provider('model-id');

      const constructorCall = MoonshotAIChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'MOONSHOT_API_KEY',
        description: 'Moonshot API key',
      });
    });

    it('should create a MoonshotAIProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createMoonshotAI(options);
      const model = provider('model-id');

      const constructorCall = MoonshotAIChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'MOONSHOT_API_KEY',
        description: 'Moonshot API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createMoonshotAI();
      const modelId = 'kimi-k2.5';

      const model = provider(modelId);
      expect(model).toBeInstanceOf(MoonshotAIChatLanguageModel);
    });
  });

  describe('chatModel', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createMoonshotAI();
      const modelId = 'moonshot-v1-8k';

      const model = provider.chatModel(modelId);

      expect(model).toBeInstanceOf(MoonshotAIChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createMoonshotAI();
      const modelId = 'moonshot-v1-32k';

      const model = provider.languageModel(modelId);

      expect(model).toBeInstanceOf(MoonshotAIChatLanguageModel);
    });
  });
});
