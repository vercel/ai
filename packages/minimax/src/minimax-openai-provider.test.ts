import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMinimax, minimax, minimaxOpenAI } from './minimax-openai-provider';
import type {
  MinimaxProvider,
  MinimaxProviderSettings,
} from './minimax-openai-provider';

describe('minimax OpenAI-compatible provider', () => {
  describe('default instances', () => {
    it('should create a default minimax instance', () => {
      expect(minimax).toBeDefined();
      expect(typeof minimax).toBe('function');
    });

    it('should create minimaxOpenAI instance', () => {
      expect(minimaxOpenAI).toBeDefined();
      expect(typeof minimaxOpenAI).toBe('function');
    });

    it('minimax and minimaxOpenAI should be separate instances', () => {
      expect(minimax).not.toBe(minimaxOpenAI);
    });
  });

  describe('model creation', () => {
    it('should create a language model with default call', () => {
      const model = minimax('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.openai.chat');
      expect(model.modelId).toBe('MiniMax-M2');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should create a chat model', () => {
      const model = minimax.chat('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.openai.chat');
      expect(model.modelId).toBe('MiniMax-M2');
    });

    it('should create a language model via languageModel method', () => {
      const model = minimax.languageModel('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.openai.chat');
      expect(model.modelId).toBe('MiniMax-M2');
    });

    it('should support custom model IDs', () => {
      const customModelId = 'custom-model-v1';
      const model = minimax(customModelId);
      expect(model).toBeDefined();
      expect(model.modelId).toBe(customModelId);
    });
  });

  describe('custom instances', () => {
    it('should create a custom instance with API key', () => {
      const customMinimax = createMinimax({
        apiKey: 'test-key-123',
      });
      expect(customMinimax).toBeDefined();
      expect(typeof customMinimax).toBe('function');

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom instance with baseURL', () => {
      const customMinimax = createMinimax({
        baseURL: 'https://custom.api.com',
      });
      expect(customMinimax).toBeDefined();

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom instance with headers', () => {
      const customMinimax = createMinimax({
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });
      expect(customMinimax).toBeDefined();

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom instance with all options', () => {
      const mockFetch = vi.fn();
      const customMinimax = createMinimax({
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com/v1',
        headers: {
          'X-Custom-Header': 'value',
        },
        fetch: mockFetch,
      });

      expect(customMinimax).toBeDefined();
      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should strip trailing slash from baseURL', () => {
      const customMinimax = createMinimax({
        baseURL: 'https://custom.api.com/',
      });
      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });
  });

  describe('provider methods', () => {
    it('should have languageModel method', () => {
      expect(minimax.languageModel).toBeDefined();
      expect(typeof minimax.languageModel).toBe('function');
    });

    it('should have chat method', () => {
      expect(minimax.chat).toBeDefined();
      expect(typeof minimax.chat).toBe('function');
    });

    it('should have textEmbeddingModel method', () => {
      expect(minimax.textEmbeddingModel).toBeDefined();
      expect(typeof minimax.textEmbeddingModel).toBe('function');
    });

    it('should have imageModel method', () => {
      expect(minimax.imageModel).toBeDefined();
      expect(typeof minimax.imageModel).toBe('function');
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for text embedding model', () => {
      expect(() => minimax.textEmbeddingModel('test-model')).toThrow();
      expect(() => minimax.textEmbeddingModel('test-model')).toThrow(
        /textEmbeddingModel/,
      );
    });

    it('should throw NoSuchModelError for image model', () => {
      expect(() => minimax.imageModel('test-model')).toThrow();
      expect(() => minimax.imageModel('test-model')).toThrow(/imageModel/);
    });
  });

  describe('type exports', () => {
    it('should export MinimaxProvider type', () => {
      const provider: MinimaxProvider = minimax;
      expect(provider).toBeDefined();
    });

    it('should export MinimaxProviderSettings type', () => {
      const settings: MinimaxProviderSettings = {
        apiKey: 'test',
        baseURL: 'https://test.com',
      };
      expect(settings).toBeDefined();
    });
  });

  describe('minimaxOpenAI instance', () => {
    it('should work identically to minimax instance', () => {
      const model1 = minimax('MiniMax-M2');
      const model2 = minimaxOpenAI('MiniMax-M2');

      expect(model1.provider).toBe(model2.provider);
      expect(model1.modelId).toBe(model2.modelId);
      expect(model1.specificationVersion).toBe(model2.specificationVersion);
    });
  });
});

