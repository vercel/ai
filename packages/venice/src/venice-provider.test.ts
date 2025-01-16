import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createVenice } from './venice-provider';
import { loadApiKey } from '@ai-sdk/provider-utils';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { VeniceAIImageModel } from './venice-image-model';

// Add type assertion for the mocked class
const OpenAICompatibleChatLanguageModelMock =
  OpenAICompatibleChatLanguageModel as unknown as Mock;

vi.mock('@ai-sdk/openai-compatible', () => ({
  OpenAICompatibleChatLanguageModel: vi.fn(),
}));

vi.mock('./venice-image-model', () => ({
  VeniceAIImageModel: vi.fn(),
}));

vi.mock('@ai-sdk/provider-utils', () => ({
  loadApiKey: vi.fn().mockReturnValue('mock-api-key'),
  withoutTrailingSlash: vi.fn(url => url),
}));

describe('VeniceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createVenice', () => {
    it('should create a VeniceProvider instance with default options', () => {
      const provider = createVenice();
      const model = provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: undefined,
        environmentVariableName: 'VENICE_API_KEY',
        description: 'Venice API key',
      });

      expect(config.provider).toBe('venice.chat');
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://api.venice.ai/api/v1/chat/completions'
      );
      expect(headers).toEqual({
        Authorization: 'Bearer mock-api-key'
      });
    });

    it('should create a VeniceProvider instance with custom options', () => {
      const options = {
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      };
      const provider = createVenice(options);
      provider('model-id');

      const constructorCall =
        OpenAICompatibleChatLanguageModelMock.mock.calls[0];
      const config = constructorCall[2];
      const headers = config.headers();

      expect(loadApiKey).toHaveBeenCalledWith({
        apiKey: 'custom-key',
        environmentVariableName: 'VENICE_API_KEY',
        description: 'Venice API key',
      });

      expect(config.provider).toBe('venice.chat');
      expect(config.url({ path: '/chat/completions' })).toBe(
        'https://custom.url/chat/completions'
      );
      expect(headers).toEqual({
        Authorization: 'Bearer mock-api-key',
        'Custom-Header': 'value'
      });
    });

    it('should return a chat model when called as a function', () => {
      const provider = createVenice();
      const modelId = 'llama-3.3-70b';
      const settings = { 
        venice_parameters: { 
          include_venice_system_prompt: true 
        } 
      };

      const model = provider(modelId, settings);
      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('languageModel', () => {
    it('should construct a language model with correct configuration', () => {
      const provider = createVenice();
      const modelId = 'llama-3.3-70b';
      const settings = { 
        venice_parameters: { 
          include_venice_system_prompt: true 
        } 
      };

      const model = provider.languageModel(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('textEmbeddingModel', () => {
    it('should throw NoSuchModelError when attempting to create embedding model', () => {
      const provider = createVenice();

      expect(() => provider.textEmbeddingModel('any-model')).toThrow(
        'No such textEmbeddingModel: any-model',
      );
    });
  });

  describe('chat', () => {
    it('should construct a chat model with correct configuration', () => {
      const provider = createVenice();
      const modelId = 'llama-3.3-70b';
      const settings = { 
        venice_parameters: { 
          include_venice_system_prompt: true 
        } 
      };

      const model = provider.chat(modelId, settings);

      expect(model).toBeInstanceOf(OpenAICompatibleChatLanguageModel);
    });
  });

  describe('imageModel', () => {
    it('should construct an image model with correct configuration', () => {
      const provider = createVenice();
      const modelId = 'fluently-xl';
      const settings = { 
        venice_parameters: { 
          style_preset: 'photographic',
          safe_mode: true,
          num_inference_steps: 30,
          guidance_scale: 7.5
        } 
      };

      const model = provider.imageModel(modelId, settings);

      expect(model).toBeInstanceOf(VeniceAIImageModel);
      const constructorCall = (VeniceAIImageModel as Mock).mock.calls[0];
      const config = constructorCall[2];

      expect(config.provider).toBe('venice.image');
      expect(config.url({ path: '/image/generate' })).toBe(
        'https://api.venice.ai/api/v1/image/generate'
      );
    });

    it('should respect custom configuration for image model', () => {
      const provider = createVenice({
        apiKey: 'custom-key',
        baseURL: 'https://custom.url',
        headers: { 'Custom-Header': 'value' },
      });

      const model = provider.imageModel('fluently-xl');
      const constructorCall = (VeniceAIImageModel as Mock).mock.calls[0];
      const config = constructorCall[2];
      const headers = config.headers();

      expect(config.provider).toBe('venice.image');
      expect(config.url({ path: '/image/generate' })).toBe(
        'https://custom.url/image/generate'
      );
      expect(headers).toEqual({
        Authorization: 'Bearer mock-api-key',
        'Custom-Header': 'value'
      });
    });
  });
});
