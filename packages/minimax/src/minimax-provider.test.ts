import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { NoSuchModelError } from '@ai-sdk/provider';
import { MiniMaxChatLanguageModel } from './minimax-chat-language-model';
import { createMiniMax } from './minimax-provider';

const MiniMaxChatLanguageModelMock =
  MiniMaxChatLanguageModel as unknown as Mock;

vi.mock('./minimax-chat-language-model', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    config: any,
  ) {
    this.provider = 'minimax.chat';
    this.modelId = modelId;
    this.config = config;
  });
  return {
    MiniMaxChatLanguageModel: mockConstructor,
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

describe('MiniMaxProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMiniMax', () => {
    it('should create a MiniMaxProvider instance with default options', () => {
      const provider = createMiniMax();
      provider('MiniMax-M3');

      const constructorCall = MiniMaxChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'MINIMAX_API_KEY',
        description: 'MiniMax API key',
      });
    });

    it('should create a MiniMaxProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createMiniMax(options);
      provider('MiniMax-M3');

      const constructorCall = MiniMaxChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[1];
      config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'MINIMAX_API_KEY',
        description: 'MiniMax API key',
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createMiniMax();
      const model = provider('MiniMax-M3');
      expect(model).toBeInstanceOf(MiniMaxChatLanguageModel);
    });

    it('should construct the chat model with the expected config', () => {
      const provider = createMiniMax();
      provider('MiniMax-M3');

      const constructorCall = MiniMaxChatLanguageModelMock.mock.calls[0];
      const modelId = constructorCall[0];
      const config = constructorCall[1];

      expect(modelId).toBe('MiniMax-M3');
      expect(config.provider).toBe('minimax.chat');
      expect(config.includeUsage).toBe(true);
      expect(config.supportsStructuredOutputs).toBe(true);
      expect(config.errorStructure).toBeDefined();
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://api.minimax.io/v1/chat/completions',
      );
    });
  });

  describe('languageModel', () => {
    it('should construct a language model', () => {
      const provider = createMiniMax();
      const model = provider.languageModel('MiniMax-M2.5');
      expect(model).toBeInstanceOf(MiniMaxChatLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model', () => {
      const provider = createMiniMax();
      const model = provider.chat('MiniMax-M2.1');
      expect(model).toBeInstanceOf(MiniMaxChatLanguageModel);
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for embeddingModel', () => {
      const provider = createMiniMax();
      expect(() => provider.embeddingModel('foo')).toThrow(NoSuchModelError);
    });

    it('should throw NoSuchModelError for imageModel', () => {
      const provider = createMiniMax();
      expect(() => provider.imageModel('foo')).toThrow(NoSuchModelError);
    });
  });
});
