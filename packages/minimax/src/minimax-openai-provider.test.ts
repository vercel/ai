import { describe, it, expect, vi } from 'vitest';
import { createMinimax, minimax, minimaxOpenAI } from './minimax-openai-provider';
import type {
  MinimaxProvider,
  MinimaxProviderSettings,
} from './minimax-openai-provider';

describe('minimax provider', () => {
  describe('default instances', () => {
    it('should create default instances', () => {
      expect(minimax).toBeDefined();
      expect(minimaxOpenAI).toBeDefined();
      expect(minimax).not.toBe(minimaxOpenAI);
    });
  });

  describe('model creation', () => {
    it('should create a language model', () => {
      const model = minimax('MiniMax-M2');
      expect(model.provider).toBe('minimax.chat');
      expect(model.modelId).toBe('MiniMax-M2');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should create models via different methods', () => {
      const model1 = minimax('MiniMax-M2');
      const model2 = minimax.chat('MiniMax-M2');
      const model3 = minimax.languageModel('MiniMax-M2');

      expect(model1.provider).toBe(model2.provider);
      expect(model2.provider).toBe(model3.provider);
      expect(model1.modelId).toBe('MiniMax-M2');
    });

    it('should support custom model IDs', () => {
      const model = minimax('custom-model-v1');
      expect(model.modelId).toBe('custom-model-v1');
    });
  });

  describe('custom instances', () => {
    it('should create custom instance with all options', () => {
      const mockFetch = vi.fn();
      const customMinimax = createMinimax({
        apiKey: 'test-key',
        baseURL: 'https://custom.api.com/v1',
        headers: { 'X-Custom': 'value' },
        fetch: mockFetch,
      });

      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
      expect(model.provider).toBe('minimax.chat');
    });

    it('should strip trailing slash from baseURL', () => {
      const customMinimax = createMinimax({
        baseURL: 'https://custom.api.com/',
      });
      const model = customMinimax('MiniMax-M2');
      expect(model).toBeDefined();
    });
  });

  describe('unsupported model types', () => {
    it('should throw NoSuchModelError for unsupported model types', () => {
      expect(() => minimax.textEmbeddingModel('test')).toThrow(/textEmbeddingModel/);
      expect(() => minimax.imageModel('test')).toThrow(/imageModel/);
    });
  });

  describe('type exports', () => {
    it('should export correct types', () => {
      const provider: MinimaxProvider = minimax;
      const settings: MinimaxProviderSettings = {
        apiKey: 'test',
        baseURL: 'https://test.com',
      };
      expect(provider).toBeDefined();
      expect(settings).toBeDefined();
    });
  });

  describe('minimaxOpenAI compatibility', () => {
    it('should work identically to minimax instance', () => {
      const model1 = minimax('MiniMax-M2');
      const model2 = minimaxOpenAI('MiniMax-M2');

      expect(model1.provider).toBe(model2.provider);
      expect(model1.modelId).toBe(model2.modelId);
    });
  });
});

