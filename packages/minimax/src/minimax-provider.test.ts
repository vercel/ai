import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { NoSuchModelError } from '@ai-sdk/provider';
import { AnthropicLanguageModel } from '@ai-sdk/anthropic/internal';
import { createMiniMax } from './minimax-provider';

const AnthropicLanguageModelMock = AnthropicLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/anthropic/internal', () => {
  const mockConstructor = vi.fn().mockImplementation(function (
    this: any,
    modelId: string,
    config: any,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
    this.config = config;
  });
  return {
    AnthropicLanguageModel: mockConstructor,
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

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
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
        baseURL: 'https://custom.url/anthropic/v1',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createMiniMax(options);
      provider('MiniMax-M3');

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
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
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });

    it('should construct the model with the Anthropic-compatible config', () => {
      const provider = createMiniMax();
      provider('MiniMax-M3');

      const constructorCall = AnthropicLanguageModelMock.mock.calls[0];
      const modelId = constructorCall[0];
      const config = constructorCall[1];

      expect(modelId).toBe('MiniMax-M3');
      // provider prefix `minimax` is the provider-options namespace
      expect(config.provider).toBe('minimax.messages');
      expect(config.baseURL).toBe('https://api.minimax.io/anthropic/v1');

      const headers = config.headers();
      expect(headers['x-api-key']).toBe('mock-api-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });

  describe('languageModel', () => {
    it('should construct a language model', () => {
      const provider = createMiniMax();
      const model = provider.languageModel('MiniMax-M2.5');
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });
  });

  describe('chat', () => {
    it('should construct a chat model', () => {
      const provider = createMiniMax();
      const model = provider.chat('MiniMax-M2.1');
      expect(model).toBeInstanceOf(AnthropicLanguageModel);
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for embeddingModel', () => {
      const provider = createMiniMax();
      expect(() => provider.embeddingModel('foo')).toThrow(NoSuchModelError);
    });

    it('should throw NoSuchModelError for textEmbeddingModel', () => {
      const provider = createMiniMax();
      expect(() => provider.textEmbeddingModel('foo')).toThrow(
        NoSuchModelError,
      );
    });

    it('should throw NoSuchModelError for imageModel', () => {
      const provider = createMiniMax();
      expect(() => provider.imageModel('foo')).toThrow(NoSuchModelError);
    });
  });
});
