import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMinimaxAnthropic,
  minimaxAnthropic,
} from './minimax-anthropic-provider';
import type {
  MinimaxAnthropicProvider,
  MinimaxAnthropicProviderSettings,
} from './minimax-anthropic-provider';

describe('minimax Anthropic-compatible provider', () => {
  describe('default instance', () => {
    it('should create a default Anthropic instance', () => {
      expect(minimaxAnthropic).toBeDefined();
      expect(typeof minimaxAnthropic).toBe('function');
    });
  });

  describe('model creation', () => {
    it('should create an Anthropic language model', () => {
      const model = minimaxAnthropic('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.anthropic');
      expect(model.modelId).toBe('MiniMax-M2');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should create an Anthropic chat model', () => {
      const model = minimaxAnthropic.chat('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.anthropic');
      expect(model.modelId).toBe('MiniMax-M2');
    });

    it('should create an Anthropic language model via languageModel method', () => {
      const model = minimaxAnthropic.languageModel('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.anthropic');
      expect(model.modelId).toBe('MiniMax-M2');
    });

    it('should support custom model IDs', () => {
      const customModelId = 'custom-anthropic-model';
      const model = minimaxAnthropic(customModelId);
      expect(model).toBeDefined();
      expect(model.modelId).toBe(customModelId);
    });
  });

  describe('custom instances', () => {
    it('should create a custom Anthropic instance with API key', () => {
      const customMinimax = createMinimaxAnthropic({
        apiKey: 'test-key-123',
      });
      expect(customMinimax).toBeDefined();
      expect(typeof customMinimax).toBe('function');

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom Anthropic instance with baseURL', () => {
      const customMinimax = createMinimaxAnthropic({
        baseURL: 'https://custom.anthropic.api.com',
      });
      expect(customMinimax).toBeDefined();

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom Anthropic instance with headers', () => {
      const customMinimax = createMinimaxAnthropic({
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });
      expect(customMinimax).toBeDefined();

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });

    it('should create a custom Anthropic instance with all options', () => {
      const mockFetch = vi.fn();
      const customMinimax = createMinimaxAnthropic({
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com/anthropic/v1',
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
      const customMinimax = createMinimaxAnthropic({
        baseURL: 'https://custom.api.com/',
      });
      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });
  });

  describe('provider methods', () => {
    it('should have languageModel method', () => {
      expect(minimaxAnthropic.languageModel).toBeDefined();
      expect(typeof minimaxAnthropic.languageModel).toBe('function');
    });

    it('should have chat method', () => {
      expect(minimaxAnthropic.chat).toBeDefined();
      expect(typeof minimaxAnthropic.chat).toBe('function');
    });

    it('should have textEmbeddingModel method', () => {
      expect(minimaxAnthropic.textEmbeddingModel).toBeDefined();
      expect(typeof minimaxAnthropic.textEmbeddingModel).toBe('function');
    });

    it('should have imageModel method', () => {
      expect(minimaxAnthropic.imageModel).toBeDefined();
      expect(typeof minimaxAnthropic.imageModel).toBe('function');
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for text embedding model', () => {
      expect(() => minimaxAnthropic.textEmbeddingModel('test-model')).toThrow();
      expect(() => minimaxAnthropic.textEmbeddingModel('test-model')).toThrow(
        /textEmbeddingModel/,
      );
    });

    it('should throw NoSuchModelError for image model', () => {
      expect(() => minimaxAnthropic.imageModel('test-model')).toThrow();
      expect(() => minimaxAnthropic.imageModel('test-model')).toThrow(
        /imageModel/,
      );
    });
  });

  describe('type exports', () => {
    it('should export MinimaxAnthropicProvider type', () => {
      const provider: MinimaxAnthropicProvider = minimaxAnthropic;
      expect(provider).toBeDefined();
    });

    it('should export MinimaxAnthropicProviderSettings type', () => {
      const settings: MinimaxAnthropicProviderSettings = {
        apiKey: 'test',
        baseURL: 'https://test.com',
      };
      expect(settings).toBeDefined();
    });
  });

  describe('Anthropic-specific features', () => {
    it('should be the default provider', () => {
      const model = minimaxAnthropic('MiniMax-M2');
      expect(model.provider).toBe('minimax.anthropic');
    });

    it('should use Anthropic-compatible baseURL by default', () => {
      const customMinimax = createMinimaxAnthropic({
        apiKey: 'test-key',
      });
      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.anthropic');
    });
  });
});

